import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const out = '/Users/racio/Documents/ArcheroRemake/analysis/hit-bend';
await mkdir(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--enable-unsafe-webgpu'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.route(/\/src\/main\.ts(?:\?.*)?$/, async (r) => {
    const response = await r.fetch();
    const s = await response.text();
    assert.match(s, /__ARCHERO__:\s*\{/);
    await r.fulfill({
      response,
      body: s.replace(
        /__ARCHERO__:\s*\{/,
        '__ARCHERO__: { testGame: game, testController: controller,',
      ),
    });
  });

  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ARCHERO__?.snapshot?.().ready, {}, { timeout: 120000 });

  await page.locator('#settings-category').selectOption('hit');
  const panelText = await page.locator('#settings-category-hit').innerText();
  assert.match(panelText, /史莱姆 · 水平弯曲/);
  assert.match(panelText, /弯曲 · 成 C 最大幅度/);
  assert.ok(await page.locator('#value-hitBendEnabled').count());
  assert.ok(await page.locator('#value-hitBendMax').count());

  await page.locator('#switch-monster-training').click();
  await page.waitForFunction(
    () =>
      window.__ARCHERO__.snapshot().training === 'monsters' &&
      window.__ARCHERO__.snapshot().feedback?.length >= 1,
    {},
    { timeout: 30000 },
  );

  const before = await page.evaluate(() => {
    const a = window.__ARCHERO__;
    a.pauseForInspection(true);
    // Freeze locomotion / inflation growth so bend deltas are not mixed with fill motion.
    a.testController.settings.monsterSpeed = 0;
    a.testController.settings.slimeInflationEnabled = 0;
    a.testController.settings.slimeInjectionAmount = 0;
    a.stepInspection(0);
    const snap = a.snapshot();
    return {
      models: snap.feedback.map((f) => f.model),
      hitBendEnabled: snap.settings.hitBendEnabled,
      hitBendMax: snap.settings.hitBendMax,
      ids: snap.feedback.map((f) => f.id),
    };
  });
  assert.ok(
    before.models.every((m) => m === 'yellow-slime'),
    `expected yellow-slime, got ${before.models}`,
  );
  assert.equal(before.hitBendEnabled, 1);
  assert.equal(before.hitBendMax, 0.4);

  const sample = await page.evaluate(async () => {
    const a = window.__ARCHERO__;
    const { monsterInstance } = await import('/src/training-monster.ts');
    const id = a.snapshot().feedback[0].id;
    const proxy = a.testGame.feedback.proxies.find((p) => p.userData.practiceTarget === id);
    const root = proxy.parent;
    const inflation = monsterInstance(root).inflation;
    const pos = inflation.bendPositions;
    const base = inflation.bendBase;

    // Compare against post-inflation / pre-bend reference (age≈0 → belly≈0).
    const ref = new Float32Array(pos.array);

    // yBase = rest.y + 1 (PLAN); bendBase is undeformed local.
    const column = (yBaseMin, yBaseMax, against = ref) => {
      const xs = [],
        zs = [];
      for (let i = 0; i < base.count; i++) {
        const yBase = base.getY(i) + 1;
        if (yBase < yBaseMin || yBase > yBaseMax) continue;
        xs.push(pos.getX(i) - against[i * 3]);
        zs.push(pos.getZ(i) - against[i * 3 + 2]);
      }
      return {
        n: xs.length,
        maxAbsX: xs.length ? Math.max(...xs.map(Math.abs)) : 0,
        maxAbsZ: zs.length ? Math.max(...zs.map(Math.abs)) : 0,
      };
    };

    a.testSlimeHit(id);
    // Capture reference after hit apply at age 0 (weights ~0).
    ref.set(pos.array);

    for (let i = 0; i < 12; i++) a.stepInspection(1 / 120);

    const age = a.snapshot().feedback[0].age;
    const face = {
      x: inflation.bendFace.position.x,
      y: inflation.bendFace.position.y,
      z: inflation.bendFace.position.z,
    };
    const foot = column(-0.01, 0.1);
    const peak = column(1.0, 1.3);
    const upper = column(1.4, 1.9);
    const dir = a.snapshot().feedback[0].direction;

    const refFollow = new Float32Array(pos.array);
    for (let i = 0; i < 20; i++) a.stepInspection(1 / 120);
    const followUpper = column(1.4, 1.9, ref);
    const followFace = {
      x: inflation.bendFace.position.x,
      z: inflation.bendFace.position.z,
    };

    return {
      age,
      face,
      foot,
      peak,
      upper,
      followUpper,
      followFace,
      dir,
      refFollowDelta: Math.hypot(
        refFollow[0] - ref[0],
        refFollow[2] - ref[2],
      ),
    };
  });

  assert.ok(
    sample.age !== null && sample.age >= 0.08 && sample.age <= 0.15,
    `age at form peak ~0.1, got ${sample.age}`,
  );
  assert.ok(
    sample.foot.n > 0 && sample.foot.maxAbsX < 0.02 && sample.foot.maxAbsZ < 0.02,
    `foot lock failed: ${JSON.stringify(sample.foot)}`,
  );

  const peakHoriz = Math.hypot(sample.peak.maxAbsX, sample.peak.maxAbsZ);
  assert.ok(peakHoriz > 0.15, `peak bend too small: ${peakHoriz} ${JSON.stringify(sample.peak)}`);
  assert.ok(peakHoriz <= 0.5, `peak bend exceeds slack: ${peakHoriz}`);

  assert.equal(sample.face.y, 0);
  const faceHoriz = Math.hypot(sample.face.x, sample.face.z);
  assert.ok(faceHoriz > 0.1, `face offset too small: ${faceHoriz}`);

  const formUpper = Math.hypot(sample.upper.maxAbsX, sample.upper.maxAbsZ);
  const followUpper = Math.hypot(sample.followUpper.maxAbsX, sample.followUpper.maxAbsZ);
  assert.ok(
    followUpper >= formUpper - 0.02,
    `follow upper should not shrink vs form: form=${formUpper} follow=${followUpper}`,
  );

  await page.locator('#viewport').screenshot({ path: `${out}/form.png` });

  const cleared = await page.evaluate(async () => {
    const a = window.__ARCHERO__;
    const { monsterInstance } = await import('/src/training-monster.ts');
    const id = a.snapshot().feedback[0].id;
    const proxy = a.testGame.feedback.proxies.find((p) => p.userData.practiceTarget === id);
    const inflation = monsterInstance(proxy.parent).inflation;
    const pos = inflation.bendPositions;
    const bent = new Float32Array(pos.array);
    const faceBent = Math.hypot(inflation.bendFace.position.x, inflation.bendFace.position.z);
    a.testController.settings.hitBendEnabled = 0;
    a.stepInspection(0);
    let maxAbs = 0;
    for (let i = 0; i < pos.count; i++) {
      maxAbs = Math.max(
        maxAbs,
        Math.abs(pos.getX(i) - bent[i * 3]),
        Math.abs(pos.getZ(i) - bent[i * 3 + 2]),
      );
    }
    // After clear, positions should differ from bent (bend removed) and face back to 0.
    let vsBase = 0;
    const base = inflation.bendBase;
    for (let i = 0; i < base.count; i++) {
      vsBase = Math.max(
        vsBase,
        Math.abs(pos.getX(i) - base.getX(i)),
        Math.abs(pos.getY(i) - base.getY(i)),
        Math.abs(pos.getZ(i) - base.getZ(i)),
      );
    }
    return {
      face: {
        x: inflation.bendFace.position.x,
        y: inflation.bendFace.position.y,
        z: inflation.bendFace.position.z,
      },
      faceBent,
      maxAbsFromBent: maxAbs,
      vsBase,
    };
  });
  assert.ok(cleared.faceBent > 0.1, 'precondition: was bent before disable');
  assert.ok(
    cleared.maxAbsFromBent > 0.1,
    `disable should change mesh away from bent, delta=${cleared.maxAbsFromBent}`,
  );
  assert.ok(cleared.vsBase < 0.02, `disable should restore undeformed base, vsBase=${cleared.vsBase}`);
  assert.ok(Math.hypot(cleared.face.x, cleared.face.z) < 1e-6);

  await page.locator('#viewport').screenshot({ path: `${out}/cleared.png` });

  await page.evaluate(() => {
    window.__ARCHERO__.testController.settings.hitBendEnabled = 1;
  });
  await page.locator('#switch-locking-training').click();
  await page.waitForFunction(
    () => window.__ARCHERO__.snapshot().training === 'locking',
    {},
    { timeout: 15000 },
  );
  const spider = await page.evaluate(() => {
    const a = window.__ARCHERO__;
    a.pauseForInspection(true);
    const f = a.snapshot().feedback[0];
    const ageBefore = f.age;
    a.testSlimeHit(f.id);
    for (let i = 0; i < 12; i++) a.stepInspection(1 / 120);
    const after = a.snapshot().feedback[0];
    return {
      model: f.model,
      ageBefore,
      age: after.age,
      hasInflation: after.inflation != null,
    };
  });
  assert.equal(spider.model, '3043_01');
  assert.equal(spider.hasInflation, false);
  assert.ok(spider.age !== null && spider.age > 0, 'spider still receives hit response');

  await writeFile(
    `${out}/results.json`,
    JSON.stringify({ before, sample, cleared, spider, errors }, null, 2),
  );

  const real = errors.filter(
    (e) =>
      !/WebGPU|Deprecated|favicon|THREE\.WebGPURenderer|Download the React/i.test(e),
  );
  assert.deepEqual(real, [], `browser errors: ${real.join('\n')}`);

  console.log(
    'PASS hit-bend browser: panel labels, yellow-slime ⊂ bend + foot lock + face offset + disable restore; spider hit without inflation bend',
  );
  console.log(
    JSON.stringify(
      {
        peakHoriz,
        faceHoriz,
        age: sample.age,
        formUpper,
        followUpper,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}

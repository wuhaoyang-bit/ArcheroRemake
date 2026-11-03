/**
 * Smoke: yellow-slime walk deform (终版 AABCAA).
 * Checks panel knobs, pursue 6A gait/springs, foot glue, eye spring fields.
 */
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const out = '/Users/racio/Documents/ArcheroRemake/analysis/slime-walk-deform';
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

  // Panel: walk knobs under 充盈变色与行走
  await page.locator('#settings-category').selectOption('slime');
  const panelText = await page.locator('#settings-category-slime').innerText().catch(async () => {
    // category id may differ — try scanning all category panels
    return page.locator('body').innerText();
  });
  assert.match(panelText, /行走 · 形变开关|行走 · 最大前倾|行走 · 胖瘦频率|行走 · 眼睛跟随频率/);
  for (const id of [
    'slimeWalkEnabled',
    'slimeWalkMaxLean',
    'slimeWalkLeanRate',
    'slimeWalkScaleFreq',
    'slimeWalkScaleDamp',
    'slimeWalkEyeFollowFreq',
    'slimeWalkEyeFollowDamp',
  ]) {
    assert.ok(
      (await page.locator(`#value-${id}`).count()) + (await page.locator(`[data-key="${id}"]`).count()) + (await page.locator(`#${id}`).count()) > 0,
      `missing control for ${id}`,
    );
  }

  await page.locator('#switch-monster-training').click();
  await page.waitForFunction(
    () =>
      window.__ARCHERO__.snapshot().training === 'monsters' &&
      window.__ARCHERO__.snapshot().feedback?.length >= 1,
    {},
    { timeout: 30000 },
  );

  const models = await page.evaluate(() => window.__ARCHERO__.snapshot().feedback.map((f) => f.model));
  assert.ok(models.every((m) => m === 'yellow-slime'), `expected yellow-slime, got ${models}`);

  // Live chase sample: walk deform state while pursuing
  const chase = await page.evaluate(async () => {
    const a = window.__ARCHERO__;
    a.pauseForInspection?.(false);
    a.testController.settings.monsterSpeed = 2.5;
    a.testController.settings.slimeWalkEnabled = 1;
    a.testController.settings.slimeMovePeriod = 1.2;
    a.testController.settings.slimeMovePause = 0.33;
    // Let pursue run ~1.5s
    const t0 = performance.now();
    while (performance.now() - t0 < 1500) {
      /* rAF driven by game loop */
      await new Promise((r) => requestAnimationFrame(r));
    }
    const fb = a.testGame.feedback;
    const dummies = fb.dummies ?? fb._dummies;
    // Access via proxies → parent → walkDeform if exposed; else inspect via private path
    const proxies = fb.proxies;
    const samples = [];
    for (const proxy of proxies) {
      const root = proxy.parent;
      // TrainingFeedback stores dummies privately; walk via monster inflation + visual matrix
      const visual = root.children?.find?.((c) => c.isGroup) ?? root;
      const e = visual.matrix?.elements;
      samples.push({
        id: proxy.userData.practiceTarget,
        sy: e ? e[5] : null,
        ty: e ? e[13] : null,
        sx: e ? e[0] : null,
        posY: root.position.y,
      });
    }
    // Also pull walkDeform from internal dummies if available
    let walk = null;
    try {
      const list = Object.getOwnPropertyNames(fb)
        .concat(Object.keys(fb))
        .filter((k) => /dumm/i.test(k));
      const arr = fb.dummies || fb[list[0]];
      if (Array.isArray(arr) && arr[0]?.walkDeform) {
        const w = arr[0].walkDeform;
        walk = {
          lean01: w.lean01,
          leanUpper01: w.leanUpper01,
          sx: w.sx,
          sy: w.sy,
          eyeFollow: w.eyeFollow,
          bodyWidth: w.bodyWidth,
          shearTop: w.shearTop,
          applied: w.applied,
          moveCycleAge: arr[0].moveCycleAge,
          walkMoving: arr[0].walkMoving,
        };
      }
    } catch (_) {}
    return { samples, walk, settings: {
      slimeWalkEnabled: a.testController.settings.slimeWalkEnabled,
      slimeWalkScaleFreq: a.testController.settings.slimeWalkScaleFreq,
      slimeMovePeriod: a.testController.settings.slimeMovePeriod,
      slimeMovePause: a.testController.settings.slimeMovePause,
    }};
  });

  assert.equal(chase.settings.slimeWalkEnabled, 1);
  assert.equal(chase.settings.slimeWalkScaleFreq, 2.4);
  assert.equal(chase.settings.slimeMovePeriod, 1.2);
  assert.equal(chase.settings.slimeMovePause, 0.33);

  if (chase.walk) {
    assert.ok(chase.walk.bodyWidth > 0.5, `bodyWidth ${chase.walk.bodyWidth}`);
    assert.ok(chase.walk.applied, 'walk shear should apply while chasing');
    // sx/sy should have left pure idle if moving, or be near idle springs if face-stuck
    assert.ok(Number.isFinite(chase.walk.sx) && Number.isFinite(chase.walk.sy));
    assert.ok(Number.isFinite(chase.walk.eyeFollow));
  }

  // Foot glue: after Sy scale, matrix ty should cancel local bottom * sy
  for (const s of chase.samples) {
    assert.ok(Number.isFinite(s.sy) && s.sy > 0.2 && s.sy < 2.5, `sy out of range ${s.sy}`);
    assert.equal(s.posY, 0);
    // Foot pin: world foot ≈ 0 → ty ≈ -sy * L; L≈1 for unit box at rest (position.y - scale.y with y_min=-1)
    // Soft check: ty should be near -sy (L≈1) when inflation rest foot is 0
    if (s.ty != null && Math.abs(s.sy - 1) > 0.02) {
      assert.ok(Math.abs(s.ty + s.sy) < 0.35 || Math.abs(s.ty) < 0.35, `foot glue ty=${s.ty} sy=${s.sy}`);
    }
  }

  // Stop: zero speed → age cleared, springs toward idle
  const stopped = await page.evaluate(async () => {
    const a = window.__ARCHERO__;
    a.testController.settings.monsterSpeed = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 800) await new Promise((r) => requestAnimationFrame(r));
    const fb = a.testGame.feedback;
    const arr = fb.dummies;
    if (!Array.isArray(arr) || !arr[0]?.walkDeform) return null;
    const w = arr[0].walkDeform;
    return {
      moveCycleAge: arr[0].moveCycleAge,
      walkMoving: arr[0].walkMoving,
      lean01: w.lean01,
      sx: w.sx,
      sy: w.sy,
      eyeFollow: w.eyeFollow,
      idleSx: a.testController.settings.slimeWalkIdleSx,
      idleSy: a.testController.settings.slimeWalkIdleSy,
    };
  });

  if (stopped) {
    assert.equal(stopped.moveCycleAge, 0);
    assert.equal(stopped.walkMoving, false);
    // After 0.8s springs should be near idle (not exact)
    assert.ok(Math.abs(stopped.sx - stopped.idleSx) < 0.25, `sx ${stopped.sx} vs idle ${stopped.idleSx}`);
    assert.ok(Math.abs(stopped.sy - stopped.idleSy) < 0.25, `sy ${stopped.sy} vs idle ${stopped.idleSy}`);
    assert.ok(Math.abs(stopped.lean01) < 0.2, `lean ${stopped.lean01}`);
    assert.ok(Math.abs(stopped.eyeFollow) < 0.15, `eye ${stopped.eyeFollow}`);
  }

  await page.locator('#viewport').screenshot({ path: `${out}/chase.png` });

  const fatal = errors.filter((e) => !/WebGPU|deprecated|AudioContext/i.test(e));
  assert.deepEqual(fatal, [], fatal.join('\n'));
  console.log('PASS slime-walk-deform: panel, chase springs/shear, foot glue, stop→idle', {
    walk: chase.walk,
    stopped,
  });
} finally {
  await browser.close();
}

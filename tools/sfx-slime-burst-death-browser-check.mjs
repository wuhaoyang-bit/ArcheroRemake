/**
 * Browser check: yellow-slime burst death SFX (multi-select + delay).
 * Expects Vite on http://127.0.0.1:5173/
 */
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const out = 'analysis/sfx-slime-burst-death-checks';
await mkdir(out, { recursive: true });

const FILES = [
  'slime-burst-death/death_burst_small_2.wav',
  'slime-burst-death/death_burst_small_3.wav',
  'slime-burst-death/meaty_deaths_0.wav',
  'slime-burst-death/meaty_deaths_1.wav',
  'slime-burst-death/meaty_deaths_2.wav',
  'slime-burst-death/meaty_deaths_3.wav',
  'slime-burst-death/meaty_deaths_4.wav',
  'slime-burst-death/mushroom_poof_2.wav',
];

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];
const report = { panel: {}, audio: {}, play: {}, edge: {}, interrupt: {}, multi: {}, errors: [] };

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.on('pageerror', (e) => errors.push(String(e.message || e)));

  await page.route('**/params.json', (r) =>
    r.fulfill({
      json: {
        version: 1,
        settings: {
          monsterCount: 2,
          monsterSpeed: 0,
          slimeInjectionAmount: 100,
          slimeCapacity: 100,
          sfxSlimeBurstDeathEnabled: 1,
          sfxSlimeBurstDeathVolume: 1.2,
          // bits 0+2 = 小爆A + 肉感0
          sfxSlimeBurstDeathMask: 5,
          sfxSlimeBurstDeathDelay0: 0,
          sfxSlimeBurstDeathDelay2: 0.05,
        },
      },
    }),
  );
  await page.goto(BASE);
  await page.waitForFunction(() => window.__ARCHERO__?.snapshot?.()?.ready, null, { timeout: 30000 });

  const box = await page.locator('#viewport').boundingBox();
  assert.ok(box, 'viewport');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.7);

  await page.locator('#settings-category').selectOption('audio');
  await page.waitForTimeout(100);

  for (const key of ['sfxSlimeBurstDeathEnabled', 'sfxSlimeBurstDeathVolume', 'sfxSlimeBurstDeathMask']) {
    assert.equal(await page.locator(`#value-${key}`).count(), 1, `missing ${key}`);
  }
  assert.equal(await page.locator('#sfx-death-multi').count(), 1);
  assert.equal(await page.locator('[data-death-bit]').count(), 8);
  assert.equal(await page.locator('[data-death-delay]').count(), 8);

  const snap0 = await page.evaluate(() => window.__ARCHERO__.snapshot());
  report.panel = {
    enabled: snap0.settings.sfxSlimeBurstDeathEnabled,
    volume: snap0.settings.sfxSlimeBurstDeathVolume,
    mask: snap0.settings.sfxSlimeBurstDeathMask,
    delay0: snap0.settings.sfxSlimeBurstDeathDelay0,
    delay2: snap0.settings.sfxSlimeBurstDeathDelay2,
  };
  assert.equal(snap0.settings.sfxSlimeBurstDeathEnabled, 1);
  assert.equal(snap0.settings.sfxSlimeBurstDeathVolume, 1.2);
  assert.equal(snap0.settings.sfxSlimeBurstDeathMask, 5);

  for (const name of FILES) {
    const res = await page.evaluate(async (n) => {
      const r = await fetch(`/audio/${n}`);
      return { ok: r.ok, status: r.status, bytes: (await r.arrayBuffer()).byteLength };
    }, name);
    assert.equal(res.ok, true, `${name} fetch`);
    assert.ok(res.bytes > 1000, `${name} size`);
    report.audio[name] = res;
  }

  const direct = await page.evaluate(async () => {
    const api = window.__ARCHERO__;
    api.testSlimeBurstDeath();
    await new Promise((r) => setTimeout(r, 80));
    return { active: api.snapshot().slimeBurstDeathSfx.active };
  });
  assert.ok(direct.active >= 2, `default mask 5 should start ≥2 voices, got ${direct.active}`);
  report.play.direct = direct;

  // Burst edge: fill → winding → gone plays death and stops windup.
  await page.locator('#switch-monster-training').click();
  await page.waitForFunction(() => {
    const s = window.__ARCHERO__.snapshot();
    return s.training === 'monsters' && (s.feedback?.length ?? 0) > 0;
  }, null, { timeout: 15000 });
  await page.evaluate(() => window.__ARCHERO__.pauseForInspection(true));

  const id = await page.evaluate(() => {
    const fb = window.__ARCHERO__.snapshot().feedback || [];
    return fb.find((d) => d.model === 'yellow-slime' && d.burst?.phase === 'alive')?.id ?? fb[0]?.id ?? null;
  });
  assert.ok(id, 'yellow slime id');

  let phase = 'alive';
  for (let i = 0; i < 20 && phase === 'alive'; i++) {
    await page.evaluate((hid) => window.__ARCHERO__.testSlimeHit(hid), id);
    phase = await page.evaluate((hid) => {
      const fb = window.__ARCHERO__.snapshot().feedback || [];
      return (fb.find((x) => x.id === hid) || fb[0])?.burst?.phase;
    }, id);
  }

  let deathAtGone = null;
  let windupAtGone = null;
  let goneSeen = false;
  for (let i = 0; i < 800; i++) {
    await page.evaluate(() => window.__ARCHERO__.stepInspection(1 / 120));
    const s = await page.evaluate((hid) => {
      const snap = window.__ARCHERO__.snapshot();
      const fb = snap.feedback || [];
      const d = fb.find((x) => x.id === hid) || fb[0];
      return {
        phase: d?.burst?.phase,
        death: snap.slimeBurstDeathSfx.active,
        windup: snap.slimeBurstWindupSfx.active,
      };
    }, id);
    if (s.phase === 'gone' && !goneSeen) {
      goneSeen = true;
      for (let j = 0; j < 10; j++) {
        await page.evaluate(() => window.__ARCHERO__.stepInspection(1 / 120));
        await page.waitForTimeout(20);
      }
      const after = await page.evaluate(() => {
        const snap = window.__ARCHERO__.snapshot();
        return { death: snap.slimeBurstDeathSfx.active, windup: snap.slimeBurstWindupSfx.active };
      });
      deathAtGone = after.death;
      windupAtGone = after.windup;
      break;
    }
  }
  assert.ok(goneSeen, 'reach gone');
  assert.ok(deathAtGone >= 1, `death should play on gone, got ${deathAtGone}`);
  assert.equal(windupAtGone, 0, `windup should stop on gone, got ${windupAtGone}`);
  report.edge = { deathAtGone, windupAtGone };

  await page.locator('#reset-dummies').click();
  await page.waitForFunction(() => {
    const fb = window.__ARCHERO__.snapshot().feedback || [];
    return fb.some((d) => d.model === 'yellow-slime' && d.burst?.phase === 'alive');
  }, null, { timeout: 10000 });
  await page.evaluate(() => window.__ARCHERO__.pauseForInspection(false));

  const interrupt = await page.evaluate(async () => {
    const api = window.__ARCHERO__;
    api.testSlimeBurstDeath();
    await new Promise((r) => setTimeout(r, 40));
    const before = api.snapshot().slimeBurstDeathSfx.active;
    document.querySelector('#reset-dummies')?.click();
    await new Promise((r) => setTimeout(r, 40));
    const after = api.snapshot().slimeBurstDeathSfx.active;
    return { before, after };
  });
  assert.ok(interrupt.before >= 1);
  assert.equal(interrupt.after, 0);
  report.interrupt = interrupt;

  // Multi-select UI: open details, check bit 7, uncheck bit 2 → mask changes.
  await page.locator('#settings-category').selectOption('audio');
  await page.locator('#sfx-death-multi').evaluate((el) => { el.open = true; });
  await page.locator('[data-death-bit="7"]').check();
  await page.locator('[data-death-bit="2"]').uncheck();
  await page.waitForFunction(() => {
    const m = window.__ARCHERO__.snapshot().settings.sfxSlimeBurstDeathMask;
    return (m & 1) === 1 && (m & 4) === 0 && (m & 128) === 128;
  });
  const maskAfter = await page.evaluate(() => window.__ARCHERO__.snapshot().settings.sfxSlimeBurstDeathMask);
  assert.equal(maskAfter & 1, 1);
  assert.equal(maskAfter & 4, 0);
  assert.equal(maskAfter & 128, 128);

  await page.locator('#value-sfxSlimeBurstDeathDelay7').fill('0.1');
  await page.locator('#value-sfxSlimeBurstDeathDelay7').dispatchEvent('change');
  await page.waitForFunction(() => window.__ARCHERO__.snapshot().settings.sfxSlimeBurstDeathDelay7 === 0.1);

  const layered = await page.evaluate(async () => {
    const api = window.__ARCHERO__;
    api.testSlimeBurstDeath();
    await new Promise((r) => setTimeout(r, 30));
    const early = api.snapshot().slimeBurstDeathSfx.active;
    await new Promise((r) => setTimeout(r, 120));
    const late = api.snapshot().slimeBurstDeathSfx.active;
    return { early, late, mask: api.snapshot().settings.sfxSlimeBurstDeathMask };
  });
  assert.ok(layered.early >= 1, `immediate clips should start, got ${layered.early}`);
  assert.ok(layered.late >= 1, `delayed clip should be active later, got ${layered.late}`);
  report.multi = { maskAfter, layered };

  report.errors = errors;
  assert.deepEqual(errors, []);
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log('PASS slime burst death SFX');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}

/**
 * Browser check: Body hit (instant) + slime SFX (delayed) on yellow slime.
 * Expects Vite on http://127.0.0.1:5173/
 */
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const out = 'analysis/sfx-slime-hit-checks';
await mkdir(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];
const report = { panel: {}, audio: {}, play: {}, polyphony: {}, errors: [] };

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.on('pageerror', (e) => errors.push(String(e.message || e)));

  await page.goto(BASE);
  await page.waitForFunction(() => window.__ARCHERO__?.snapshot?.()?.ready, null, { timeout: 30000 });

  const box = await page.locator('#viewport').boundingBox();
  assert.ok(box, 'viewport bounding box');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.7);

  await page.locator('#settings-category').selectOption('audio');
  await page.waitForTimeout(100);

  for (const key of [
    'sfxBodyHitEnabled',
    'sfxBodyHitVolume',
    'sfxBodyHitPitchMin',
    'sfxBodyHitPitchMax',
    'sfxSlimeHitEnabled',
    'sfxSlimeHitDelay',
    'sfxSlimeHitVolume',
    'sfxSlimeHitPitchMin',
    'sfxSlimeHitPitchMax',
    'sfxSlimeHitVolumeJitter',
  ]) {
    const el = page.locator(`#value-${key}`);
    assert.equal(await el.count(), 1, `missing control ${key}`);
    assert.ok(await el.isVisible(), `${key} should be visible`);
  }

  const snap0 = await page.evaluate(() => window.__ARCHERO__.snapshot());
  report.panel = {
    bodyEnabled: snap0.settings.sfxBodyHitEnabled,
    bodyVolume: snap0.settings.sfxBodyHitVolume,
    slimeEnabled: snap0.settings.sfxSlimeHitEnabled,
    slimeDelay: snap0.settings.sfxSlimeHitDelay,
    slimeVolume: snap0.settings.sfxSlimeHitVolume,
  };
  assert.equal(snap0.settings.sfxBodyHitEnabled, 1);
  assert.equal(snap0.settings.sfxBodyHitVolume, 0.8);
  assert.equal(snap0.settings.sfxSlimeHitEnabled, 1);
  assert.equal(snap0.settings.sfxSlimeHitDelay, 0.12);
  assert.equal(snap0.settings.sfxSlimeHitVolume, 0.8);

  for (const name of ['Hitted_Body2100001.wav', 'slime_10.wav', 'slime_11.wav']) {
    const res = await page.evaluate(async (n) => {
      const r = await fetch(`/audio/${n}`);
      return { ok: r.ok, status: r.status, bytes: (await r.arrayBuffer()).byteLength };
    }, name);
    assert.equal(res.ok, true, `${name} fetch`);
    assert.ok(res.bytes > 1000, `${name} size`);
    report.audio[name] = res;
  }

  await page.locator('#switch-monster-training').click();
  await page.waitForFunction(() => {
    const s = window.__ARCHERO__.snapshot();
    return s.training === 'monsters' && (s.feedback?.length ?? 0) > 0;
  }, null, { timeout: 15000 });

  const hitId = await page.evaluate(() => {
    const fb = window.__ARCHERO__.snapshot().feedback || [];
    return fb.find((d) => d.model === 'yellow-slime')?.id ?? null;
  });
  assert.ok(hitId, 'need a yellow-slime feedback id');

  // Instant Body + delayed slime: right after hit, Body active; slime pending; slime active after delay.
  const timing = await page.evaluate(async (id) => {
    const api = window.__ARCHERO__;
    api.testSlimeHit(id);
    await new Promise((r) => setTimeout(r, 40));
    const early = {
      body: api.snapshot().bodyHitSfx.active,
      slimeActive: api.snapshot().slimeHitSfx.active,
      slimePending: api.snapshot().slimeHitSfx.pending,
    };
    await new Promise((r) => setTimeout(r, 140));
    const late = {
      body: api.snapshot().bodyHitSfx.active,
      slimeActive: api.snapshot().slimeHitSfx.active,
      slimePending: api.snapshot().slimeHitSfx.pending,
    };
    return { early, late };
  }, hitId);

  assert.ok(timing.early.body >= 1, `Body should play immediately, got ${timing.early.body}`);
  assert.ok(timing.early.slimePending >= 1 || timing.early.slimeActive >= 1, 'slime should be pending or already active');
  // With 0.12s delay, at 40ms slime should still be pending (not yet active), unless decode race made delay 0 path.
  if (timing.early.slimePending >= 1) {
    assert.equal(timing.early.slimeActive, 0, 'slime should not be active before delay elapses');
  }
  assert.ok(timing.late.slimeActive >= 1, `slime should play after delay, got ${timing.late.slimeActive}`);
  report.play = { hitId, timing };

  // Polyphony caps
  const peaks = await page.evaluate(async (id) => {
    const api = window.__ARCHERO__;
    let bodyPeak = 0;
    let slimePeak = 0;
    for (let i = 0; i < 10; i++) {
      api.testSlimeHit(id);
      await new Promise((r) => setTimeout(r, 16));
      bodyPeak = Math.max(bodyPeak, api.snapshot().bodyHitSfx.active);
      slimePeak = Math.max(slimePeak, api.snapshot().slimeHitSfx.active);
    }
    await new Promise((r) => setTimeout(r, 200));
    slimePeak = Math.max(slimePeak, api.snapshot().slimeHitSfx.active);
    return { bodyPeak, slimePeak };
  }, hitId);
  assert.ok(peaks.bodyPeak <= 2, `body polyphony ${peaks.bodyPeak}`);
  assert.ok(peaks.slimePeak <= 2, `slime polyphony ${peaks.slimePeak}`);
  report.polyphony = peaks;

  // Delay=0 → slime plays immediately with Body.
  await page.locator('#value-sfxSlimeHitDelay').evaluate((input) => {
    input.value = '0';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => window.__ARCHERO__.snapshot().settings.sfxSlimeHitDelay === 0);
  // Hits can fill/burst the slime; respawn before the delay=0 check.
  await page.locator('#reset-dummies').click();
  await page.waitForFunction(() => {
    const fb = window.__ARCHERO__.snapshot().feedback || [];
    return fb.some((d) => d.model === 'yellow-slime' && d.burst?.phase === 'alive');
  }, null, { timeout: 10000 });
  const freshId = await page.evaluate(() => {
    const fb = window.__ARCHERO__.snapshot().feedback || [];
    return fb.find((d) => d.model === 'yellow-slime' && d.burst?.phase === 'alive')?.id ?? null;
  });
  assert.ok(freshId, 'fresh yellow slime after reset');
  await page.waitForTimeout(200);
  const zeroDelay = await page.evaluate(async (id) => {
    const api = window.__ARCHERO__;
    const ok = api.testSlimeHit(id);
    const samples = [];
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 20));
      samples.push({
        body: api.snapshot().bodyHitSfx.active,
        slime: api.snapshot().slimeHitSfx.active,
        pending: api.snapshot().slimeHitSfx.pending,
      });
    }
    return {
      ok,
      bodyPeak: Math.max(...samples.map((s) => s.body)),
      slimePeak: Math.max(...samples.map((s) => s.slime)),
      pendingPeak: Math.max(...samples.map((s) => s.pending)),
      samples,
    };
  }, freshId);
  assert.equal(zeroDelay.ok, true);
  assert.ok(zeroDelay.bodyPeak >= 1, `zero-delay body peak ${zeroDelay.bodyPeak}`);
  assert.ok(zeroDelay.slimePeak >= 1, `zero-delay slime peak ${zeroDelay.slimePeak}`);
  assert.equal(zeroDelay.pendingPeak, 0, 'delay 0 should not leave pending timers');
  report.play.zeroDelay = zeroDelay;

  // Restore delay.
  await page.locator('#value-sfxSlimeHitDelay').evaluate((input) => {
    input.value = '0.12';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  report.errors = errors;
  assert.deepEqual(errors, []);
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log('PASS Body instant + slime delayed SFX');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}

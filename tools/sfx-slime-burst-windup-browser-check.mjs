/**
 * Browser check: yellow-slime winding windup SFX.
 * Plays once on feedback→winding; stop on gone / reset; variant select 1–4.
 * Expects Vite on http://127.0.0.1:5173/
 */
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const out = 'analysis/sfx-slime-burst-windup-checks';
await mkdir(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];
const report = { panel: {}, audio: {}, play: {}, interrupt: {}, variants: {}, errors: [] };

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
          sfxSlimeBurstWindupEnabled: 1,
          sfxSlimeBurstWindupVariant: 1,
          sfxSlimeBurstWindupVolume: 0.85,
          sfxSlimeBurstWindupPitchMin: 0,
          sfxSlimeBurstWindupPitchMax: 0,
        },
      },
    }),
  );
  await page.goto(BASE);
  await page.waitForFunction(() => window.__ARCHERO__?.snapshot?.()?.ready, null, { timeout: 30000 });

  const box = await page.locator('#viewport').boundingBox();
  assert.ok(box, 'viewport bounding box');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.7);

  await page.locator('#settings-category').selectOption('audio');
  await page.waitForTimeout(100);

  for (const key of [
    'sfxSlimeBurstWindupEnabled',
    'sfxSlimeBurstWindupVariant',
    'sfxSlimeBurstWindupVolume',
    'sfxSlimeBurstWindupPitchMin',
    'sfxSlimeBurstWindupPitchMax',
  ]) {
    const el = page.locator(`#value-${key}`);
    assert.equal(await el.count(), 1, `missing control ${key}`);
    assert.ok(await el.isVisible(), `${key} should be visible`);
  }

  const variantSelect = page.locator('#value-sfxSlimeBurstWindupVariant');
  const options = await variantSelect.locator('option').allTextContents();
  assert.deepEqual(options, ['1 · 咕噜 A', '2 · 咕噜 B', '3 · 倾倒', '4 · 吸血感']);

  const snap0 = await page.evaluate(() => window.__ARCHERO__.snapshot());
  report.panel = {
    enabled: snap0.settings.sfxSlimeBurstWindupEnabled,
    variant: snap0.settings.sfxSlimeBurstWindupVariant,
    volume: snap0.settings.sfxSlimeBurstWindupVolume,
    pitchMin: snap0.settings.sfxSlimeBurstWindupPitchMin,
    pitchMax: snap0.settings.sfxSlimeBurstWindupPitchMax,
    options,
  };
  assert.equal(snap0.settings.sfxSlimeBurstWindupEnabled, 1);
  assert.equal(snap0.settings.sfxSlimeBurstWindupVariant, 1);
  assert.equal(snap0.settings.sfxSlimeBurstWindupVolume, 0.85);

  for (const name of [
    'slime-burst-windup/windup_gurg_a.wav',
    'slime-burst-windup/windup_gurg_b.wav',
    'slime-burst-windup/windup_pour.wav',
    'slime-burst-windup/windup_vamp.wav',
  ]) {
    const res = await page.evaluate(async (n) => {
      const r = await fetch(`/audio/${n}`);
      return { ok: r.ok, status: r.status, bytes: (await r.arrayBuffer()).byteLength };
    }, name);
    assert.equal(res.ok, true, `${name} fetch`);
    assert.ok(res.bytes > 1000, `${name} size`);
    report.audio[name] = res;
  }

  // Direct play via test helper (user-gesture already unlocked AudioContext).
  const direct = await page.evaluate(async () => {
    const api = window.__ARCHERO__;
    api.testSlimeBurstWindup();
    await new Promise((r) => setTimeout(r, 60));
    const active = api.snapshot().slimeBurstWindupSfx.active;
    return { active };
  });
  assert.ok(direct.active >= 1, `testSlimeBurstWindup should start a voice, got ${direct.active}`);
  report.play.direct = direct;

  // Stop via stop path used on burst/reset: call play then reset-dummies after entering monsters.
  await page.locator('#switch-monster-training').click();
  await page.waitForFunction(() => {
    const s = window.__ARCHERO__.snapshot();
    return s.training === 'monsters' && (s.feedback?.length ?? 0) > 0;
  }, null, { timeout: 15000 });

  // Fill→feedback→winding edge should play once.
  await page.evaluate(() => window.__ARCHERO__.pauseForInspection(true));
  // High injection so one hit fills to capacity and enters feedback.
  await page.locator('#value-slimeInjectionAmount').evaluate((input) => {
    if (!input) return;
    input.value = '100';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }).catch(() => {});
  // Capacity may already be 100; ensure fill settings if present.
  await page.evaluate(() => {
    const api = window.__ARCHERO__;
    // Soft-set via settings if keys exist in DOM; otherwise rely on defaults.
    const inj = document.querySelector('#value-slimeInjectionAmount');
    const cap = document.querySelector('#value-slimeCapacity');
    if (inj) {
      inj.value = '100';
      inj.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (cap) {
      cap.value = '100';
      cap.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  const id = await page.evaluate(() => {
    const fb = window.__ARCHERO__.snapshot().feedback || [];
    return fb.find((d) => d.model === 'yellow-slime' && d.burst?.phase === 'alive')?.id
      ?? fb[0]?.id
      ?? null;
  });
  assert.ok(id, 'need a yellow slime id');

  await page.evaluate((hid) => window.__ARCHERO__.testSlimeHit(hid), id);
  let phase = await page.evaluate((hid) => {
    const fb = window.__ARCHERO__.snapshot().feedback || [];
    const d = fb.find((x) => x.id === hid) || fb[0];
    return d?.burst?.phase;
  }, id);
  // If still alive, spam hits until feedback.
  for (let i = 0; i < 20 && phase === 'alive'; i++) {
    await page.evaluate((hid) => window.__ARCHERO__.testSlimeHit(hid), id);
    phase = await page.evaluate((hid) => {
      const fb = window.__ARCHERO__.snapshot().feedback || [];
      const d = fb.find((x) => x.id === hid) || fb[0];
      return d?.burst?.phase;
    }, id);
  }

  let windingActive = 0;
  let windingSeen = false;
  let goneActive = null;
  for (let i = 0; i < 800; i++) {
    await page.evaluate(() => window.__ARCHERO__.stepInspection(1 / 120));
    const s = await page.evaluate((hid) => {
      const snap = window.__ARCHERO__.snapshot();
      const fb = snap.feedback || [];
      const d = fb.find((x) => x.id === hid) || fb[0];
      return {
        phase: d?.burst?.phase,
        active: snap.slimeBurstWindupSfx.active,
      };
    }, id);
    if (s.phase === 'winding' && !windingSeen) {
      windingSeen = true;
      // Give decode/start a couple frames.
      for (let j = 0; j < 8; j++) {
        await page.evaluate(() => window.__ARCHERO__.stepInspection(1 / 120));
        await page.waitForTimeout(16);
      }
      windingActive = await page.evaluate(() => window.__ARCHERO__.snapshot().slimeBurstWindupSfx.active);
    }
    if (s.phase === 'gone') {
      await page.waitForTimeout(30);
      goneActive = await page.evaluate(() => window.__ARCHERO__.snapshot().slimeBurstWindupSfx.active);
      break;
    }
  }
  assert.ok(windingSeen, 'should reach winding');
  assert.ok(windingActive >= 1, `windup should play on winding edge, got active=${windingActive}`);
  assert.ok(goneActive !== null, 'should reach gone');
  assert.equal(goneActive, 0, `windup should stop on gone, got active=${goneActive}`);
  report.play.edge = { windingActive, goneActive };

  // Reset interrupt: play then resetDummies.
  await page.locator('#reset-dummies').click();
  await page.waitForFunction(() => {
    const fb = window.__ARCHERO__.snapshot().feedback || [];
    return fb.some((d) => d.model === 'yellow-slime' && d.burst?.phase === 'alive');
  }, null, { timeout: 10000 });
  await page.evaluate(() => window.__ARCHERO__.pauseForInspection(false));

  const interrupt = await page.evaluate(async () => {
    const api = window.__ARCHERO__;
    api.testSlimeBurstWindup();
    await new Promise((r) => setTimeout(r, 40));
    const before = api.snapshot().slimeBurstWindupSfx.active;
    document.querySelector('#reset-dummies')?.click();
    await new Promise((r) => setTimeout(r, 40));
    const after = api.snapshot().slimeBurstWindupSfx.active;
    return { before, after };
  });
  assert.ok(interrupt.before >= 1, `play before reset, got ${interrupt.before}`);
  assert.equal(interrupt.after, 0, `reset should stop windup, got ${interrupt.after}`);
  report.interrupt = interrupt;

  // Variant switching: select each option and play; active should rise for each.
  await page.locator('#settings-category').selectOption('audio');
  const variantResults = [];
  for (const v of [1, 2, 3, 4]) {
    await variantSelect.selectOption(String(v));
    await page.waitForFunction(
      (want) => window.__ARCHERO__.snapshot().settings.sfxSlimeBurstWindupVariant === want,
      v,
    );
    const r = await page.evaluate(async () => {
      const api = window.__ARCHERO__;
      api.testSlimeBurstWindup();
      await new Promise((t) => setTimeout(t, 50));
      return {
        variant: api.snapshot().settings.sfxSlimeBurstWindupVariant,
        active: api.snapshot().slimeBurstWindupSfx.active,
      };
    });
    assert.equal(r.variant, v);
    assert.ok(r.active >= 1, `variant ${v} should play`);
    variantResults.push(r);
  }
  report.variants = variantResults;

  report.errors = errors;
  assert.deepEqual(errors, []);
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log('PASS slime burst windup SFX');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}

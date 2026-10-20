import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const out = new URL('../analysis/turn-model-checks/', import.meta.url);
await mkdir(out, { recursive: true });
// Route every parameter request: never overwrite the user's tuned file.
let saved = { version: 1, settings: { turnModel: 2, turnSpeed: 1210,
  turnCurve: [{ angle: 0, speed: 260 }, { angle: 30, speed: 1215 }, { angle: 180, speed: 1720 }],
  turnResponse: 17.6, velocitySmoothTime: .04426 } };
const curve = structuredClone(saved.settings.turnCurve);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-webgpu'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/params.json', route => route.fulfill({ json: saved }));
  await page.route('**/__save-params', async route => {
    saved = route.request().postDataJSON(); await route.fulfill({ json: { ok: true } });
  });
  await page.goto(process.env.BASE_URL || 'http://localhost:5173');
  const ready = () => page.waitForFunction(() => window.__ARCHERO__?.snapshot().ready);
  await ready();
  const snapshot = () => page.evaluate(() => window.__ARCHERO__.snapshot());
   assert.deepEqual(await page.locator('#turn-model option').evaluateAll(options => options.map(o => o.value)), ['0', '2', '5', '6', '7']);
  assert.equal(await page.locator('#turn-model').inputValue(), '2');
  assert.deepEqual((await snapshot()).settings.turnCurve, curve);
  for (const [model, field, initial, tuned] of [['5','slerpResponse','40.872','30'], ['6','smoothTime','0.03039','0.04']]) {
    await page.locator('#turn-model').selectOption(model);
    assert.equal(await page.locator('#value-' + field).inputValue(), initial);
    assert.ok(await page.locator('#value-' + field).isVisible());
    assert.equal(await page.locator('#slider-turnSpeed').isVisible(), false);
    await page.locator('#value-' + field).fill(tuned);
    await page.locator('#value-' + field).press('Tab');
    await page.locator('#save-settings').click();
    await page.waitForFunction(() => document.querySelector('#store-status').textContent.includes('已写入'));
    await page.reload(); await ready();
    assert.equal(await page.locator('#turn-model').inputValue(), model);
    assert.equal(await page.locator('#value-' + field).inputValue(), tuned);
  }
  const all = (await snapshot()).settings;
  assert.equal(all.turnSpeed, 1210); assert.deepEqual(all.turnCurve, curve);
  assert.equal(all.slerpResponse, 30); assert.equal(all.smoothTime, .04);
  assert.equal('turnResponse' in saved.settings, false);
  assert.equal('velocitySmoothTime' in saved.settings, false);
  const r = await page.locator('#viewport').boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height * .65); await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2 + 70, r.y + r.height * .65);
  const pair = await page.evaluate(() => {
    const before = window.__ARCHERO__.snapshot();
    const select = document.querySelector('#turn-model'); select.value = '5'; select.dispatchEvent(new Event('change'));
    return { before, after: window.__ARCHERO__.snapshot() };
  });
  for (const key of ['heading', 'position', 'offset', 'pointerId', 'mode']) assert.deepEqual(pair.after[key], pair.before[key]);
  await page.mouse.up();
  await page.screenshot({ path: new URL('desktop.png', out).pathname, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.locator('#open-settings').click();
  for (const [model, field] of [['5', 'slerpResponse'], ['6', 'smoothTime']]) {
    await page.locator('#turn-model').selectOption(model);
    await page.locator('#value-' + field).scrollIntoViewIfNeeded();
    assert.ok(await page.locator('#value-' + field).isVisible());
  }
  await page.screenshot({ path: new URL('mobile.png', out).pathname });
  assert.deepEqual(errors, []);
  await writeFile(new URL('results.json', out), JSON.stringify({ passed: true, saved, errors }, null, 2));
   console.log('PASS: five model options, preserved curve, isolated JSON save/reload, in-gesture switching and mobile controls.');
} finally { await browser.close(); }

import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const out = new URL('../analysis/turn-model-checks/', import.meta.url);
await mkdir(out, { recursive: true });
// Isolate browser persistence from the user's real tuning file. The HTTP server
// and JSON disk roundtrip are separately covered by settings.test.ts.
let saved = JSON.parse(await readFile(new URL('../public/params.json', import.meta.url), 'utf8'));
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
  await page.waitForFunction(() => window.__ARCHERO__?.snapshot().ready);
  const snapshot = () => page.evaluate(() => window.__ARCHERO__.snapshot());
  assert.equal(await page.locator('#turn-model').inputValue(), '0');
  assert.equal((await snapshot()).settings.turnSpeed, 1200);
  assert.equal(await page.locator('#slider-turnResponse').isVisible(), false);
  await page.locator('#turn-model').selectOption('1');
  assert.equal(await page.locator('#slider-turnSpeed').isVisible(), false);
  assert.equal(await page.locator('#slider-turnResponse').isVisible(), true);
  assert.equal(await page.locator('#value-turnResponse').inputValue(), '10.4');
  await page.locator('#value-turnResponse').fill('8.5'); await page.locator('#value-turnResponse').press('Tab');
  await page.locator('#value-turnSnapAngle').fill('0.05'); await page.locator('#value-turnSnapAngle').press('Tab');
  await page.locator('#turn-model').selectOption('0');
  assert.equal(await page.locator('#value-turnSpeed').inputValue(), '1200');
  await page.locator('#turn-model').selectOption('1');
  assert.equal(await page.locator('#value-turnResponse').inputValue(), '8.5');
  await page.locator('#save-settings').click();
  await page.waitForFunction(() => document.querySelector('#store-status').textContent.includes('已写入'));
  assert.equal(saved.settings.turnModel, 1); assert.equal(saved.settings.turnResponse, 8.5); assert.equal(saved.settings.turnSnapAngle, .05);
  await page.reload(); await page.waitForFunction(() => window.__ARCHERO__?.snapshot().ready);
  assert.equal(await page.locator('#turn-model').inputValue(), '1');
  assert.equal((await snapshot()).settings.turnSpeed, 1200);
  // Switch while a gesture is active, inside one JS task: no synthetic pointer release or pose reset.
  const r = await page.locator('#viewport').boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height * .65); await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2 + 70, r.y + r.height * .65);
  const pair = await page.evaluate(() => {
    const before = window.__ARCHERO__.snapshot();
    const select = document.querySelector('#turn-model'); select.value = '0'; select.dispatchEvent(new Event('change'));
    return { before, after: window.__ARCHERO__.snapshot() };
  });
  for (const key of ['heading', 'position', 'offset', 'pointerId', 'mode']) assert.deepEqual(pair.after[key], pair.before[key]);
  await page.mouse.up();
  await page.locator('#turn-model').selectOption('1');
  await page.screenshot({ path: new URL('desktop.png', out).pathname, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.locator('#open-settings').click();
  await page.locator('#turn-model').selectOption('0'); await page.locator('#turn-model').selectOption('1');
  await page.locator('#value-turnResponse').scrollIntoViewIfNeeded(); assert.equal(await page.locator('#value-turnResponse').isVisible(), true);
  await page.screenshot({ path: new URL('mobile.png', out).pathname });
  assert.deepEqual(errors, []);
  await writeFile(new URL('results.json', out), JSON.stringify({ passed: true, saved, errors }, null, 2));
  console.log('PASS: model selector, independent tuning, isolated save/reload, in-gesture switching and mobile controls.');
} finally { await browser.close(); }

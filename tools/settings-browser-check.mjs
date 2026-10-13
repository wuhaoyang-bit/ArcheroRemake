import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const baseURL = process.env.BASE_URL || 'http://localhost:5173';
const file = new URL('../public/params.json', import.meta.url);
const original = await readFile(file, 'utf8');
const output = new URL('../analysis/v1-checks/', import.meta.url);
await mkdir(output, { recursive: true });
let lastWritten = null;
const errors = [], passed = [];
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (existsSync(chrome) ? chrome : undefined), headless: true, args: ['--enable-unsafe-webgpu'] });
const snapshot = page => page.evaluate(() => window.__ARCHERO__.snapshot());
async function ready(page, url = baseURL) {
  await page.goto(url);
  await page.waitForFunction(() => window.__ARCHERO__?.snapshot().ready, {}, { timeout: 60000 });
}
async function set(page, key, value) {
  const input = page.locator(`#value-${key}`); await input.fill(String(value)); await input.press('Tab');
}
async function save(page) {
  await page.locator('#save-settings').click();
  await page.waitForFunction(() => /已写入|保存失败/.test(document.querySelector('#store-status').textContent));
  assert.equal(await page.locator('#store-status').textContent(), '已写入 params.json');
  lastWritten = await readFile(file, 'utf8');
}
async function check(name, action) { await action(); passed.push(name); console.log('PASS', name); }
function monitor(page) { page.on('pageerror', e => errors.push(e.message)); }

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); monitor(desktop);
  await ready(desktop);
  await check('requested defaults load; speed upper limit is 30; default Run rate is independent of Idle', async () => {
    await desktop.locator('#restore').click(); await desktop.waitForTimeout(50);
    const s = await snapshot(desktop);
    assert.equal(s.settings.moveSpeed, 16); assert.equal(s.settings.anchorScale, 0.036);
    assert.equal(s.settings.turnSpeed, 900); assert.equal(s.settings.blendDuration, 0.06);
    assert.equal(s.settings.runSpeed, 1.6); assert.equal(s.runTimeScale, 1.6); assert.equal(s.idleTimeScale, 1);
    assert.equal(await desktop.locator('#slider-moveSpeed').getAttribute('max'), '30');
  });
  await check('UI saves real JSON, does not reload the game, and marks later edits as unsaved', async () => {
    await set(desktop, 'moveSpeed', 23); await set(desktop, 'runSpeed', 2.5); await set(desktop, 'roomSize', 12);
    assert.match(await desktop.locator('#store-status').textContent(), /未保存/);
    await desktop.evaluate(() => { window.__saveSentinel = 'same-page'; });
    await save(desktop);
    const stored = JSON.parse(lastWritten); assert.equal(stored.settings.moveSpeed, 23); assert.equal(stored.settings.runSpeed, 2.5); assert.equal(stored.settings.roomSize, 12);
    assert.deepEqual(Object.keys(stored), ['version', 'settings']);
    await desktop.waitForTimeout(650); assert.equal(await desktop.evaluate(() => window.__saveSentinel), 'same-page');
    await set(desktop, 'moveSpeed', 24); assert.match(await desktop.locator('#store-status').textContent(), /未保存/);
    assert.equal(JSON.parse(await readFile(file, 'utf8')).settings.moveSpeed, 23);
  });
  await check('refresh restores saved settings, starts in the saved room, and clears runtime anchor state', async () => {
    const r = await desktop.locator('#viewport').boundingBox();
    await desktop.mouse.move(r.x + r.width / 2, r.y + r.height * 0.7); await desktop.mouse.down();
    await desktop.mouse.move(r.x + r.width / 2 + 35, r.y + r.height * 0.7);
    await desktop.waitForTimeout(80); await desktop.mouse.up(); assert.ok((await snapshot(desktop)).remembered.x > 0);
    await ready(desktop);
    const s = await snapshot(desktop); assert.equal(s.settings.moveSpeed, 23); assert.equal(s.settings.runSpeed, 2.5);
    assert.equal(s.position.z, 12 * 0.27); assert.deepEqual(s.remembered, { x: 0, z: 0 }); assert.equal(s.mode, 'idle');
    assert.equal(await desktop.locator('#value-runSpeed').inputValue(), '2.5');
  });
  await check('new mobile browser loads the same file and can save back through HTTPS', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true });
    const phone = await context.newPage(); monitor(phone); await ready(phone, process.env.HTTPS_URL || baseURL);
    assert.equal((await snapshot(phone)).settings.moveSpeed, 23); assert.equal((await snapshot(phone)).settings.runSpeed, 2.5);
    await phone.locator('#open-settings').tap(); await set(phone, 'runSpeed', 3); await save(phone);
    assert.equal((await snapshot(phone)).mode, 'idle');
    await phone.screenshot({ path: new URL('settings-mobile.png', output).pathname });
    await ready(desktop); assert.equal((await snapshot(desktop)).settings.runSpeed, 3);
    await context.close();
  });
  await check('save failure is visible and does not overwrite the previous file; user can retry', async () => {
    const before = await readFile(file, 'utf8'); await set(desktop, 'runSpeed', 2);
    await desktop.route('**/__save-params', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: '测试写入失败' }) }));
    await desktop.locator('#save-settings').click(); await desktop.waitForFunction(() => document.querySelector('#store-status').textContent.includes('保存失败'));
    assert.equal(await readFile(file, 'utf8'), before); assert.equal(await desktop.locator('#save-settings').isEnabled(), true);
    await desktop.unroute('**/__save-params'); await save(desktop);
  });
  await check('Run time scale applies immediately without changing movement, Idle or blend timing', async () => {
    await desktop.locator('#restore').click(); await set(desktop, 'runSpeed', 4); await desktop.waitForTimeout(50);
    const s = await snapshot(desktop); assert.equal(s.runTimeScale, 4); assert.equal(s.idleTimeScale, 1);
    assert.equal(s.settings.moveSpeed, 16); assert.equal(s.settings.blendDuration, 0.06);
    const r = await desktop.locator('#viewport').boundingBox();
    await desktop.mouse.move(r.x + r.width / 2, r.y + r.height * 0.7); await desktop.mouse.down(); await desktop.waitForTimeout(100);
    const run = await snapshot(desktop); assert.equal(run.mode, 'in-place'); assert.equal(run.runWeight, 1); assert.deepEqual(run.position, s.position);
    await desktop.mouse.up();
  });
  await check('restoring defaults becomes persistent after Save JSON and remains correct after refresh', async () => {
    await desktop.locator('#restore').click(); await save(desktop); await ready(desktop);
    const s = await snapshot(desktop); assert.equal(s.settings.moveSpeed, 16); assert.equal(s.settings.runSpeed, 1.6); assert.equal(s.settings.anchorScale, 0.036);
    await desktop.screenshot({ path: new URL('settings-desktop.png', output).pathname });
  });
  assert.deepEqual(errors, []);
  await writeFile(new URL('settings-results.json', output), JSON.stringify({ passed, errors }, null, 2));
  console.log(`${passed.length} settings browser checks passed.`);
} finally {
  await browser.close();
  // Do not leave automated tuning behind or overwrite a concurrent user save.
  if (lastWritten !== null && await readFile(file, 'utf8') === lastWritten) await writeFile(file, original);
}

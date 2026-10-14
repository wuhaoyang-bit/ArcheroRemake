import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';

const baseURL = process.env.BASE_URL || 'http://localhost:5173';
const out = new URL('../analysis/v1-checks/', import.meta.url);
await mkdir(out, { recursive: true });
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--enable-unsafe-webgpu'] });
const results = [], errors = [];
const near = (a, b, e = 1e-4) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
const snapshot = page => page.evaluate(() => window.__ARCHERO__.snapshot());
function monitor(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
}
async function ready(page, url = baseURL) {
  await page.goto(url);
  await page.waitForFunction(() => window.__ARCHERO__?.snapshot().ready, {}, { timeout: 60000 });
}
async function check(name, action) {
  await action(); results.push({ name, passed: true }); console.log(`PASS ${name}`);
}
async function set(page, key, value) {
  const input = page.locator(`#value-${key}`); await input.fill(String(value)); await input.press('Tab');
}

let desktop, mobile;
try {
  desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  monitor(desktop); await ready(desktop);
  // Keep this movement regression's speed/mapping fixture separate from tuning defaults.
  await desktop.locator('#restore').click();
  await set(desktop, 'moveSpeed', 6); await set(desktop, 'anchorScale', 0.032);
  const rect = await desktop.locator('#viewport').boundingBox(), scale = rect.width / 390;
  const x = rect.x + rect.width / 2, y = rect.y + rect.height * 0.7;
  await check('WebGPU renders a fixed portrait viewport; foot is centered at rest', async () => {
    const s = await snapshot(desktop); assert.equal(s.renderer, 'webgpu'); near(rect.width / rect.height, 9 / 19.5);
    near(s.footNdc[1], 0); near(s.cameraX, 0);
    assert.ok(await desktop.locator('.left-panel').isVisible()); assert.ok(await desktop.locator('.right-panel').isVisible());
    assert.equal(await desktop.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await desktop.screenshot({ path: new URL('desktop.png', out).pathname });
  });
  await check('Mouse press, one-time threshold, run-in-place and immediate movement', async () => {
    const before = await snapshot(desktop);
    await desktop.mouse.move(x, y); await desktop.mouse.down(); await desktop.waitForTimeout(180);
    let s = await snapshot(desktop); assert.equal(s.mode, 'in-place'); assert.deepEqual(s.position, before.position); near(s.runWeight, 1); near(s.center.x, x); near(s.center.y, y);
    await desktop.mouse.move(x + 6 * scale, y); s = await snapshot(desktop); assert.equal(s.unlocked, false); near(s.stick.x, 0);
    await desktop.mouse.move(x + 40 * scale, y); await desktop.waitForTimeout(100);
    s = await snapshot(desktop); assert.equal(s.mode, 'moving'); assert.equal(s.unlocked, true); assert.ok(s.position.x > before.position.x); near(s.offset.x, 40 * 0.032, 0.01);
    assert.equal(s.cameraX, 0);
  });
  await check('Exact center retains motion; tiny reverse input does not relock; release stops', async () => {
    await desktop.mouse.move(x, y); let s = await snapshot(desktop); near(s.offset.x, 0); near(s.offset.z, 0);
    const before = s.position.x; await desktop.waitForTimeout(100); s = await snapshot(desktop); assert.ok(s.position.x > before);
    await desktop.mouse.move(x - 1 * scale, y); s = await snapshot(desktop); assert.equal(s.unlocked, true); assert.ok(s.direction.x < 0);
    await desktop.mouse.up(); s = await snapshot(desktop); const stop = s.position; assert.equal(s.mode, 'idle'); assert.equal(s.anchorVisible, false);
    await desktop.waitForTimeout(220); assert.deepEqual((await snapshot(desktop)).position, stop);
    await desktop.mouse.down(); s = await snapshot(desktop); near(s.offset.x, -0.032, 0.002); assert.equal(s.mode, 'in-place'); await desktop.mouse.up();
  });
  await check('Slow body rotation continues after release; camera settles without clamping to room walls', async () => {
    await set(desktop, 'turnSpeed', 90);
    await desktop.mouse.move(x, y); await desktop.mouse.down(); await desktop.mouse.move(x, y - 50 * scale);
    await desktop.waitForTimeout(230);
    const a = await snapshot(desktop); assert.ok(Math.abs(a.cameraZ - a.position.z) > 0.05); near(a.cameraX, 0);
    await desktop.mouse.up(); const b = await snapshot(desktop); assert.ok(Math.abs(b.heading - b.targetHeading) > 0.1);
    await desktop.waitForTimeout(500); const c = await snapshot(desktop); assert.deepEqual(c.position, b.position);
    assert.ok(Math.abs(c.cameraZ - c.position.z) < Math.abs(b.cameraZ - b.position.z)); assert.notEqual(c.heading, b.heading);
    await desktop.waitForTimeout(1700); near((await snapshot(desktop)).footNdc[1], 0, 0.001);
  });
  await check('Same ground-axis scale projects to the intended ellipse; composition changes do not move player', async () => {
    await desktop.mouse.move(x, y); await desktop.mouse.down(); await desktop.mouse.move(x + 30 * scale, y);
    await desktop.waitForTimeout(70); let s = await snapshot(desktop);
    const horizontal = Math.abs(s.anchorNdc[0] - s.footNdc[0]) * rect.width / 2;
    await desktop.mouse.move(x, y - 30 * scale); await desktop.waitForTimeout(70); s = await snapshot(desktop);
    const vertical = Math.abs(s.anchorNdc[1] - s.footNdc[1]) * rect.height / 2;
    near(vertical / horizontal, 0.82, 0.015);
    await desktop.screenshot({ path: new URL('desktop-moving.png', out).pathname });
    await desktop.mouse.up(); await desktop.waitForTimeout(1200);
    const before = await snapshot(desktop); await set(desktop, 'cameraOffset', 10); await desktop.waitForTimeout(150);
    s = await snapshot(desktop); assert.deepEqual(s.position, before.position); assert.deepEqual(s.offset, before.offset); near(s.footNdc[1], -0.2, 0.001);
    await set(desktop, 'cameraOffset', 0);
  });
  await check('Edge presses stay at the exact press point; captured mouse continues outside game; blur cancels', async () => {
    await desktop.mouse.move(rect.x + 2, rect.y + rect.height * 0.5); await desktop.mouse.down();
    const s = await snapshot(desktop); near(s.center.x, rect.x + 2);
    const cssX = await desktop.locator('#joystick').evaluate(node => parseFloat(node.style.left)); near(cssX, 2);
    await desktop.mouse.move(rect.x - 40, rect.y + rect.height * 0.5); assert.equal((await snapshot(desktop)).mode, 'moving');
    await desktop.mouse.up(); assert.equal((await snapshot(desktop)).mode, 'idle');
    await desktop.mouse.move(x, y); await desktop.mouse.down(); await desktop.mouse.move(x, y - 50);
    await desktop.evaluate(() => dispatchEvent(new Event('blur'))); assert.equal((await snapshot(desktop)).mode, 'idle'); await desktop.mouse.up();
  });
  await check('UI controls are isolated and room size constrains position without moving camera sideways', async () => {
    await set(desktop, 'roomSize', 8); await set(desktop, 'roomLength', 8); assert.equal((await snapshot(desktop)).mode, 'idle');
    await desktop.mouse.move(x, y); await desktop.mouse.down(); await desktop.mouse.move(x, y + 60 * scale);
    await desktop.waitForTimeout(1800); await desktop.mouse.up(); await desktop.waitForTimeout(1000);
    let s = await snapshot(desktop); near(s.position.z, 4 - 0.46); near(s.cameraZ, s.position.z, 0.001); near(s.footNdc[1], 0, 0.001);
    await desktop.mouse.move(x, y); await desktop.mouse.down(); await desktop.mouse.move(x, y - 60 * scale);
    await desktop.waitForTimeout(1800); await desktop.mouse.up(); await desktop.waitForTimeout(1000);
    s = await snapshot(desktop); near(s.position.z, -4 + 0.46); near(s.cameraZ, s.position.z, 0.001); near(s.cameraX, 0);
    await desktop.locator('#restore').click(); assert.equal((await snapshot(desktop)).settings.roomSize, 16);
  });

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true });
  mobile = await context.newPage(); monitor(mobile); await ready(mobile);
  const cdp = await context.newCDPSession(mobile);
  const touch = async (type, points) => {
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, x, y]) => ({ id, x, y, radiusX: 5, radiusY: 5, force: 1 })) });
    // Compositor touch acknowledgements can precede the coalesced Pointer Event.
    await mobile.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  await check('Mobile portrait is identical in aspect and initial projection; debug sheet does not control player', async () => {
    const r = await mobile.locator('#viewport').boundingBox(); near(r.width / r.height, 9 / 19.5);
    near((await snapshot(mobile)).footNdc[1], 0);
    assert.equal(await mobile.locator('.left-panel').isVisible(), false); await mobile.locator('#open-settings').tap();
    assert.ok(await mobile.locator('.left-panel').isVisible()); assert.equal((await snapshot(mobile)).mode, 'idle');
    await mobile.locator('#close-settings').tap(); await mobile.screenshot({ path: new URL('mobile.png', out).pathname });
  });
  await check('Trusted multi-touch: latest touch takes over while locked; old movement and release are ignored', async () => {
    await touch('touchStart', [[1, 130, 640]]); let s = await snapshot(mobile); assert.equal(s.mode, 'in-place');
    await touch('touchStart', [[1, 130, 640], [2, 270, 630]]); s = await snapshot(mobile); assert.equal(s.mode, 'in-place'); near(s.center.x, 270); const controlling = s.pointerId;
    await touch('touchMove', [[1, 70, 550], [2, 270, 630]]); s = await snapshot(mobile); assert.equal(s.pointerId, controlling); near(s.stick.x, 0);
    // CDP touchEnd lists the contacts being lifted, unlike touchMove's active contacts.
    await touch('touchEnd', [[1, 70, 550]]); assert.equal((await snapshot(mobile)).mode, 'in-place');
    await touch('touchEnd', []); assert.equal((await snapshot(mobile)).mode, 'idle');
  });
  await check('Trusted multi-touch: movement survives takeover; new unlock redirects; active release never restores old finger', async () => {
    await touch('touchStart', [[3, 130, 640]]); await touch('touchMove', [[3, 165, 640]]); await mobile.waitForTimeout(100);
    let s = await snapshot(mobile); assert.equal(s.mode, 'moving'); const offset = s.offset;
    await touch('touchStart', [[3, 165, 640], [4, 270, 600]]); s = await snapshot(mobile);
    assert.equal(s.mode, 'moving'); assert.equal(s.unlocked, false); assert.deepEqual(s.offset, offset); const before = s.position.x;
    await mobile.waitForTimeout(100); assert.ok((await snapshot(mobile)).position.x > before);
    await touch('touchMove', [[3, 100, 680], [4, 270, 600]]); s = await snapshot(mobile); assert.deepEqual(s.offset, offset);
    await touch('touchMove', [[3, 100, 680], [4, 270, 560]]); s = await snapshot(mobile); assert.equal(s.unlocked, true); assert.ok(s.direction.z < 0);
    await mobile.screenshot({ path: new URL('mobile-moving.png', out).pathname });
    await touch('touchEnd', [[4, 270, 560]]); s = await snapshot(mobile); assert.equal(s.mode, 'idle'); const stop = s.position;
    await touch('touchMove', [[3, 200, 680]]); await mobile.waitForTimeout(130); assert.deepEqual((await snapshot(mobile)).position, stop);
    await touch('touchEnd', []);
  });
  await check('Trusted touch release commits its final coordinate before remembering the anchor', async () => {
    await mobile.evaluate(() => window.addEventListener('pointerup', event => {
      window.__lastRelease = { x: event.clientX, y: event.clientY, trusted: event.isTrusted };
    }, { once: true }));
    await touch('touchStart', [[6, 130, 640]]);
    await touch('touchMove', [[6, 100, 640]]);
    await touch('touchEnd', [[6, 130, 580]]);
    const released = await mobile.evaluate(() => window.__lastRelease);
    assert.equal(released.trusted, true); near(released.x, 130); near(released.y, 580);
    const s = await snapshot(mobile), r = await mobile.locator('#viewport').boundingBox();
    near(Math.abs(s.targetHeading), Math.PI); near(s.remembered.x, 0);
    near(s.remembered.z, -Math.min(60 / (r.width / 390), s.settings.joystickRadius) * s.settings.anchorScale);
    assert.equal(s.mode, 'idle'); assert.equal(s.anchorVisible, false);
  });
  await check('Touch cancellation and viewport resizing leave no stuck input', async () => {
    await touch('touchStart', [[5, 190, 620]]); await touch('touchMove', [[5, 190, 570]]);
    await touch('touchCancel', []); assert.equal((await snapshot(mobile)).mode, 'idle');
    await mobile.setViewportSize({ width: 844, height: 390 }); await mobile.waitForTimeout(200);
    const r = await mobile.locator('#viewport').boundingBox(); near(r.width / r.height, 9 / 19.5); assert.ok(r.height <= 390);
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  });
  if (process.env.HTTPS_URL) {
    await check('HTTPS mobile entry initializes WebGPU and loads local character', async () => {
      const secure = await context.newPage(); monitor(secure); await ready(secure, process.env.HTTPS_URL);
      assert.equal(await secure.evaluate(() => isSecureContext), true); assert.equal((await snapshot(secure)).renderer, 'webgpu'); await secure.close();
    });
  }
  assert.deepEqual(errors, [], 'Browser must have no runtime or resource errors');
  await writeFile(new URL('browser-results.json', out), JSON.stringify({ date: new Date().toISOString(), baseURL, results, errors }, null, 2));
  console.log(`${results.length} browser checks passed; screenshots/results are local-only in analysis/v1-checks/.`);
} catch (error) {
  for (const [name, page] of [['desktop', desktop], ['mobile', mobile]]) if (page && !page.isClosed()) await page.screenshot({ path: new URL(`${name}-failure.png`, out).pathname }).catch(() => {});
  await writeFile(new URL('browser-results.json', out), JSON.stringify({ results, errors, failure: String(error) }, null, 2));
  throw error;
} finally { await browser.close(); }

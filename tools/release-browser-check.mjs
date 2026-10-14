import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';

const baseURL = process.env.BASE_URL || 'http://localhost:5173';
const out = new URL('../analysis/release-checks/', import.meta.url);
await mkdir(out, { recursive: true });
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined),
  headless: true, args: ['--enable-unsafe-webgpu'],
});
const results = [], errors = [];
const near = (a, b, epsilon = 1e-4) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const angleError = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const snapshot = page => page.evaluate(() => window.__ARCHERO__.snapshot());
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseURL);
  await page.waitForFunction(() => window.__ARCHERO__?.snapshot().ready, {}, { timeout: 60000 });
  const cdp = await page.context().newCDPSession(page);
  const rect = await page.locator('#viewport').boundingBox(), scale = rect.width / 390;
  const x = rect.x + rect.width / 2, y = rect.y + rect.height * 0.7, radius = 60 * scale;
  const point = degrees => ({ x: x + radius * Math.sin(degrees * Math.PI / 180), y: y - radius * Math.cos(degrees * Math.PI / 180) });
  const start = async () => {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  };
  const move = degrees => cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point(degrees), button: 'left', buttons: 1 });
  const up = finalPoint => cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...finalPoint, button: 'left', buttons: 0, clickCount: 1 });
  const settle = async expected => {
    await page.waitForFunction(target => {
      const s = window.__ARCHERO__.snapshot();
      return Math.abs(Math.atan2(Math.sin(s.heading - target), Math.cos(s.heading - target))) < 1e-4;
    }, expected, { timeout: 3000 });
  };

  // No final mouseMoved is sent: mouseReleased itself carries the newer point.
  // These are trusted Chromium events, not calls to the movement controller.
  for (const [stale, final] of [[-40, 0], [-30, 0], [-20, 0], [-10, 0], [10, 0], [40, 0], [-170, 0], [170, 0], [0, 90], [0, -90], [90, 180], [-90, -180]]) {
    await start(); await move(stale); const before = await snapshot(page);
    await up(point(final)); const stopped = await snapshot(page);
    const expected = Math.atan2(Math.sin(final * Math.PI / 180), -Math.cos(final * Math.PI / 180));
    near(angleError(stopped.targetHeading, expected), 0);
    near(stopped.remembered.x, 60 * Math.sin(final * Math.PI / 180) * stopped.settings.anchorScale);
    near(stopped.remembered.z, -60 * Math.cos(final * Math.PI / 180) * stopped.settings.anchorScale);
    assert.equal(stopped.mode, 'idle'); assert.equal(stopped.pointerId, null); assert.equal(stopped.anchorVisible, false);
    assert.deepEqual(stopped.stick, { x: 0, y: 0 });
    await settle(expected); const settled = await snapshot(page);
    assert.deepEqual(settled.position, stopped.position);
    // Late hover and re-press must not revive stale input or overwrite anchor memory.
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point(stale), buttons: 0 });
    near(angleError((await snapshot(page)).targetHeading, expected), 0);
    await start(); const next = await snapshot(page); assert.deepEqual(next.offset, stopped.remembered);
    await up({ x, y }); assert.deepEqual((await snapshot(page)).remembered, stopped.remembered);
    results.push({ staleDegrees: stale, releaseDegrees: final, oldTarget: before.targetHeading, finalTarget: stopped.targetHeading, settledHeading: settled.heading });
  }
  console.log('PASS: 12 newer release endpoints determine the final heading and remembered anchor; position stops immediately.');

  await start(); await move(-90); const beforeCenter = await snapshot(page); await up({ x, y });
  const centered = await snapshot(page); assert.deepEqual(centered.remembered, { x: 0, z: 0 });
  near(angleError(centered.targetHeading, beforeCenter.targetHeading), 0);
  results.push({ check: 'Exact-center release clears anchor offset and retains the last nonzero direction.' });

  await start(); const inPlace = await snapshot(page); await up(point(90));
  const finalOnly = await snapshot(page); near(angleError(finalOnly.targetHeading, Math.PI / 2), 0);
  assert.deepEqual(finalOnly.position, inPlace.position); assert.equal(finalOnly.mode, 'idle');
  results.push({ check: 'A first above-threshold sample on release updates the target without an extra movement step.' });

  for (const type of ['pointercancel', 'lostpointercapture']) {
    await start(); await move(90); const before = await snapshot(page);
    // Cancellation coordinates are not a final input sample; they can be absent/zero.
    await page.evaluate(type => {
      const id = window.__ARCHERO__.snapshot().pointerId;
      document.getElementById('viewport').dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'mouse', bubbles: true, clientX: 0, clientY: 0 }));
    }, type);
    const cancelled = await snapshot(page); assert.equal(cancelled.mode, 'idle');
    assert.deepEqual(cancelled.remembered, before.offset); near(angleError(cancelled.targetHeading, before.targetHeading), 0);
    await up({ x, y }); results.push({ check: `${type} preserves the last valid target without consuming cancellation coordinates.` });
  }
  // Reproduce the actual MT trace: capture loss precedes a correct terminal up.
  // Dispatch up outside the viewport too: capture has already been lost.
  for (const stale of [-40, -22.59, -8.84, 20]) {
    await start(); await move(stale);
    const before = await snapshot(page);
    await page.evaluate(() => {
      const id = window.__ARCHERO__.snapshot().pointerId;
      document.getElementById('viewport').dispatchEvent(new PointerEvent('lostpointercapture', {
        pointerId: id, pointerType: 'mouse', bubbles: true,
      }));
    });
    const lost = await snapshot(page);
    assert.equal(lost.mode, 'idle'); assert.deepEqual(lost.offset, before.offset);
    await page.evaluate(({ id, endpoint }) => {
      document.body.dispatchEvent(new PointerEvent('pointerup', {
        pointerId: id, pointerType: 'mouse', bubbles: true, clientX: endpoint.x, clientY: endpoint.y,
      }));
    }, { id: before.pointerId, endpoint: point(0) });
    const released = await snapshot(page);
    near(released.offset.x, 0); near(released.offset.z, -60 * released.settings.anchorScale);
    assert.deepEqual(released.remembered, released.offset);
    assert.deepEqual(released.position, lost.position);
    await settle(Math.PI);
    await up(point(0)); // Release the automation mouse; duplicate up must be ignored.
    results.push({ check: 'lostpointercapture -> pointerup commits final anchor', stale });
  }
  console.log('PASS: capture loss before release preserves the final coordinate, including outside-viewport up.');
  console.log('PASS: center release, locked re-press, late input and cancellation semantics are preserved.');
  assert.deepEqual(errors, []);
  await writeFile(new URL('results.json', out), JSON.stringify({ results, errors }, null, 2));
} catch (error) {
  await writeFile(new URL('results.json', out), JSON.stringify({ results, errors, failure: String(error) }, null, 2));
  throw error;
} finally { await browser.close(); }

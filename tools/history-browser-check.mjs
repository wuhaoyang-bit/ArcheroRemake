import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const path = new URL('../public/params.json', import.meta.url);
const original = await readFile(path, 'utf8');
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--enable-unsafe-webgpu'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let pending, requests = 0;
  await page.route('**/params.json', route => route.fulfill({ json: JSON.parse(original) }));
  await page.route('**/__save-params', route => { requests++; pending = route; });
  await page.goto(process.env.BASE_URL || 'http://localhost:5173');
  await page.waitForFunction(() => window.__ARCHERO__?.snapshot().ready);
  const settings = () => page.evaluate(() => window.__ARCHERO__.snapshot().settings);
  const loaded = await settings();
  const undo = page.locator('#undo-settings'), all = page.locator('#restore');
  assert.ok(await undo.isDisabled()); assert.ok(await all.isDisabled());
  const number = async (key, value) => {
    await page.locator('#value-' + key).fill(String(value));
    await page.locator('#value-' + key).press('Tab');
  };
  await number('moveSpeed', 11);
  await page.locator('#anchor-follow').click();
  await undo.click(); assert.equal((await settings()).anchorFollow, loaded.anchorFollow);
  await undo.click(); assert.deepEqual(await settings(), loaded);
  const slider = page.locator('#slider-moveSpeed');
  await slider.scrollIntoViewIfNeeded();
  const rect = await slider.boundingBox();
  await page.mouse.move(rect.x + rect.width * .4, rect.y + rect.height / 2); await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * .7, rect.y + rect.height / 2, { steps: 20 }); await page.mouse.up();
  assert.notEqual((await settings()).moveSpeed, loaded.moveSpeed);
  await undo.click(); assert.deepEqual(await settings(), loaded); assert.ok(await undo.isDisabled());
  await slider.focus();
  await page.keyboard.down('ArrowRight'); await page.keyboard.down('ArrowRight'); await page.keyboard.up('ArrowRight');
  await undo.click(); assert.deepEqual(await settings(), loaded); assert.ok(await undo.isDisabled());
  await page.locator('#turn-model').selectOption('5');
  await undo.click(); assert.deepEqual(await settings(), loaded);
  await page.locator('#turn-curve-editor [data-curve="edit"]').click();
  await page.locator('dialog[open] [name="speed"]').fill('2500');
  await page.locator('dialog[open] [type="submit"]').click();
  await undo.click(); assert.deepEqual(await settings(), loaded); assert.ok(await undo.isDisabled());
  await number('curveSnapAngle', .5);
  const beforeReset = await settings();
  await page.locator('#turn-curve-editor [data-curve="generate"]').click();
  await undo.click(); assert.deepEqual(await settings(), beforeReset);
  await undo.click(); assert.deepEqual(await settings(), loaded); assert.ok(await undo.isDisabled());
  for (const [id, key] of [['turn-curve-editor','turnCurve'], ['lock-turn-curve-editor','lockTurnCurve'],
    ['move-curve-editor','moveCurve'], ['anchor-curve-editor','anchorCurve'], ['ring-curve-editor','ringCurve'],
    ['ring-wave-editor','ringWaveCurve'], ['ring-switch-editor','ringSwitchCurve'],
    ['ring-stroke-editor','ringStrokeCurve'], ['link-attack-editor','ringLinkAttackCurve']]) {
    const before = await settings(), graph = page.locator(`#${id} svg`);
    await graph.scrollIntoViewIfNeeded();
    const r = await graph.locator('circle').nth(1).boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.mouse.down();
    await page.mouse.move(r.x + r.width / 2 + 4, r.y + r.height / 2 + 10, { steps: 15 }); await page.mouse.up();
    assert.notDeepEqual((await settings())[key], before[key], id);
    await undo.click(); assert.deepEqual(await settings(), before); assert.ok(await undo.isDisabled(), id);
  }
  await page.locator('#turn-curve-editor [data-curve="expand"]').click();
  const r = await page.locator('dialog[open] svg circle').nth(1).boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2 + 20, { steps: 12 }); await page.mouse.up();
  await page.locator('dialog[open] .curve-close').click();
  await undo.click(); assert.deepEqual(await settings(), loaded); assert.ok(await undo.isDisabled());
  await number('moveSpeed', 12);
  await page.locator('#save-settings').click(); await page.waitForTimeout(100);
  assert.equal(pending.request().postDataJSON().settings.moveSpeed, 12);
  await number('moveSpeed', 13);
  await pending.fulfill({ json: { ok: true } });
  await page.waitForFunction(() => !document.querySelector('#save-settings').disabled);
  assert.equal((await settings()).moveSpeed, 13);
  assert.ok(await undo.isDisabled()); assert.ok(await all.isEnabled());
  await all.click(); assert.equal((await settings()).moveSpeed, 12); assert.ok(await all.isDisabled());
  await number('moveSpeed', 14);
  await page.locator('#save-settings').click(); await page.waitForTimeout(100);
  await pending.fulfill({ status: 500, json: { ok: false, error: 'test failure' } });
  await page.waitForFunction(() => !document.querySelector('#save-settings').disabled);
  assert.ok(await undo.isEnabled()); await all.click(); assert.equal((await settings()).moveSpeed, 12);
  await page.setViewportSize({ width: 390, height: 844 }); await page.locator('#open-settings').click();
  assert.ok(await undo.isVisible()); assert.ok(await all.isVisible());
  assert.equal(requests, 2); assert.deepEqual(errors, []); assert.equal(await readFile(path, 'utf8'), original);
  await page.route('**/params.json', route => route.fulfill({ status: 500, body: 'unavailable' }));
  await page.reload(); await page.waitForFunction(() => window.__ARCHERO__?.snapshot().ready);
  const fallback = await settings();
  await page.locator('#open-settings').click();
  assert.ok(await all.isDisabled());
  await number('moveSpeed', 11); await all.click(); assert.deepEqual(await settings(), fallback);
  console.log('PASS: numeric/options, sliders, nine curves, enlarged graph, save race/failure, mobile, unchanged JSON.');
} finally { await browser.close(); }

import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const file = new URL('../public/params.json', import.meta.url), original = await readFile(file, 'utf8');
let saved = JSON.parse(original);
saved.settings.turnModel = saved.settings.lockTurnModel = 7;
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--enable-unsafe-webgpu'],
});
try {
  const page = await browser.newPage({viewport:{width:1440,height:1100}}), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/params.json', route => route.fulfill({json:saved}));
  await page.route('**/__save-params', async route => {
    saved = route.request().postDataJSON(); await route.fulfill({json:{ok:true}});
  });
  await page.goto(process.env.BASE_URL || 'http://localhost:5173');
  const ready = () => page.waitForFunction(() => window.__ARCHERO__?.snapshot().ready);
  await ready();
  const settings = () => page.evaluate(() => window.__ARCHERO__.snapshot().settings);
  const baseline = await settings();
  const exercise = async root => {
    assert.equal(await root.locator('input, [data-curve="edit"], [data-curve="delete"], [data-curve="generate"]').count(), 0);
    const graph = root.locator('svg'); await graph.scrollIntoViewIfNeeded();
    await graph.dblclick({position:{x:100,y:90}});
    const r = await graph.locator('circle').nth(1).boundingBox();
    await page.mouse.move(r.x+r.width/2,r.y+r.height/2); await page.mouse.down();
    await page.mouse.move(r.x+20,r.y+25,{steps:5}); await page.mouse.up();
    assert.deepEqual(await settings(), baseline);
    assert.ok(await page.locator('#undo-settings').isDisabled());
  };
  for (const mobile of [false,true]) {
    if (mobile) { await page.setViewportSize({width:390,height:844}); await page.locator('#open-settings').click(); }
    for (const prefix of ['turn','lock-turn']) {
      assert.equal(await page.locator(`#${prefix}-model`).inputValue(),'7');
      const root = page.locator(`#${prefix}-smooth-preview`);
      assert.ok(await root.isVisible()); await exercise(root);
      await root.locator('[data-curve="expand"]').click();
      await exercise(page.locator('dialog[open]'));
      await page.locator('dialog[open] .curve-close').click();
    }
  }
  for (const prefix of ['turn','lock-turn']) {
    const preview = page.locator(`#${prefix}-smooth-preview svg path`).last();
    const before = await preview.getAttribute('d');
    await page.locator(`#${prefix}-model`).selectOption('2');
    await page.locator(`#${prefix}-curve-editor [data-curve="edit"]`).click();
    await page.locator('dialog[open] [name="speed"]').fill('3210');
    await page.locator('dialog[open] [type="submit"]').click();
    assert.notEqual(await preview.getAttribute('d'),before);
    await page.locator('#undo-settings').click();
    assert.equal(await preview.getAttribute('d'),before);
    await page.locator('#undo-settings').click();
    assert.deepEqual(await settings(),baseline);
  }
  await page.locator('#save-settings').click();
  await page.waitForFunction(() => document.querySelector('#store-status').textContent.includes('已写入'));
  await page.reload(); await ready(); assert.deepEqual(await settings(),baseline);
  assert.deepEqual(errors,[]); assert.equal(await readFile(file,'utf8'),original);
  console.log('PASS: ID 7 save/reload, both live previews, undo, desktop/mobile expanded read-only interactions; real params unchanged.');
} finally { await browser.close(); }

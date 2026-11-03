import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const out = '/Users/racio/Documents/ArcheroRemake/analysis/slime-walk-lab';
await mkdir(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // Game sidebar entry under 史莱姆 · 充盈与行走
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ARCHERO__?.snapshot?.().ready, {}, { timeout: 120000 });
  await page.locator('#settings-category').selectOption('slime');
  assert.equal(await page.locator('a[href="./slime-walk-lab.html"]').count(), 1);

  await page.goto('http://127.0.0.1:5173/slime-walk-lab.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__SLIME_WALK_LAB__?.snapshot?.().ready, {}, { timeout: 60000 });
  await page.waitForFunction(
    () => !String(window.__SLIME_WALK_LAB__.snapshot().storeStatus || '').includes('正在读取'),
    {},
    { timeout: 15000 },
  );

  const snap0 = await page.evaluate(() => window.__SLIME_WALK_LAB__.snapshot());
  assert.equal(snap0.mode, 'place');
  assert.equal(snap0.dirty, false);
  assert.ok(await page.locator('#curve').count());
  assert.ok(await page.locator('#lab-slimeMovePeakAt').count());
  assert.ok(await page.locator('#save-settings').count());
  assert.ok(await page.locator('#undo-settings').count());

  await page.waitForTimeout(800);
  const snap1 = await page.evaluate(() => window.__SLIME_WALK_LAB__.snapshot());
  assert.ok(snap1.moveCycleAge > 0.3, `age ${snap1.moveCycleAge}`);
  assert.ok(snap1.walk.applied, 'walk shear should apply');
  assert.ok(snap1.walk.bodyWidth > 0.5);

  await page.locator('[data-mode="shuttle"]').click();
  await page.waitForTimeout(600);
  const snap2 = await page.evaluate(() => window.__SLIME_WALK_LAB__.snapshot());
  assert.equal(snap2.mode, 'shuttle');

  const before = snap0.settings.slimeMovePeakAt;
  await page.evaluate(() => window.__SLIME_WALK_LAB__.setSetting('slimeMovePeakAt', 0.8));
  let snap3 = await page.evaluate(() => window.__SLIME_WALK_LAB__.snapshot());
  assert.equal(snap3.settings.slimeMovePeakAt, 0.8);
  assert.equal(snap3.dirty, true);
  await page.locator('#undo-settings').click();
  snap3 = await page.evaluate(() => window.__SLIME_WALK_LAB__.snapshot());
  assert.equal(snap3.settings.slimeMovePeakAt, before);
  assert.equal(snap3.dirty, false);

  await page.locator('#viewport').screenshot({ path: `${out}/place.png` });
  await page.locator('#curve').screenshot({ path: `${out}/curves.png` });

  const fatal = errors.filter(
    (e) => !/WebGPU|deprecated|AudioContext|ResizeObserver|favicon|404 \(Not Found\)/i.test(e),
  );
  assert.deepEqual(fatal, [], fatal.join('\n'));
  console.log('PASS slime-walk-lab', {
    age: snap1.moveCycleAge,
    lean: snap1.walk.lean01,
    sy: snap1.walk.sy,
    peakAt: snap3.settings.slimeMovePeakAt,
  });
} finally {
  await browser.close();
}

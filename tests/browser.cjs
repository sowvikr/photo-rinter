// Optional integration test: PLAYWRIGHT_MODULE=/path/to/playwright node tests/browser.cjs
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1300, height: 1000}});
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:8000');
    assert.equal(await page.locator('#capacity').textContent(), '31');
    assert(await page.locator('#print').isDisabled());
    // Exercise real local detector with a blank photo: it should safely fall back.
    const blank = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 600; c.height = 1000;
      const x = c.getContext('2d'); x.fillStyle = '#acbca8'; x.fillRect(0, 0, 600, 1000);
      return c.toDataURL('image/png').split(',')[1];
    });
    await page.locator('#upload').setInputFiles({name: 'test.png', mimeType: 'image/png', buffer: Buffer.from(blank, 'base64')});
    await page.waitForFunction(() => document.getElementById('face-status').textContent.startsWith('No face found'));
    assert(await page.locator('#print').isEnabled());
    await page.locator('#count').fill('63');
    assert.equal(await page.locator('#pages').textContent(), '3');
    await page.locator('#next').click(); await page.locator('#next').click();
    assert.match(await page.locator('#page-label').textContent(), /1 copies/);
    await page.evaluate(() => preparePrint());
    assert.equal(await page.locator('.print-sheet').count(), 3);
    assert.equal(await page.locator('.print-photo').count(), 63);
    await page.pdf({path: '/tmp/photoprinter-test.pdf', preferCSSPageSize: true});
    const download = page.waitForEvent('download'); await page.locator('#download').click();
    assert.match((await download).suggestedFilename(), /sheet-3-210x297mm.png/);
    await page.locator('#photo-width').fill('400');
    assert(await page.locator('#print').isDisabled());
    await page.locator('#photo-width').fill('35');
    // A deterministic face response validates crop geometry and multi-face selection.
    await page.route('**/detect', route => route.fulfill({json: {faces: [
      {x:.25, y:.12, width:.2, height:.12}, {x:.65, y:.2, width:.18, height:.11}
    ]}}));
    await page.locator('#auto-crop').click();
    await page.waitForFunction(() => document.getElementById('face-status').textContent.startsWith('2 faces found'));
    assert(Number(await page.locator('#zoom').inputValue()) > 1);
    assert(await page.locator('#face-choice').isVisible());
    await page.locator('#face-select').selectOption('1');
    await page.unroute('**/detect');
    if (process.env.FACE_FIXTURE) {
      await page.locator('#upload').setInputFiles(process.env.FACE_FIXTURE);
      await page.waitForFunction(() => document.getElementById('face-status').textContent.startsWith('Face found'));
    }
    await page.screenshot({path: '/tmp/photoprinter-preview.png', fullPage: true});
    await page.setViewportSize({width:390, height:844});
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert.deepEqual(errors, []);
    console.log('Browser checks passed: local detector, crop selection, pagination, export, print DOM, validation, mobile width.');
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exit(1);});

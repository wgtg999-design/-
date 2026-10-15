// Isolated local browser checks. No real clipboard writes, providers or users.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const baseURL = process.env.VERCEL_QA_URL || 'http://127.0.0.1:3934';
const base = new URL(baseURL);
assert.equal(base.protocol, 'http:');
assert(['localhost', '127.0.0.1'].includes(base.hostname));
const output = path.resolve(__dirname, '../../../.sites-runtime/owner-guide-qa');
fs.mkdirSync(output, { recursive: true });
const errors = [], external = [], results = [];
let browser;

(async () => {
  browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ baseURL, viewport: { width, height: 1000 } });
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== base.origin) {
        external.push('external request'); return route.abort();
      }
      return route.continue();
    });
    await context.addInitScript(() => {
      window.__qaCopies = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        async writeText(value) { window.__qaCopies.push(value); },
      } });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto('/help/owner');
    assert.equal(response.status(), 200);
    assert.equal(response.headers()['cache-control'], 'no-store');
    assert.equal(response.headers()['x-robots-tag'], 'noindex, nofollow');
    assert.equal(await page.locator('section').count(), 3);
    const dimensions = await page.evaluate(() => ({ actual: document.documentElement.scrollWidth, viewport: innerWidth }));
    assert(dimensions.actual <= dimensions.viewport + 1);
    for (const name of ['R2_ACCOUNT_ID', 'R2_BUCKET_NAME', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'UPLOAD_SIGNING_SECRET']) {
      assert((await page.locator('table').innerText()).includes(name));
    }
    results.push(`${width}px: complete owner/R2 guide and five configuration names fit without overflow`);
    await page.screenshot({ path: path.join(output, `owner-guide-${width}.png`), fullPage: true });
    await page.locator('#generate-secret').click();
    await page.locator('#generate-secret').click();
    const safe = await page.evaluate(() => {
      const values = window.__qaCopies;
      return {
        entropyShape: values.length === 2 && values.every(value => /^[a-f0-9]{64}$/.test(value)),
        different: values[0] !== values[1],
        absentFromDocument: values.every(value => !document.documentElement.outerHTML.includes(value)),
        noStorage: localStorage.length === 0 && sessionStorage.length === 0,
      };
    });
    assert.deepEqual(safe, { entropyShape: true, different: true, absentFromDocument: true, noStorage: true });
    assert((await page.locator('#copy-status').textContent()).includes('복사했습니다'));
    assert(await page.locator('#generate-secret').isEnabled());
    results.push(`${width}px: two local crypto values copied only to mock clipboard, never DOM/storage/network`);
    await page.locator('#copy-cors').click();
    const policy = await page.evaluate(() => JSON.parse(window.__qaCopies.at(-1)));
    assert.deepEqual(policy, [{ AllowedOrigins: ['https://street-label-shop.vercel.app'], AllowedMethods: ['PUT'], AllowedHeaders: ['Content-Type'], MaxAgeSeconds: 3600 }]);
    await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw Error('Synthetic denied permission'); }; });
    await page.locator('#generate-secret').click();
    assert((await page.locator('#copy-status').textContent()).includes('복사하지 못했습니다'));
    assert(await page.locator('#generate-secret').isEnabled());
    await page.goto('/setup');
    assert.equal(await page.locator('a[href="/help/owner"]').count(), 1);
    results.push(`${width}px: exact-origin PUT CORS copy, denied-copy recovery and setup link work`);
    await context.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ passed: results.length, results, errors, external, scope: 'Local Next.js guide only. No real signup, phone configuration, owner creation or R2 connection.' }, null, 2));
  console.log(`PASS: ${results.length} local browser guide checks; no provider requests, credentials, account creation or real clipboard writes.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); });

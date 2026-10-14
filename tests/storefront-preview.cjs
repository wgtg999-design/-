// Validates the exported single-file storefront without a server or API.
// Chromium file:// navigation can be disabled by managed browser policy,
// so the exact exported HTML is rendered in about:blank with setContent.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require('playwright');

const filename = process.argv[2] || path.resolve(__dirname, '../../outputs/street-label-homepage.html');
const html = fs.readFileSync(filename, 'utf8');
const directory = path.resolve('.sites-runtime/browser-qa/offline-preview');
fs.mkdirSync(directory, { recursive: true });
const results = [], errors = [], requests = [];

let scripts = 0;
for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  assert(!/\bsrc\s*=/.test(match[1]), 'Every preview script must be inline.');
  if (/\btype\s*=\s*["']application\/json["']/.test(match[1])) continue;
  new vm.Script(match[2], { filename: `${path.basename(filename)}:inline-${++scripts}` });
}
assert(scripts > 0, 'The preview must contain its storefront script.');

async function check(name, work) {
  await work();
  results.push(name);
  console.log(`PASS: ${name}`);
}
async function text(page, selector, message) {
  await page.waitForFunction(({ selector, message }) => document.querySelector(selector)?.textContent.includes(message), { selector, message });
}
async function fits(page, label) {
  const size = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert(size.content <= size.viewport + 1, `${label} horizontal overflow: ${size.content}/${size.viewport}`);
}
async function closeInfo(page) {
  await page.locator('#info-dialog .close').click();
  assert.equal(await page.locator('#info-dialog').evaluate(dialog => dialog.open), false);
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'], headless: true });
  try {
    for (const width of [1440, 390, 360, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push({ width, error: error.message }));
      page.on('request', request => {
        if (!request.url().startsWith('data:') && !request.url().startsWith('about:')) requests.push({ width, url: request.url() });
      });
      await page.route('**/*', async route => {
        if (route.request().url().startsWith('data:')) await route.continue();
        else await route.abort('blockedbyclient');
      });
      await page.setContent(html, { waitUntil: 'load' });
      await page.waitForFunction(() => document.querySelectorAll('.product').length === 4);
      await page.locator('.editorial-photo img').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => Array.from(document.images).every(img => img.complete && img.naturalWidth > 0));
      await page.evaluate(() => scrollTo(0, 0));

      await check(`${width}px: embedded photos, original product crops and ${width > 800 ? 4 : 2}-column layout without overflow`, async () => {
        assert.equal(await page.locator('#products').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), width > 800 ? 4 : 2);
        const photos = await page.locator('#products .product-photo').evaluateAll(elements => elements.map(el => ({ image: getComputedStyle(el).backgroundImage.startsWith('url("data:image/'), position: getComputedStyle(el).backgroundPosition })));
        assert.equal(photos.length, 4);
        assert(photos.every(photo => photo.image), 'Product photos must be embedded data images.');
        assert.equal(new Set(photos.map(photo => photo.position)).size, 4, 'Each product must retain its distinct original crop.');
        assert(await page.locator('header .account-link').isVisible());
        await fits(page, `${width}px initial storefront`);
        await page.screenshot({ path: path.join(directory, `home-${width}.png`), fullPage: true });
      });

      await check(`${width}px: category filters, low-price sort, empty search and reset`, async () => {
        await page.locator('[data-category=OUTER]').click();
        assert.equal(await page.locator('.product').count(), 2);
        await page.locator('[data-category=BOTTOMS]').click();
        assert.equal(await page.locator('.product').count(), 2);
        await page.locator('[data-category=ALL]').click();
        // The original mobile layout hides sorting; exercise its existing
        // change handler directly there while clicking the visible PC select.
        await page.locator('#sort').selectOption('low', { force: width <= 800 });
        assert.deepEqual(await page.locator('.product').evaluateAll(products => products.map(product => product.dataset.product)), ['trousers', 'denim', 'jacket', 'shell']);
        await page.locator('#search-button').click();
        await page.locator('#search').fill('no-such-qa-product');
        assert.equal(await page.locator('.product').count(), 0);
        assert(await page.locator('#empty').isVisible());
        await page.locator('#clear-search').click();
        assert.equal(await page.locator('.product').count(), 4);
        await page.locator('#sort').selectOption('default', { force: width <= 800 });
        await fits(page, `${width}px search controls`);
      });

      await check(`${width}px: product details and cart show unconnected stock without pretending to accept an order`, async () => {
        await page.locator('[data-product=jacket]').click();
        assert.equal(await page.locator('#product-dialog').evaluate(dialog => dialog.open), true);
        assert.equal(await page.locator('#size option:disabled').count(), 3);
        await page.locator('#add').click();
        await text(page, '#size-error', '사이즈를 먼저 선택');
        assert.equal(await page.locator('#bag-count').textContent(), '0');
        await page.locator('#product-dialog .close').click();
        await page.locator('#bag-button').click();
        await text(page, '#cart-items', '장바구니가 비어');
        await page.locator('.checkout-link').click();
        assert.equal(await page.locator('#info-dialog').evaluate(dialog => dialog.open), true);
        await text(page, '#info-content', '미리보기');
        assert(!page.url().includes('/account'), 'The offline preview must not navigate to a nonexistent account server.');
        await closeInfo(page);
        if (await page.locator('#bag-dialog').evaluate(dialog => dialog.open)) await page.locator('#bag-dialog .close').click();
      });

      await check(`${width}px: hero changes and embedded lookbook dialog opens and closes`, async () => {
        const original = await page.locator('#hero-photo').getAttribute('src');
        await page.locator('[data-slide="1"]').click();
        assert.notEqual(await page.locator('#hero-photo').getAttribute('src'), original);
        await page.waitForFunction(() => document.querySelector('#hero-photo').complete && document.querySelector('#hero-photo').naturalWidth > 0);
        await page.locator('[data-slide="0"]').click();
        await page.locator('#lookbook-button').click();
        assert.equal(await page.locator('#info-dialog').evaluate(dialog => dialog.open), true);
        await page.waitForFunction(() => document.querySelector('#info-content img')?.complete && document.querySelector('#info-content img')?.naturalWidth > 0);
        await closeInfo(page);
      });

      await check(`${width}px: signup entry explains that account registration needs the real service`, async () => {
        if (width <= 800) {
          await page.locator('.mobile-menu').click();
          assert(await page.locator('nav .menu-account-link').isVisible());
          await page.locator('nav .menu-account-link').click();
          assert.equal(await page.locator('.mobile-menu').getAttribute('aria-expanded'), 'false');
        } else await page.locator('header .account-link').click();
        assert.equal(await page.locator('#info-dialog').evaluate(dialog => dialog.open), true);
        await text(page, '#info-content', '미리보기');
        assert(!page.url().includes('/signup'), 'The preview must not claim to run account registration.');
        await page.screenshot({ path: path.join(directory, `signup-notice-${width}.png`), fullPage: true });
        await closeInfo(page);
        await fits(page, `${width}px after interactions`);
      });
      await context.close();
    }
    assert.deepEqual(errors, [], 'Inline preview must not produce browser JavaScript errors.');
    assert.deepEqual(requests, [], 'The single-file preview must make no network/API/file requests.');
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify({ filename, inlineScripts: scripts, renderMethod: 'Original exported HTML rendered with setContent in about:blank; direct file navigation is disabled by managed Chromium policy.', passed: results, errors, networkRequests: requests }, null, 2));
    console.log(`PASS: ${results.length} Chromium preview scenarios, zero JavaScript errors and zero external requests.`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

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

let scripts = 0, previewData;
const inlineSources = [];
for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  assert(!/\bsrc\s*=/.test(match[1]), 'Every preview script must be inline.');
  if (/\btype\s*=\s*["']application\/json["']/.test(match[1])) {
    assert.equal(previewData, undefined, 'The preview needs one catalog/asset payload.');
    previewData = JSON.parse(match[2]);
    continue;
  }
  inlineSources.push(match[2]);
  new vm.Script(match[2], { filename: `${path.basename(filename)}:inline-${++scripts}` });
}
assert.equal(scripts, 3, 'The preview must bootstrap its data, then load i18n and app.');
assert(previewData?.content && previewData?.assets, 'The explicit preview data must exist.');
for (const source of ['i18n.js', 'app.js']) {
  const original = fs.readFileSync(path.resolve(__dirname, '../public', source), 'utf8').replace(/<\/script/gi, '<\\/script');
  assert(inlineSources.includes(original), `The preview must reuse the actual ${source}, without modifying its functions.`);
}
assert(inlineSources[0].includes('window.StorePreviewData'), 'Preview mode must be enabled before either source script.');
assert.deepEqual(Object.keys(previewData.assets).sort(), ['/assets/campaign-wide.png', '/assets/campaign.png', '/assets/denim-model-01.png', '/assets/jacket-model-01.png', '/assets/products.png', '/assets/shell-model-01.png', '/assets/trousers-model-01.png']);
for (const [source, url] of Object.entries(previewData.assets)) {
  assert(url.startsWith('data:image/png;base64,'), 'Only the checked-in PNG assets may be bundled.');
  assert(fs.readFileSync(path.resolve(__dirname, '../public', source.slice(1))).equals(Buffer.from(url.split(',')[1], 'base64')), `${source} bytes changed.`);
  assert.equal(html.split(url).length, 2, `${source} must be embedded once.`);
}
assert.deepEqual(previewData.content.products.map(product => [product.id, product.price, product.crop, product.image]), [
  ['jacket', 129000, '', '/assets/products.png'], ['shell', 149000, 'right', '/assets/products.png'],
  ['denim', 89000, 'bottom', '/assets/products.png'], ['trousers', 79000, 'bottom right', '/assets/products.png'],
], 'The sample prices and contact-sheet identities/crops must stay intact.');

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
async function openSidebarIfNeeded(page, selector) {
  if (!(await page.locator(selector).isVisible())) {
    await page.locator('.mobile-menu').click();
    assert.equal(await page.locator('.mobile-menu').getAttribute('aria-expanded'), 'true');
    assert(await page.locator(selector).isVisible(), `${selector} must be available in the navigation drawer.`);
  }
}
async function closeSidebarIfOpen(page) {
  if (await page.locator('#site-sidebar').evaluate(sidebar => sidebar.classList.contains('open'))) {
    await page.locator('#menu-close').click();
    assert.equal(await page.locator('.mobile-menu').getAttribute('aria-expanded'), 'false');
  }
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
      // Record even invalid relative fetch attempts from about:blank. Keeping
      // the native fetch implementation also lets the request observer catch
      // any request that would otherwise reach a server.
      await page.evaluate(() => {
        window.__previewFetchCalls = [];
        const nativeFetch = window.fetch;
        window.fetch = function (...args) {
          window.__previewFetchCalls.push(String(args[0]?.url || args[0]));
          return nativeFetch.apply(this, args);
        };
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
        assert.equal(await page.locator('.quick-add, .quick-add-placement, [data-quick-add]').count(), 0, 'Product cards must not include Quick Add at any viewport.');
        if (width > 800) assert(await page.locator('#site-sidebar .account-link').isVisible());
        else {
          assert(await page.locator('.mobile-menu').isVisible());
          assert.equal(await page.locator('.mobile-menu').getAttribute('aria-expanded'), 'false');
        }
        assert(await page.locator('[data-preview-service]').count() > 0);
        const serviceHrefs = await page.locator('[data-preview-service]').evaluateAll(links => links.map(link => link.getAttribute('href')));
        assert(serviceHrefs.every(href => href === '#preview-disclaimer'), 'Service links must also remain local when JavaScript is disabled.');
        await fits(page, `${width}px initial storefront`);
        await page.screenshot({ path: path.join(directory, `home-${width}.png`), fullPage: true });
      });

      await check(`${width}px: category filters, low-price sort, empty search and reset`, async () => {
        await page.locator('.filters [data-category=OUTER]').click();
        assert.equal(await page.locator('.product').count(), 2);
        await page.locator('.filters [data-category=BOTTOMS]').click();
        assert.equal(await page.locator('.product').count(), 2);
        await page.locator('.filters [data-category=ALL]').click();
        await page.locator('#sort').selectOption('low');
        assert.deepEqual(await page.locator('.product').evaluateAll(products => products.map(product => product.dataset.product)), ['trousers', 'denim', 'jacket', 'shell']);
        await openSidebarIfNeeded(page, '#search-button');
        await page.locator('#search-button').click();
        await closeSidebarIfOpen(page);
        await page.locator('#search').fill('no-such-qa-product');
        assert.equal(await page.locator('.product').count(), 0);
        assert(await page.locator('#empty').isVisible());
        await page.locator('#clear-search').click();
        assert.equal(await page.locator('.product').count(), 4);
        await page.locator('#sort').selectOption('default');
        await fits(page, `${width}px search controls`);
      });

      await check(`${width}px: product details and cart show unconnected stock without pretending to accept an order`, async () => {
        // The photo opens the regular details; there is no Quick Add overlay.
        await page.locator('[data-product=jacket] .product-photo').click();
        assert.equal(await page.locator('#product-dialog').evaluate(dialog => dialog.open), true);
        assert.equal(await page.locator('#size option:disabled').count(), 3);
        await page.locator('#add').click();
        await text(page, '#size-error', '사이즈를 먼저 선택');
        assert.equal(await page.locator('#bag-count').textContent(), '0');
        await page.locator('#product-dialog .close').click();
        await openSidebarIfNeeded(page, '#bag-button');
        await page.locator('#bag-button').click();
        await text(page, '#cart-items', '장바구니가 비어');
        await page.locator('.checkout-link').click();
        assert.equal(await page.locator('#info-dialog').evaluate(dialog => dialog.open), true);
        await text(page, '#info-content', '미리보기');
        assert(!page.url().includes('/account'), 'The offline preview must not navigate to a nonexistent account server.');
        await closeInfo(page);
        if (await page.locator('#bag-dialog').evaluate(dialog => dialog.open)) await page.locator('#bag-dialog .close').click();
        await closeSidebarIfOpen(page);
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
          assert(await page.locator('#site-sidebar .account-link').isVisible());
          await page.locator('#site-sidebar .account-link').click();
          assert.equal(await page.locator('.mobile-menu').getAttribute('aria-expanded'), 'false');
        } else {
          await openSidebarIfNeeded(page, '#site-sidebar .account-link');
          await page.locator('#site-sidebar .account-link').click();
        }
        assert.equal(await page.locator('#info-dialog').evaluate(dialog => dialog.open), true);
        await text(page, '#info-content', '미리보기');
        assert(!page.url().includes('/signup'), 'The preview must not claim to run account registration.');
        await page.screenshot({ path: path.join(directory, `signup-notice-${width}.png`), fullPage: true });
        await closeInfo(page);
        await fits(page, `${width}px after interactions`);
      });
      if (width === 1440 || width === 320) {
        await check(`${width}px: all four languages work offline with translated service and social notices`, async () => {
          const locales = [
            ['ko', '로그인 / 회원가입', '디자인 미리보기', '연결 준비 중'],
            ['zh-CN', '登录 / 注册', '设计预览', '连接准备中'],
            ['zh-TW', '登入 / 註冊', '設計預覽', '連結準備中'],
            ['ja', 'ログイン / 会員登録', 'デザインプレビュー', '接続準備中'],
          ];
          for (const [locale, login, previewTitle, pendingTitle] of locales) {
            await openSidebarIfNeeded(page, '#language-button');
            await page.locator('#language-button').click();
            await page.locator(`[data-set-language="${locale}"]`).click();
            assert.equal(await page.locator('html').getAttribute('lang'), locale);
            assert.equal(await page.locator('#language-dialog').evaluate(dialog => dialog.open), false);
            assert.equal(await page.locator('.account-link').textContent(), login);
            assert((await page.locator('#preview-disclaimer').textContent()).includes(previewTitle));
            assert((await page.locator('.product-meta p').first().textContent()).startsWith('₩'), 'A language change must not convert or relabel Korean-won prices.');
            assert.equal(await page.locator('.quick-add, [data-quick-add]').count(), 0, 'Changing language must not restore Quick Add.');
            await openSidebarIfNeeded(page, '.account-link');
            await page.locator('.account-link').click();
            assert.equal(await page.locator('#info-content h2').textContent(), previewTitle);
            assert.equal(await page.locator('#info-dialog input').count(), 0, 'The preview must not collect customer data.');
            await closeInfo(page);
            for (const service of ['instagram', 'kakao']) {
              await openSidebarIfNeeded(page, `[data-info="${service}"]`);
              await page.locator(`[data-info="${service}"]`).click();
              assert.equal(await page.locator('#info-content h2').textContent(), pendingTitle);
              await closeInfo(page);
            }
            await fits(page, `${width}px ${locale} offline UI`);
            await page.screenshot({ path: path.join(directory, `language-${width}-${locale}.png`), fullPage: true });
          }
        });
      }
      assert.deepEqual(await page.evaluate(() => window.__previewFetchCalls), [], `${width}px: preview code must not attempt API calls, including invalid relative URLs.`);
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

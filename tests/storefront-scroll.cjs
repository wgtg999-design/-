// Scroll and drawer checks use the real storefront with synthetic, read-only
// APIs on an ephemeral loopback server. No live member/order data is touched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const contentModule = { exports: {} };
const contentCode = ts.transpileModule(fs.readFileSync(path.join(root, 'lib/content.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInThisContext('(function(require,module,exports){' + contentCode + '})', { filename: 'lib/content.ts' })(require, contentModule, contentModule.exports);
const content = contentModule.exports.defaults;
const settings = { accepting: false, shippingFee: 0, bankInfo: '', support: '', terms: '', privacy: '', returnGuide: '' };
const errors = [], externalRequests = [], unexpectedRequests = [], results = [];
const screenshots = path.join(root, '.sites-runtime/browser-qa/scroll-focus');
fs.mkdirSync(screenshots, { recursive: true });
let browser, origin;

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  const pathname = url.pathname;
  response.setHeader('Cache-Control', 'no-store');
  function send(status, type, body) { response.writeHead(status, { 'Content-Type': type }); response.end(body); }
  function json(body) { send(200, 'application/json', JSON.stringify(body)); }
  if (request.method !== 'GET') {
    unexpectedRequests.push({ method: request.method, pathname });
    return send(405, 'text/plain', 'Only synthetic read requests are supported.');
  }
  if (pathname === '/api/content') return json({ content, revision: 0 });
  if (pathname === '/api/shop' && url.searchParams.get('view') === 'stock') return json({ inventory: [] });
  if (pathname === '/api/shop' && url.searchParams.get('view') === 'settings') return json({ settings });
  if (pathname === '/api/session') return json({ isAdmin: false });
  if (pathname === '/api/policies') return json({});
  if (pathname === '/') return send(200, 'text/html', fs.readFileSync(path.join(root, 'legacy/store.html')));
  const types = { '/app.js': 'text/javascript', '/i18n.js': 'text/javascript', '/style.css': 'text/css' };
  const type = types[pathname] || (/^\/assets\/[a-zA-Z0-9._-]+\.png$/.test(pathname) ? 'image/png' : '');
  if (type) {
    const filename = path.join(root, 'public', pathname.slice(1));
    if (fs.existsSync(filename)) return send(200, type, fs.readFileSync(filename));
  }
  if (pathname !== '/favicon.ico') unexpectedRequests.push({ method: request.method, pathname });
  send(404, 'text/plain', 'No synthetic route');
});

async function until(work, message) {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    if (await work()) return;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  assert.fail(message);
}
async function check(label, work) { await work(); results.push(label); console.log('PASS: ' + label); }
async function withPage({ width = 1440, reducedMotion = 'no-preference' } = {}, work) {
  const context = await browser.newContext({ baseURL: origin, viewport: { width, height: 1000 }, reducedMotion, hasTouch: width <= 800, isMobile: width <= 800 });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    externalRequests.push(url.href); await route.abort('blockedbyclient');
  });
  try {
    await page.goto('/', { waitUntil: 'load' });
    await until(() => page.locator('#products .product').count().then(count => count === 4), 'Four synthetic products should load.');
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; });
    await work(page);
  } finally { await context.close(); }
}
async function scroll(page, y) {
  await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), y);
  // Real scroll events and compositor frames, not a mocked JS clock.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function heroHeight(page) { return page.locator('.hero').evaluate(element => element.offsetHeight); }
async function bottomOfHero(page) { return page.locator('.hero').evaluate(element => element.offsetTop + element.offsetHeight); }
async function state(page) {
  return page.locator('#site-sidebar').evaluate(element => ({
    opacity: Number(getComputedStyle(element).opacity), filter: getComputedStyle(element).filter,
    inert: element.inert, hidden: element.getAttribute('aria-hidden'),
    dissolved: element.classList.contains('is-dissolved'), focused: element.contains(document.activeElement),
    catalog: document.body.classList.contains('catalog-focus'),
    desktopOpen: document.body.classList.contains('desktop-menu-open'),
    open: element.classList.contains('open'),
  }));
}
async function fits(page, label) {
  const size = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert(size.width <= size.viewport + 1, `${label}: horizontal overflow ${JSON.stringify(size)}`);
}
async function assertClosed(page) {
  await until(async () => !(await state(page)).open, 'Drawer should close.');
  assert.equal(await page.locator('#menu-backdrop').evaluate(element => element.hidden), true);
  assert.equal(await page.locator('.mobile-menu').getAttribute('aria-expanded'), 'false');
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'], headless: true });
  try {
    await check('Desktop rail dissolves continuously and restores when scrolling back to the banner', () => withPage({}, async page => {
      const initial = await state(page);
      assert.equal(initial.opacity, 1); assert.equal(initial.inert, false); assert.equal(initial.catalog, false);
      await scroll(page, (await heroHeight(page)) * .55);
      await until(async () => { const current = await state(page); return current.opacity > 0 && current.opacity < 1; }, 'Partial scrolling should partially fade the desktop rail.');
      assert.match((await state(page)).filter, /blur\((?!0px)/);
      await page.screenshot({ path: path.join(screenshots, 'rail-partial.png'), animations: 'disabled' });
      await scroll(page, (await bottomOfHero(page)) + 100);
      await until(async () => { const current = await state(page); return current.dissolved && current.inert && current.catalog && current.opacity === 0; }, 'The dissolved desktop rail should be inert after the banner.');
      assert.equal((await state(page)).hidden, 'true');
      await scroll(page, 0);
      await until(async () => { const current = await state(page); return current.opacity === 1 && !current.inert && !current.dissolved && !current.catalog; }, 'Scrolling up should restore the original navigation.');
      assert.notEqual((await state(page)).hidden, 'true');
    }));

    await check('Desktop catalog uses four stable larger columns and a full-width campaign at 801, 900, 1440 and 1920px', async () => {
      for (const width of [801, 900, 1440, 1920]) await withPage({ width }, async page => {
        const bounds = await page.locator('.hero').boundingBox();
        assert(Math.abs(bounds.x) <= 1 && Math.abs(bounds.width - width) <= 1, `Campaign fills ${width}px viewport.`);
        const originalPhotoWidth = await page.locator('#products .product-photo').first().evaluate(element => element.getBoundingClientRect().width);
        await scroll(page, (await bottomOfHero(page)) + 100);
        await until(async () => (await state(page)).catalog, 'Catalog focus mode should activate.');
        const grid = await page.locator('#products').evaluate(element => ({
          count: getComputedStyle(element).gridTemplateColumns.split(' ').length,
          x: element.getBoundingClientRect().left, width: element.getBoundingClientRect().width,
          photo: element.querySelector('.product-photo').getBoundingClientRect().width,
        }));
        assert.equal(grid.count, 4);
        assert(Math.abs(grid.photo - originalPhotoWidth) <= 1, 'Photo dimensions stay stable while the navigation fades.');
        assert(grid.x <= 45, `Products should use the old rail space at ${width}px: ${JSON.stringify(grid)}`);
        const oldRail = width >= 1700 ? 260 : 240, oldPadding = width >= 1700 ? 80 : 56;
        const oldPhoto = (width - oldRail - oldPadding - 30) / 4;
        assert(grid.photo > oldPhoto + 35, `Product photos should be materially wider at ${width}px: ${JSON.stringify(grid)}`);
        const logo = await page.locator('.mobile-logo').boundingBox();
        assert(Math.abs(logo.x + logo.width / 2 - width / 2) <= 1, `Compact logo is centered at ${width}px.`);
        await fits(page, `${width}px catalog`);
        if (width === 1440) {
          await scroll(page, (await bottomOfHero(page)) - 60);
          await page.screenshot({ path: path.join(screenshots, 'desktop-1440.png'), animations: 'disabled' });
        }
      });
    });

    await check('Compact desktop MENU reopens the full drawer, traps focus, and Escape restores MENU focus', () => withPage({}, async page => {
      await scroll(page, (await bottomOfHero(page)) + 100);
      const menu = page.locator('.mobile-menu');
      await menu.click();
      await until(async () => (await state(page)).desktopOpen, 'Desktop MENU should reopen the navigation.');
      const open = await state(page);
      assert(open.open && !open.inert && open.opacity === 1);
      assert.equal(await menu.getAttribute('aria-expanded'), 'true');
      assert.equal(await page.locator('#menu-backdrop').evaluate(element => element.hidden), false);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'menu-close');
      for (const selector of ['#language-button', '.account-link', '#search-button', '[data-info="instagram"]']) assert(await page.locator(selector).isVisible(), `${selector} remains reachable through MENU.`);
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.evaluate(() => document.querySelector('#site-sidebar').contains(document.activeElement)), true);
      assert.notEqual(await page.evaluate(() => document.activeElement.id), 'menu-close', 'Shift+Tab wraps to the last drawer item.');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'menu-close');
      await page.keyboard.press('Escape'); await assertClosed(page);
      assert.equal(await page.evaluate(() => document.activeElement.classList.contains('mobile-menu')), true);
      assert((await state(page)).inert && (await state(page)).dissolved);
    }));

    await check('Desktop drawer closes through the backdrop and can open language and search tools', () => withPage({}, async page => {
      await scroll(page, (await bottomOfHero(page)) + 100);
      await page.locator('.mobile-menu').click();
      await page.locator('#menu-backdrop').click({ position: { x: 1300, y: 250 } });
      await assertClosed(page);
      await page.locator('.mobile-menu').click();
      await page.locator('#language-button').click();
      assert.equal(await page.locator('#language-dialog').evaluate(dialog => dialog.open), true);
      await page.locator('#language-dialog .close').click();
      await page.locator('.mobile-menu').click();
      await page.locator('#search-button').click();
      assert.equal(await page.locator('#search-area').evaluate(element => element.hidden), false);
      await until(() => page.evaluate(() => document.activeElement.id === 'search'), 'SEARCH should focus the catalog search field.');
      await assertClosed(page);
    }));

    await check('The desktop drawer logo returns to the banner and clears its backdrop and scroll lock', () => withPage({}, async page => {
      await scroll(page, (await bottomOfHero(page)) + 100);
      await page.locator('.mobile-menu').click();
      await page.locator('#site-sidebar .logo').click();
      await assertClosed(page);
      await until(async () => { const current = await state(page); return !current.catalog && !current.inert && current.opacity === 1; }, 'The original banner rail should be restored after following its logo.');
      assert.equal(await page.evaluate(() => document.body.classList.contains('menu-is-open')), false);
      assert.equal(await page.evaluate(() => scrollY), 0);
    }));

    await check('Scrolling back from a focused compact MENU or CART transfers focus to visible rail controls', () => withPage({}, async page => {
      for (const [compact, original] of [['.mobile-menu', '#site-sidebar .logo'], ['#mobile-bag-button', '#bag-button']]) {
        await page.locator('#shop').evaluate(element => element.focus({ preventScroll: true }));
        await scroll(page, (await bottomOfHero(page)) + 100);
        await page.locator(compact).focus();
        await scroll(page, 0);
        await until(() => page.locator(original).evaluate(element => element === document.activeElement), `Focus on ${compact} should transfer to ${original} before the compact bar hides.`);
        assert.equal((await state(page)).inert, false);
      }
    }));

    await check('Keyboard navigation in the original rail remains visible while its control retains focus', () => withPage({}, async page => {
      // A real Tab marks keyboard focus, unlike a programmatic focus alone.
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await until(() => page.evaluate(() => document.querySelector('#site-sidebar').contains(document.activeElement)), 'Tab should reach the original desktop rail.');
      await scroll(page, (await bottomOfHero(page)) + 100);
      await until(async () => { const current = await state(page); return current.opacity === 1 && !current.inert && current.focused; }, 'A focused desktop rail must not dissolve under the keyboard user.');
      await page.locator('#sort').evaluate(element => element.focus({ preventScroll: true }));
      await until(async () => (await state(page)).inert, 'The rail can dissolve after focus has moved into the catalog.');
    }));

    await check('Reduced motion avoids blur while retaining menu access and scroll restoration', () => withPage({ reducedMotion: 'reduce' }, async page => {
      await scroll(page, (await heroHeight(page)) * .55);
      assert(['none', 'blur(0px)'].includes((await state(page)).filter));
      await scroll(page, (await bottomOfHero(page)) + 100);
      await until(async () => (await state(page)).inert, 'The inactive rail should still become inert.');
      await page.locator('.mobile-menu').click();
      assert((await state(page)).open && !(await state(page)).inert);
      await page.keyboard.press('Escape'); await assertClosed(page);
      await scroll(page, 0);
      await until(async () => !(await state(page)).inert && (await state(page)).opacity === 1, 'Banner rail should restore with reduced motion.');
    }));

    await check('Mobile keeps two columns and its sticky MENU, drawer and cart at 800, 390 and 320px', async () => {
      for (const width of [800, 390, 320]) await withPage({ width }, async page => {
        assert.equal(await page.locator('#products').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length), 2);
        assert.equal((await state(page)).inert, true);
        await scroll(page, (await bottomOfHero(page)) + 100);
        const bar = await page.locator('.mobile-bar').boundingBox();
        assert(bar.y >= -1 && bar.y <= 1, 'Mobile bar remains at the top.');
        await page.locator('.mobile-menu').click();
        assert((await state(page)).open && !(await state(page)).inert);
        await page.locator('#menu-close').click(); await assertClosed(page);
        assert.equal((await state(page)).inert, true);
        await page.locator('#mobile-bag-button').click();
        assert.equal(await page.locator('#bag-dialog').evaluate(dialog => dialog.open), true);
        await page.locator('#bag-dialog .close').click();
        await fits(page, `${width}px mobile catalog`);
        if (width === 390) {
          await scroll(page, (await bottomOfHero(page)) - 60);
          await page.screenshot({ path: path.join(screenshots, 'mobile390.png'), animations: 'disabled' });
        }
      });
    });

    await check('Resizing between open desktop and mobile drawers clears stale overlays and restores usable navigation', () => withPage({}, async page => {
      for (const [desktopWidth, mobileWidth] of [[1440, 390], [801, 800]]) {
        await page.setViewportSize({ width: desktopWidth, height: 1000 });
        await page.locator('#shop').evaluate(element => element.focus({ preventScroll: true }));
        await scroll(page, (await bottomOfHero(page)) + 100);
        await page.locator('.mobile-menu').click();
        await page.setViewportSize({ width: mobileWidth, height: 1000 });
        await assertClosed(page);
        assert.equal((await state(page)).inert, true);
        assert.equal((await state(page)).desktopOpen, false);
        await page.locator('.mobile-menu').click();
        await page.setViewportSize({ width: desktopWidth, height: 1000 });
        await assertClosed(page);
        assert.equal((await state(page)).desktopOpen, false);
        // Responsive layout changes can make the browser anchor the viewport to
        // an earlier banner position. Scroll past its current bottom explicitly.
        await page.locator('#shop').evaluate(element => element.focus({ preventScroll: true }));
        await scroll(page, (await bottomOfHero(page)) + 100);
        await until(async () => (await state(page)).inert && !(await state(page)).desktopOpen, 'Desktop catalog should return to the compact navigation after resizing and scrolling past its banner.');
        await scroll(page, 0);
        await until(async () => !(await state(page)).inert, 'Original desktop rail becomes usable again at the campaign.');
        await fits(page, 'Resized desktop');
      }
    }));

    assert.deepEqual(errors, [], 'No browser runtime errors.');
    assert.deepEqual(externalRequests, [], 'No external network requests.');
    assert.deepEqual(unexpectedRequests, [], 'Only isolated static files and synthetic read APIs are requested.');
    console.log(`Validated ${results.length} storefront scroll scenarios with zero external requests.`);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

// Real storefront sources with synthetic, read-only APIs on an ephemeral local
// server. No worker, provider credentials, customer records or external network.
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
const defaults = contentModule.exports.defaults;
const settings = { accepting: false, shippingFee: 0, bankInfo: '', support: '', terms: '', privacy: '', returnGuide: '' };
const modelMap = {
  jacket: { image: '/assets/campaign.png', focus: 'upper' },
  denim: { image: '/assets/products.png', focus: 'lower' },
  shell: { image: '/assets/missing-model.png', focus: 'upper' },
};
const fixtures = {
  normal: defaults,
  single: { ...defaults, heroImages: [defaults.heroImages[0]] },
  brokenHero: { ...defaults, heroImages: [defaults.heroImages[0], '/assets/missing-hero.png'] },
  noModels: defaults,
};
const errors = [], externalRequests = [], unexpectedRequests = [], results = [];
let browser, origin;

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  const fixtureName = request.headers['x-media-fixture'] || 'normal';
  const fixture = fixtures[fixtureName];
  response.setHeader('Cache-Control', 'no-store');
  function send(status, type, body) { response.writeHead(status, { 'Content-Type': type }); response.end(body); }
  function json(body) { send(200, 'application/json', JSON.stringify(body)); }
  if (request.method !== 'GET' || !fixture) {
    unexpectedRequests.push({ method: request.method, pathname });
    send(405, 'text/plain', 'Only synthetic read requests are supported.'); return;
  }
  if (pathname === '/api/content') return json({ content: fixture, revision: 0 });
  if (pathname === '/api/shop') {
    const view = new URL(request.url, 'http://127.0.0.1').searchParams.get('view');
    if (view === 'stock') return json({ inventory: [] });
    if (view === 'settings') return json({ settings });
  }
  if (pathname === '/api/session') return json({ isAdmin: false });
  if (pathname === '/api/policies') return json({});
  if (pathname === '/') return send(200, 'text/html', fs.readFileSync(path.join(root, 'legacy/store.html')));
  if (pathname === '/app.js') {
    let source = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
    // Replace only this local response's photo fixture. Locate its AST node so
    // adding the owner's real photos later does not invalidate the test suite.
    const parsed = ts.createSourceFile('app.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const values = [];
    function visit(node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'PRODUCT_LOOKS') values.push(node.initializer);
      ts.forEachChild(node, visit);
    }
    visit(parsed);
    assert.equal(values.length, 1, 'One explicit product-photo map is required.');
    const value = values[0];
    source = source.slice(0, value.getStart(parsed)) + JSON.stringify(fixtureName === 'noModels' ? {} : modelMap) + source.slice(value.end);
    return send(200, 'text/javascript', source);
  }
  const staticFiles = { '/i18n.js': 'text/javascript', '/style.css': 'text/css' };
  const type = staticFiles[pathname] || (/^\/assets\/[a-zA-Z0-9._-]+\.png$/.test(pathname) ? 'image/png' : '');
  if (type) {
    const filename = path.join(root, 'public', pathname.slice(1));
    if (fs.existsSync(filename)) return send(200, type, fs.readFileSync(filename));
    if (pathname === '/assets/missing-model.png' || pathname === '/assets/missing-hero.png') return send(404, 'text/plain', 'Synthetic missing image');
  }
  if (pathname !== '/favicon.ico') unexpectedRequests.push({ method: request.method, pathname });
  send(404, 'text/plain', 'No synthetic route');
});

async function check(label, work) {
  await work(); results.push(label); console.log('PASS: ' + label);
}
async function until(work, message) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await work()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.fail(message);
}
async function settle(page, milliseconds = 500) {
  // Paused virtual timers make the five-second boundary deterministic. Network
  // decode promises still resolve asynchronously, so allow their microtasks to
  // finish before advancing animation frames and the crossfade completion.
  await new Promise(resolve => setTimeout(resolve, 30));
  await page.clock.runFor(milliseconds);
  await new Promise(resolve => setTimeout(resolve, 30));
}
async function open({ fixture = 'normal', width = 1440, reducedMotion = 'no-preference', touch = false } = {}) {
  const context = await browser.newContext({
    baseURL: origin, viewport: { width, height: 1000 }, reducedMotion,
    hasTouch: touch, isMobile: touch, extraHTTPHeaders: { 'x-media-fixture': fixture },
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) await route.continue();
    else { externalRequests.push(url.href); await route.abort('blockedbyclient'); }
  });
  assert(page.clock, 'This suite requires Playwright clock support.');
  const epoch = new Date('2026-10-15T00:00:00Z');
  await page.clock.install({ time: epoch });
  await page.clock.pauseAt(epoch);
  await page.goto('/', { waitUntil: 'load' });
  await until(() => page.locator('#products .product').count().then(count => count === 4), 'Four synthetic products should load.');
  await until(() => page.locator('#hero-photo').evaluate(img => img.complete && img.naturalWidth > 0), 'The initial campaign image should decode.');
  return { page, context };
}
async function withPage(options, work) {
  const { page, context } = await open(options);
  try { await work(page); } finally { await context.close(); }
}
async function selected(page) { return page.locator('[data-slide][aria-pressed="true"]').getAttribute('data-slide'); }
async function heroSource(page) { return page.locator('#hero-photo').getAttribute('src'); }
async function commitSlide(page, index) {
  const source = defaults.heroImages[index];
  await until(() => page.evaluate(source => {
    const current = document.querySelector('#hero-photo'), next = document.querySelector('#hero-photo-next');
    return current.getAttribute('src') === source || (!next.hidden && next.getAttribute('src') === source);
  }, source), 'The requested slide should decode before committing.');
  await settle(page);
  assert.equal(await heroSource(page), source);
}
async function leaveHero(page) {
  // Banner hover/focus pauses are intentional. Move onto the fixed sidebar and
  // focus outside the banner without scrolling it out of view.
  await page.mouse.move(10, 10);
  await page.evaluate(() => document.querySelector('#sort').focus({ preventScroll: true }));
}
async function fits(page, label) {
  const size = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert(size.document <= size.viewport + 1, `${label}: horizontal overflow ${JSON.stringify(size)}`);
}
async function style(locator) {
  return locator.evaluate(element => {
    const css = getComputedStyle(element);
    return { opacity: Number(css.opacity), scale: new DOMMatrixReadOnly(css.transform).a, duration: css.transitionDuration, animation: css.animationName, position: css.objectPosition };
  });
}
async function animatedStyle(locator, expected) {
  // Browser CSS transitions use the compositor clock, independent of the
  // page's mocked JavaScript timers. Observe their final computed values.
  await until(async () => {
    const current = await style(locator);
    return Object.entries(expected).every(([key, value]) => current[key] === value);
  }, 'The photo transition should reach its requested visual state.');
  return style(locator);
}
async function readyModels(page, scope = '#products') {
  await until(() => page.locator(`${scope} .is-model-ready .packshot-model-layer`).count().then(count => count === 2), 'Only the two decodable model photos should become ready.');
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'], headless: true });
  try {
    await check('Autoplay waits five seconds, crossfades the decoded next image, then wraps', () => withPage({}, async page => {
      const original = await heroSource(page);
      await page.clock.runFor(4999);
      assert.equal(await heroSource(page), original);
      assert.equal(await selected(page), '0');
      await page.clock.runFor(1);
      await until(() => page.locator('#hero-photo-next').evaluate(img => img.complete && img.naturalWidth > 0 && !img.hidden), 'Next image should decode before its crossfade.');
      await settle(page, 32);
      assert.equal(await heroSource(page), original, 'The original remains visible underneath the incoming image.');
      assert.equal(await page.locator('#hero-photo-next').getAttribute('src'), defaults.heroImages[1]);
      assert(await page.locator('#hero-photo-next').evaluate(img => img.classList.contains('is-entering')));
      assert((await style(page.locator('#hero-photo-next'))).duration.split(', ').includes('0.4s'));
      await settle(page);
      assert.equal(await heroSource(page), defaults.heroImages[1]);
      assert.equal(await selected(page), '1');
      await settle(page, 5500);
      await commitSlide(page, 0);
      assert.equal(await heroSource(page), original, 'Autoplay should wrap to the first image.');
    }));

    await check('Pause/play stops and resumes autoplay with translated accessible labels', () => withPage({}, async page => {
      const original = await heroSource(page), toggle = page.locator('#hero-toggle');
      assert.equal(await toggle.getAttribute('aria-label'), await page.evaluate(() => StoreI18n.t('home.pauseSlideshow')));
      await toggle.click();
      assert.equal(await toggle.getAttribute('aria-label'), await page.evaluate(() => StoreI18n.t('home.playSlideshow')));
      assert((await toggle.textContent()).trim().includes('▶'));
      await settle(page, 11000);
      assert.equal(await heroSource(page), original);
      for (const locale of ['zh-CN', 'zh-TW', 'ja']) {
        await page.evaluate(locale => StoreI18n.setLanguage(locale), locale);
        assert.equal(await toggle.getAttribute('aria-label'), await page.evaluate(() => StoreI18n.t('home.playSlideshow')));
      }
      await toggle.click();
      assert.equal(await toggle.getAttribute('aria-label'), await page.evaluate(() => StoreI18n.t('home.pauseSlideshow')));
      assert((await toggle.textContent()).trim().includes('Ⅱ'));
      await leaveHero(page);
      await settle(page, 5500);
      await commitSlide(page, 1);
      assert.equal(await heroSource(page), defaults.heroImages[1]);
    }));

    await check('Manual pagination resets its timer and the latest rapid selection wins', () => withPage({}, async page => {
      await page.clock.runFor(4500);
      await page.locator('[data-slide="1"]').click();
      await leaveHero(page);
      await commitSlide(page, 1);
      assert.equal(await heroSource(page), defaults.heroImages[1]);
      await settle(page, 4500);
      assert.equal(await heroSource(page), defaults.heroImages[1], 'The old autoplay deadline must not override a manual selection.');
      await page.evaluate(() => {
        document.querySelector('[data-slide="0"]').click();
        document.querySelector('[data-slide="1"]').click();
        document.querySelector('[data-slide="0"]').click();
      });
      await commitSlide(page, 0);
      assert.equal(await heroSource(page), defaults.heroImages[0]);
      assert.equal(await selected(page), '0');
      assert.equal(await page.locator('#hero-photo-next').evaluate(img => img.hidden), true);
    }));

    await check('A single campaign image keeps its controls inert and never auto-advances', () => withPage({ fixture: 'single' }, async page => {
      assert.equal(await page.locator('[data-slide]').count(), 1);
      const toggle = page.locator('#hero-toggle');
      assert(await toggle.isHidden() || await toggle.isDisabled(), 'A one-image slideshow has no playback action.');
      await settle(page, 16000);
      assert.equal(await heroSource(page), defaults.heroImages[0]);
      assert.equal(await selected(page), '0');
    }));

    await check('Reduced motion disables autoplay and animation while preserving manual selection', () => withPage({ reducedMotion: 'reduce' }, async page => {
      await settle(page, 16000);
      assert.equal(await heroSource(page), defaults.heroImages[0]);
      await page.locator('[data-slide="1"]').click();
      await settle(page);
      assert.equal(await heroSource(page), defaults.heroImages[1]);
      const jacket = page.locator('[data-product="jacket"]');
      await readyModels(page); await jacket.hover(); await settle(page);
      const photo = await style(jacket.locator('.packshot-model-layer'));
      assert.equal(photo.scale, 1);
      assert(photo.duration.split(', ').every(duration => duration === '0s'));
    }));

    await check('A failed next campaign keeps the current image and selected pagination intact', () => withPage({ fixture: 'brokenHero' }, async page => {
      await page.locator('[data-slide="1"]').click();
      await settle(page);
      assert.equal(await heroSource(page), defaults.heroImages[0]);
      assert.equal(await selected(page), '0');
      await settle(page, 11000);
      assert.equal(await heroSource(page), defaults.heroImages[0]);
      assert.equal(await page.locator('#hero-photo').evaluate(img => img.complete && img.naturalWidth > 0), true);
      assert.equal(await page.locator('#hero-photo-next').evaluate(img => img.hidden), true);
    }));

    await check('Only decoded mapped photos replace packshots; broken or absent models preserve their crops', () => withPage({}, async page => {
      await readyModels(page);
      for (const id of ['jacket', 'denim']) {
        const photo = page.locator(`[data-product="${id}"] .product-photo`);
        assert(await photo.evaluate(element => element.classList.contains('has-model')));
        assert.equal(await photo.locator('.packshot-model-layer').getAttribute('data-focus'), modelMap[id].focus);
        assert.equal(await photo.locator('.packshot-model-layer').evaluate(img => img.complete && img.naturalWidth > 0), true);
      }
      const shell = page.locator('[data-product="shell"] .product-photo');
      assert.equal(await shell.evaluate(element => element.classList.contains('is-model-ready')), false);
      assert.equal(await page.locator('[data-product="trousers"] .packshot-model-layer').count(), 0);
      const crops = await page.locator('#products .product-photo').evaluateAll(photos => photos.map(photo => {
        const outer = getComputedStyle(photo), stage = getComputedStyle(photo.querySelector('.packshot-stage'));
        return { position: outer.backgroundPosition, preserved: outer.backgroundImage === stage.backgroundImage && outer.backgroundPosition === stage.backgroundPosition && outer.backgroundSize === stage.backgroundSize };
      }));
      assert(crops.every(crop => crop.preserved));
      assert.equal(new Set(crops.map(crop => crop.position)).size, 4);
      await page.locator('[data-product="shell"]').hover(); await settle(page);
      assert.equal((await style(shell.locator('.packshot-stage'))).opacity, 1, 'A failed model must not fade its working packshot away.');
    }));

    await check('Photo mapping stays attached to the product ID after sorting and category rendering', () => withPage({}, async page => {
      await page.locator('#sort').selectOption('low'); await readyModels(page);
      assert.deepEqual(await page.locator('#products .product').evaluateAll(items => items.map(item => item.dataset.product)), ['trousers', 'denim', 'jacket', 'shell']);
      for (const id of ['jacket', 'denim']) assert.equal(await page.locator(`[data-product="${id}"] .packshot-model-layer`).getAttribute('src'), modelMap[id].image);
      await page.locator('[data-category="BOTTOMS"]').click();
      assert.deepEqual(await page.locator('#products .product').evaluateAll(items => items.map(item => item.dataset.product)), ['trousers', 'denim']);
      assert.equal(await page.locator('[data-product="denim"] .packshot-model-layer').getAttribute('data-focus'), 'lower');
      assert.equal(await page.locator('[data-product="trousers"] .packshot-model-layer').count(), 0);
    }));

    await check('Desktop hover and keyboard focus reveal a 1.5× model over .4s; details animate and zoom', () => withPage({}, async page => {
      await readyModels(page);
      const jacket = page.locator('[data-product="jacket"]'), layer = jacket.locator('.packshot-model-layer');
      assert.equal((await style(layer)).opacity, 0);
      await jacket.hover(); await settle(page);
      const hovered = await animatedStyle(layer, { opacity: 1, scale: 1.5 });
      assert.equal(hovered.opacity, 1); assert.equal(hovered.scale, 1.5);
      assert(hovered.duration.split(', ').every(duration => duration === '0.4s'));
      await page.mouse.move(0, 0); await page.keyboard.press('Tab'); await jacket.focus(); await settle(page);
      assert(await jacket.evaluate(element => element.matches(':focus-visible')));
      assert.equal((await animatedStyle(layer, { scale: 1.5 })).scale, 1.5);
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#product-dialog').evaluate(dialog => dialog.open), true);
      const detail = page.locator('#product-detail .product-photo');
      await until(() => detail.evaluate(element => element.classList.contains('is-model-ready')), 'The detail model should decode independently.');
      await page.mouse.move(0, 0); await settle(page);
      const detailStyle = await animatedStyle(detail.locator('.packshot-model-layer'), { opacity: 1, scale: 1 });
      assert.equal(detailStyle.opacity, 1); assert.equal(detailStyle.scale, 1);
      assert.equal(detailStyle.animation, 'detail-model-enter');
      await detail.hover(); await settle(page);
      assert.equal((await animatedStyle(detail.locator('.packshot-model-layer'), { scale: 1.5 })).scale, 1.5);
      await page.locator('#product-dialog .close').click();
      assert.equal(await page.locator('#product-dialog').evaluate(dialog => dialog.open), false);
    }));

    await check('Unmapped packshots and product details fit desktop and small touch screens', async () => {
      for (const width of [1440, 390, 320]) await withPage({ fixture: 'noModels', width, touch: width < 800 }, async page => {
        await fits(page, `${width}px storefront`);
        assert.equal(await page.locator('#products').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length), width > 800 ? 4 : 2);
        assert.equal(await page.locator('.packshot-model-layer').count(), 0, 'Products without a model mapping must keep the catalog packshots.');
        await page.locator('[data-product="jacket"]').click();
        assert.equal(await page.locator('#product-dialog').evaluate(dialog => dialog.open), true);
        assert.equal(await page.locator('#product-detail h2').textContent(), defaults.products[0].name);
        await fits(page, `${width}px product detail`);
        const bounds = await page.locator('#product-dialog').boundingBox();
        assert(bounds.x >= -1 && bounds.x + bounds.width <= width + 1);
        await page.locator('#product-dialog .close').click();
      });
    });

    assert.deepEqual(errors, [], 'No browser runtime errors.');
    assert.deepEqual(externalRequests, [], 'The suite must never request an external host.');
    assert.deepEqual(unexpectedRequests, [], 'Only the isolated static files and synthetic read APIs may be requested.');
    console.log(`Validated ${results.length} storefront media scenarios with zero external requests.`);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

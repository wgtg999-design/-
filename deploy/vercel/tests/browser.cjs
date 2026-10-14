// Production Next.js smoke tests without external credentials or data writes.
// Visual catalog tests intercept ONLY public read APIs with the original demo
// catalog; real session, member, owner, upload and auth requests stay untouched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../../..');
const baseURL = process.env.VERCEL_QA_URL || 'http://127.0.0.1:3901';
const target = new URL(baseURL);
assert(target.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(target.hostname), 'Use an isolated local production Next.js server.');
const output = path.join(root, '.sites-runtime/vercel-qa');
fs.mkdirSync(output, { recursive: true });
const moduleObject = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'lib/content.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: moduleObject.exports, module: moduleObject, require, URL });
const catalog = JSON.parse(JSON.stringify(moduleObject.exports.defaults));
assert.equal(catalog.products.length, 4);
const settings = { accepting: false, shippingFee: 0, bankInfo: '', support: '', terms: '', privacy: '', returnGuide: '' };
const forgedIdentity = { 'oai-authenticated-user-id': 'forged-owner', 'oai-authenticated-user-email': 'forged-owner@example.test' };
const locales = ['ko', 'zh-CN', 'zh-TW', 'ja'];
const loginLabels = ['로그인 / 회원가입', '登录 / 注册', '登入 / 註冊', 'ログイン / 会員登録'];
const results = [], errors = [], externalRequests = [];
let browser;

async function check(label, action) { await action(); results.push(label); console.log('PASS: ' + label); }
async function fits(page, label) {
  const sizes = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert(sizes.content <= sizes.viewport + 1, `${label}: horizontal overflow ${JSON.stringify(sizes)}`);
}
async function publicFixtures(context) {
  await context.route('**/api/content', route => route.fulfill({ json: { content: catalog, revision: 0, updatedAt: null } }));
  await context.route('**/api/shop?view=stock', route => route.fulfill({ json: { inventory: [] } }));
  await context.route('**/api/shop?view=settings', route => route.fulfill({ json: { settings, revision: 0 } }));
}
async function language(page, value, width) {
  if (width <= 800) await page.locator('.mobile-menu').click();
  await page.locator('#language-button').click();
  await page.locator(`[data-set-language="${value}"]`).click();
  await page.waitForFunction(value => document.documentElement.lang === value, value);
}
async function assertNoOldIdentityText(page) {
  assert(!/ChatGPT/i.test(await page.locator('body').textContent()), 'Vercel interface must describe email authentication rather than Sites authentication.');
}

(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  async function context(width = 1440, fixture = false, headers = {}) {
    const c = await browser.newContext({ baseURL, viewport: { width, height: 1000 }, extraHTTPHeaders: headers, reducedMotion: 'reduce' });
    c.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    await c.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== target.origin) { externalRequests.push(url.origin); return route.abort(); }
      return route.continue();
    });
    if (fixture) await publicFixtures(c);
    return c;
  }
  try {
    const raw = await context();
    await check('Production storefront and all customer assets return styled HTML, CSS, JavaScript and original images', async () => {
      const home = await raw.request.get('/');
      assert.equal(home.status(), 200);
      assert((await home.text()).includes('site-sidebar'));
      assert.match(home.headers()['content-type'], /text\/html/);
      assert.equal(home.headers()['x-content-type-options'], 'nosniff');
      for (const asset of ['/style.css', '/app.js', '/i18n.js', '/commerce.css', '/account.js', '/customer-brand.js', ...new Set([...catalog.heroImages, catalog.journalImage, ...catalog.products.map(product => product.image)])]) {
        const response = await raw.request.get(asset);
        assert.equal(response.status(), 200, asset);
        assert((await response.body()).length > 100, asset + ': asset must not be an empty response.');
      }
    });
    await check('Without external configuration, catalog fails visibly and offers retry instead of pretending to be operational', async () => {
      const page = await raw.newPage();
      await page.goto('/');
      await page.locator('#retry-products').waitFor();
      assert.equal(await page.locator('#products .product').count(), 0);
      assert((await page.locator('#products').innerText()).trim().length > 10);
      await fits(page, 'Unconfigured storefront');
      assert.equal(await page.locator('#site-sidebar').evaluate(el => getComputedStyle(el).position), 'fixed');
      await page.screenshot({ path: path.join(output, 'unconfigured-storefront.png'), fullPage: true });
      await page.close();
    });
    await check('Email auth and optional callback routes explicitly return setup-required 503 without credentials', async () => {
      for (const pathname of ['/auth/sign-in', '/auth/sign-in/authenticate', '/auth/sign-up', '/auth/sign-up/verify-email-address', '/auth/verify-email', '/auth/sign-out']) {
        const response = await raw.request.get(pathname);
        assert.equal(response.status(), 503, pathname);
        const text = await response.text();
        assert(text.includes('로그인 연결 준비 중') && text.includes('이메일'), pathname);
        assert(!/ChatGPT/.test(text));
        assert.equal(response.headers()['cache-control'], 'no-store');
      }
    });
    await check('Forged Sites identity headers cannot access owner pages, content, commerce or either upload action', async () => {
      const forged = await context(1440, false, forgedIdentity);
      const session = await forged.request.get('/api/session');
      assert.equal(session.status(), 200);
      assert.deepEqual(await session.json(), { isAdmin: false });
      for (const pathname of ['/admin', '/admin/orders']) {
        const response = await forged.request.get(pathname, { maxRedirects: 0 });
        assert.equal(response.status(), 302, pathname);
        const redirect = new URL(response.headers().location, baseURL);
        assert(['127.0.0.1', 'localhost'].includes(redirect.hostname) && redirect.port === target.port, 'Local Next.js may use localhost internally, but redirects must stay on the local test server.');
        assert.equal(redirect.pathname, '/auth/sign-in');
        assert.equal(redirect.searchParams.get('next'), pathname);
        assert(!(await response.text()).includes('id="admin-content"'));
      }
      for (const [pathname, method, data] of [
        ['/api/admin/content', 'GET'], ['/api/admin/content', 'PUT', { revision: 0, content: {} }],
        ['/api/admin/commerce', 'GET'], ['/api/admin/commerce', 'POST', { action: 'settings' }],
        ['/api/admin/upload', 'POST', { action: 'init', contentType: 'image/png', size: 1 }],
        ['/api/admin/upload', 'POST', { action: 'complete', token: 'forged' }],
      ]) {
        const response = await forged.request.fetch(pathname, { method, ...(data ? { data } : {}), headers: { Origin: baseURL } });
        assert.equal(response.status(), 403, pathname + ' ' + method);
        assert((await response.json()).error.includes('관리자'));
      }
      await forged.close();
    });
    await check('Unauthenticated membership and order APIs deny forged identities and keep checkout return path internal', async () => {
      const forged = await context(1440, false, forgedIdentity);
      for (const [method, data] of [['GET'], ['POST', { action: 'register', name: 'QA member' }], ['POST', { action: 'create' }], ['POST', { action: 'cancel' }]]) {
        const response = await forged.request.fetch('/api/shop', { method, ...(data ? { data } : {}), headers: { Origin: baseURL } });
        assert.equal(response.status(), 401, method);
        assert.deepEqual(await response.json(), { error: '로그인이 필요합니다.' });
      }
      const checkout = await forged.request.get('/account?next=checkout', { maxRedirects: 0 });
      assert.equal(checkout.status(), 302);
      assert.equal(new URL(checkout.headers().location).pathname + new URL(checkout.headers().location).search, '/signup?next=checkout');
      const malicious = await forged.request.get('/signup?next=https://untrusted.example');
      assert.equal(malicious.status(), 200);
      assert.match(await malicious.text(), /\/auth\/sign-in\?next=%2Fsignup/);
      assert(!(await malicious.text()).includes('untrusted.example'));
      await forged.close();
    });
    await check('Private upload quarantine is never served publicly; dynamic media routes fail closed without storage', async () => {
      for (const pathname of ['/media/_uploads/aaaaaaaaaaaaaaaaaaaaaaaa/00000000-0000-4000-8000-000000000000', '/media/_uploads%2Faaaaaaaaaaaaaaaaaaaaaaaa%2F00000000-0000-4000-8000-000000000000', '/media/readme.txt']) {
        const response = await raw.request.get(pathname, { maxRedirects: 0 });
        assert.equal(response.status(), 404, pathname);
        assert(!response.headers().location, 'Quarantined/invalid keys must not be presigned.');
      }
      const valid = await raw.request.get('/media/00000000-0000-4000-8000-000000000000.png', { maxRedirects: 0 });
      assert.equal(valid.status(), 503);
      assert((await valid.text()).includes('이미지 저장소 연결'));
      assert(!valid.headers().location);
    });
    await check('Actual no-provider stock and settings endpoints return an error rather than fictional operational data', async () => {
      for (const pathname of ['/api/shop?view=stock', '/api/shop?view=settings']) {
        const response = await raw.request.get(pathname);
        assert(!response.ok(), pathname);
        const payload = await response.json();
        assert.equal(typeof payload.error, 'string');
        assert(!payload.inventory && !payload.settings);
      }
    });
    await raw.close();

    for (const width of [1440, 390, 320]) {
      const c = await context(width, true), page = await c.newPage();
      await page.goto('/');
      await page.waitForFunction(() => document.querySelectorAll('#products .product').length === 4);
      await check(`Read-only public fixture ${width}px: original catalog, fixed/drawer menu, ${width > 800 ? 4 : 2} columns and no overflow`, async () => {
        await fits(page, width + ' storefront');
        assert.equal(await page.locator('#products').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), width > 800 ? 4 : 2);
        assert.equal(await page.locator('.logo').textContent(), catalog.brand);
        assert(await page.locator('#admin-entry').evaluate(el => el.hidden));
        assert.equal(await page.locator('[data-product=jacket] h3').innerText(), catalog.products[0].name);
        if (width > 800) {
          const sidebar = await page.locator('#site-sidebar').boundingBox(), main = await page.locator('main').boundingBox();
          assert.equal(await page.locator('#site-sidebar').evaluate(el => getComputedStyle(el).position), 'fixed');
          assert(main.x >= sidebar.x + sidebar.width - 1);
        } else {
          assert(await page.locator('#site-sidebar').evaluate(el => el.inert));
          await page.locator('.mobile-menu').click();
          assert.equal(await page.locator('.mobile-menu').getAttribute('aria-expanded'), 'true');
          assert(await page.locator('.account-link').isVisible(), 'Signup entry must be visible in the mobile menu.');
          assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflow), 'hidden');
          for (let i = 0; i < 24; i++) { await page.keyboard.press('Tab'); assert(await page.evaluate(() => !!document.activeElement.closest('#site-sidebar'))); }
          await page.keyboard.press('Escape');
          assert(await page.locator('#site-sidebar').evaluate(el => el.inert));
          assert(await page.evaluate(() => document.activeElement.matches('.mobile-menu')));
        }
        await assertNoOldIdentityText(page);
        await page.screenshot({ path: path.join(output, `home-${width}.png`), fullPage: true });
      });
      for (const [index, locale] of locales.entries()) {
        await check(`Read-only public fixture ${width}px ${locale}: translated navigation, email membership, original KRW and persisted language`, async () => {
          await language(page, locale, width);
          assert.equal((await page.locator('.account-link').textContent()).trim(), loginLabels[index]);
          await fits(page, `${width}px ${locale}`);
          assert((await page.locator('[data-product=jacket] .product-meta p').textContent()).includes('₩'));
          assert.equal((await page.locator('[data-product=jacket] .product-meta p').textContent()).replace(/[^0-9]/g, ''), '129000');
          await assertNoOldIdentityText(page);
          await page.reload();
          await page.waitForFunction(() => document.querySelectorAll('#products .product').length === 4);
          assert.equal(await page.locator('html').getAttribute('lang'), locale);
          assert.equal(await page.evaluate(() => localStorage.getItem('street-label-language')), locale);
          await page.goto('/signup?next=checkout');
          await page.waitForFunction(() => !!window.StoreI18n);
          assert.equal(await page.locator('html').getAttribute('lang'), locale);
          assert.equal(await page.locator('h1').innerText(), loginLabels[index]);
          const signup = await page.locator('.signup-start').getAttribute('href');
          assert.equal(new URL(signup, baseURL).pathname, '/auth/sign-in');
          assert.equal(new URL(signup, baseURL).searchParams.get('next'), '/signup?next=checkout');
          await assertNoOldIdentityText(page);
          assert.equal(await page.locator('[name=name]').count(), 0, 'No member registration form exists before verified email login.');
          await fits(page, `${width}px ${locale} signup`);
          await page.screenshot({ path: path.join(output, `signup-${width}-${locale}.png`), fullPage: true });
          await page.goto('/');
          await page.waitForFunction(() => document.querySelectorAll('#products .product').length === 4);
        });
      }
      await check(`Read-only public fixture ${width}px: product details and empty size guide use genuine demo data`, async () => {
        await page.locator('[data-product=jacket]').click();
        await page.locator('#size-guide').click();
        const guide = await page.locator('#size-guide-content').innerText();
        assert(guide.length > 20 && !/\d+\s?cm/.test(guide));
        assert.equal(await page.locator('#size option:enabled').count(), 1, 'Fixture inventory is empty; no fabricated stock can be selected.');
        await fits(page, `${width}px details`);
        await page.locator('#product-dialog .close').click();
        await page.evaluate(() => scrollTo({ top: 0, left: 0, behavior: 'instant' }));
        await page.screenshot({ path: path.join(output, `home-${width}-ja.png`), fullPage: true });
      });
      await c.close();
    }
    assert.deepEqual(errors, [], 'No uncaught browser errors.');
    assert.deepEqual(externalRequests, [], 'No external auth/storage services are called without configuration.');
    const report = { passed: results.length, results, browserErrors: errors, externalRequests, baseURL, scope: 'Actual no-provider Next.js security/routes; read-only public API fixtures for visual catalog. No real auth, DB, R2 or deployment tested.' };
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(`PASS: ${results.length} production Next.js browser/API smoke scenarios; no DB writes; ${errors.length} browser errors.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

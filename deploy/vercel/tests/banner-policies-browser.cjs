// Read-only QA against an isolated, unconfigured TEST-mode production Next.js server.
// No browser API fixtures, simulated authentication, external requests or data writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseURL = process.env.VERCEL_QA_URL || 'http://127.0.0.1:3920';
const target = new URL(baseURL);
assert.equal(target.protocol, 'http:', 'Use a local isolated Next.js production server.');
assert(['localhost', '127.0.0.1'].includes(target.hostname), 'Never run this test against operating data.');
const output = path.resolve(__dirname, '../../../.sites-runtime/banner-policies-qa');
fs.mkdirSync(output, { recursive: true });
const results = [], errors = [], externalRequests = [], metrics = [];
const forgedIdentity = { 'oai-authenticated-user-id': 'forged-owner', 'oai-authenticated-user-email': 'forged-owner@example.test' };
let browser;

async function check(label, action) {
  await action();
  results.push(label);
  console.log('PASS: ' + label);
}
async function localApi(request, pathname, options = {}) {
  const url = new URL(pathname, baseURL);
  assert.equal(url.origin, target.origin, 'API QA requests must stay on the isolated local server.');
  return request.fetch(url.href, { ...options, maxRedirects: 0 });
}
async function fits(page, label) {
  const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert(dimensions.content <= dimensions.viewport + 1, `${label}: horizontal overflow ${JSON.stringify(dimensions)}`);
}
async function home(page) {
  await page.goto('/');
  await page.waitForFunction(() => document.querySelectorAll('#products .product').length === 4);
  await page.waitForFunction(() => {
    const image = document.querySelector('#hero-photo');
    return image?.complete && image.naturalWidth > 1000;
  });
}
async function geometry(page) {
  return page.evaluate(() => {
    const rect = selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const shop = getComputedStyle(document.querySelector('#shop'));
    return {
      hero: rect('.hero'), image: rect('#hero-photo'), sidebar: rect('#site-sidebar'), main: rect('.store-main'),
      mobileBar: rect('.mobile-bar'), caption: rect('.campaign-caption'),
      sidebarBackground: getComputedStyle(document.querySelector('#site-sidebar')).backgroundColor,
      logoFont: getComputedStyle(document.querySelector('.logo')).fontSize,
      shopGutter: Number.parseFloat(shop.paddingLeft),
      columns: getComputedStyle(document.querySelector('#products')).gridTemplateColumns.split(/\s+/).length,
      imageSource: document.querySelector('#hero-photo').getAttribute('src'),
      imageNatural: [document.querySelector('#hero-photo').naturalWidth, document.querySelector('#hero-photo').naturalHeight],
    };
  });
}

(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  async function context(width = 1440, headers = {}) {
    const c = await browser.newContext({ baseURL, viewport: { width, height: 1000 }, extraHTTPHeaders: headers, reducedMotion: 'reduce' });
    c.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    await c.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== target.origin) { externalRequests.push(url.origin); return route.abort(); }
      return route.continue();
    });
    return c;
  }
  const contexts = [];
  try {
    const raw = await context(); contexts.push(raw);
    await check('Actual TEST catalogue API supplies four labelled public samples, no invented inventory or orders', async () => {
      const response = await localApi(raw.request, '/api/content');
      assert.equal(response.status(), 200);
      const body = await response.json();
      assert.equal(body.testOnly, true);
      assert.equal(body.source, 'test-unconfigured-database');
      assert.equal(body.content.products.length, 4);
      assert(body.content.products.every(product => product.visible === true));
      assert.equal(body.content.heroImages[0], '/assets/campaign-wide.png');
      assert(!body.profile && !body.orders && !body.members && !body.owner);
      assert.equal(response.headers()['cache-control'], 'no-store');
      const inventory = await localApi(raw.request, '/api/shop?view=stock');
      assert.equal(inventory.status(), 200);
      assert.deepEqual((await inventory.json()).inventory, []);
      const settingsResponse = await localApi(raw.request, '/api/shop?view=settings');
      assert.equal(settingsResponse.status(), 200);
      const settings = (await settingsResponse.json()).settings;
      assert.equal(settings.accepting, false);
      assert.equal(settings.bankInfo, '');
      assert(settings.terms.includes('테스트 전용') && settings.privacy.includes('테스트 전용'));
    });
    await check('Original campaign-wide image and CSS are served as usable local assets', async () => {
      for (const name of ['/assets/campaign-wide.png', '/style.css', '/app.js', '/commerce.css', '/account.js']) {
        const response = await localApi(raw.request, name);
        assert.equal(response.status(), 200, name);
        assert((await response.body()).length > 100, name + ' must not be empty');
      }
    });
    await check('Published test policies include explicit fictional business details, remain read-only and are excluded from indexing', async () => {
      const response = await localApi(raw.request, '/api/policies');
      assert.equal(response.status(), 200);
      const body = await response.json();
      assert.equal(body.testOnly, true);
      assert.equal(body.source, 'test-defaults');
      assert.equal(body.terms, '/policies/terms');
      assert.equal(body.privacy, '/policies/privacy');
      assert.equal(body.business.registrationNumber, '테스트용·미등록');
      assert.equal(body.business.email, 'support@example.invalid');
      for (const pathname of [body.terms, body.privacy]) {
        const policy = await localApi(raw.request, pathname);
        assert.equal(policy.status(), 200, pathname);
        assert.equal(policy.headers()['cache-control'], 'no-store');
        assert.equal(policy.headers()['x-content-type-options'], 'nosniff');
        assert.equal(policy.headers()['x-robots-tag'], 'noindex, nofollow');
        const text = await policy.text();
        assert(text.includes('테스트 전용') && text.includes('가상정보') && text.includes('Clerk'), pathname);
        assert(!text.includes('[YYYY년') && !text.includes('[상호명]'), 'Test copy must contain completed, clearly fictional placeholders.');
      }
    });
    await check('Missing Clerk configuration still returns setup-required 503 instead of fictitious login', async () => {
      for (const pathname of ['/auth/sign-in', '/auth/sign-up', '/auth/verify-email']) {
        const response = await localApi(raw.request, pathname);
        assert.equal(response.status(), 503, pathname);
        assert((await response.text()).includes('로그인 연결 준비 중'), pathname);
      }
    });
    await check('Forged Sites headers never authenticate a member or grant administrator access', async () => {
      const forged = await context(1440, forgedIdentity); contexts.push(forged);
      const session = await localApi(forged.request, '/api/session');
      assert.deepEqual(await session.json(), { isAdmin: false });
      for (const [pathname, method, data, status] of [
        ['/api/shop', 'GET', null, 401],
        ['/api/shop', 'POST', { action: 'register', name: '테스트 회원', phone: '00000000', consent: true }, 401],
        ['/api/shop', 'POST', { action: 'create', items: [] }, 401],
        ['/api/admin/content', 'GET', null, 403],
        ['/api/admin/commerce', 'GET', null, 403],
        ['/api/admin/content', 'PUT', { revision: 0, content: {} }, 403],
        ['/api/admin/upload', 'POST', { action: 'init', contentType: 'image/png', size: 1 }, 403],
      ]) {
        const response = await localApi(forged.request, pathname, { method, ...(data ? { data } : {}), headers: { Origin: baseURL } });
        assert.equal(response.status(), status, pathname + ' ' + method);
      }
      for (const pathname of ['/admin', '/admin/orders']) {
        const response = await localApi(forged.request, pathname, { maxRedirects: 0 });
        assert.equal(response.status(), 302, pathname);
        assert.equal(new URL(response.headers().location, baseURL).pathname, '/auth/sign-in');
      }
      await forged.close();
    });

    for (const width of [1920, 1440, 1024, 390, 320]) {
      const c = await context(width); contexts.push(c);
      const page = await c.newPage();
      await home(page);
      await check(`${width}px: first campaign spans the viewport behind the desktop rail without horizontal overflow`, async () => {
        await fits(page, `${width}px home`);
        const m = await geometry(page); metrics.push({ viewport: width, ...m });
        assert(Math.abs(m.hero.x) <= 1 && Math.abs(m.hero.width - width) <= 1, JSON.stringify(m));
        assert(Math.abs(m.image.width - width) <= 1, 'Campaign image spans all of its hero.');
        assert.equal(m.imageSource, '/assets/campaign-wide.png');
        assert(m.imageNatural[0] > m.imageNatural[1], 'The first campaign must be an original landscape image.');
        assert.equal(m.columns, width > 800 ? 4 : 2);
        if (width > 800) {
          const rail = width >= 1700 ? 260 : 240;
          assert.equal(m.sidebar.width, rail);
          assert.equal(m.main.x, rail, 'The other content retains its reserved menu rail.');
          assert.equal(m.hero.y, 0);
          assert.equal(m.logoFont, '43px');
          assert.equal(m.sidebarBackground, 'rgba(0, 0, 0, 0)');
          assert.equal(m.shopGutter, width >= 1700 ? 40 : width <= 1100 ? 20 : 28);
          assert(m.caption.x >= rail, 'Campaign caption must remain clear of menu links.');
        } else {
          assert.equal(m.mobileBar.height, 58);
          assert.equal(m.hero.y, 58);
          assert.equal(m.main.x, 0);
          assert.equal(m.shopGutter, 14);
          assert(await page.locator('#site-sidebar').evaluate(element => element.inert));
        }
        assert.equal(await page.locator('#admin-entry').isVisible(), false);
        assert.equal(await page.locator('#footer-policy-links').isVisible(), true);
        assert((await page.locator('#test-business').innerText()).includes('테스트용·미등록'));
        await page.screenshot({ path: path.join(output, `home-top-${width}.png`) });
        if ([1440, 390].includes(width)) await page.screenshot({ path: path.join(output, `home-full-${width}.png`), fullPage: true });
      });
      await check(`${width}px: menu remains readable and switches to white after the campaign scrolls out`, async () => {
        if (width > 800) {
          await page.evaluate(() => scrollTo({ top: document.querySelector('.hero').getBoundingClientRect().height + 20, behavior: 'instant' }));
          await page.waitForFunction(() => !document.querySelector('#site-sidebar').classList.contains('hero-overlay'));
          assert.equal(await page.locator('#site-sidebar').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(255, 255, 255)');
          await page.screenshot({ path: path.join(output, `shop-scroll-${width}.png`) });
          await fits(page, `${width}px scrolled`);
          await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
          await page.waitForFunction(() => document.querySelector('#site-sidebar').classList.contains('hero-overlay'));
        } else {
          await page.locator('.mobile-menu').click();
          assert.equal(await page.locator('.mobile-menu').getAttribute('aria-expanded'), 'true');
          assert(await page.locator('.account-link').isVisible());
          assert.equal(await page.locator('#site-sidebar').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(255, 255, 255)');
          assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflow), 'hidden');
          await fits(page, `${width}px menu`);
          await page.screenshot({ path: path.join(output, `menu-${width}.png`) });
          for (let count = 0; count < 24; count++) {
            await page.keyboard.press('Tab');
            assert(await page.evaluate(() => !!document.activeElement.closest('#site-sidebar')), 'Keyboard focus remains in the mobile menu.');
          }
          await page.keyboard.press('Escape');
          assert(await page.locator('#site-sidebar').evaluate(element => element.inert));
          assert(await page.evaluate(() => document.activeElement.matches('.mobile-menu')));
        }
      });
      await check(`${width}px: category, sorting and genuine out-of-stock detail remain usable`, async () => {
        await page.locator('[data-category=OUTER]').click();
        assert.equal(await page.locator('#products .product').count(), 2);
        await page.locator('[data-category=ALL]').click();
        await page.locator('#sort').selectOption('low');
        assert.equal(await page.locator('#products .product').first().getAttribute('data-product'), 'trousers');
        await page.locator('#sort').selectOption('default');
        await page.locator('[data-product=jacket]').click();
        await page.locator('#size-guide').click();
        assert.equal(await page.locator('#size option:enabled').count(), 1, 'No fabricated size inventory is selectable.');
        assert((await page.locator('#size-guide-content').innerText()).length > 20);
        await fits(page, `${width}px product detail`);
        await page.locator('#product-dialog .close').click();
      });
      await check(`${width}px: anonymous signup exposes both policy links while withholding member fields`, async () => {
        await page.goto('/signup?next=checkout');
        await page.locator('.signup-start').waitFor();
        await page.locator('#public-policy-links:not([hidden])').waitFor();
        assert.equal(await page.locator('#public-policy-links a[href="/policies/terms"]').count(), 1);
        assert.equal(await page.locator('#public-policy-links a[href="/policies/privacy"]').count(), 1);
        assert.equal(await page.locator('[name=name], [name=phone]').count(), 0);
        const login = new URL(await page.locator('.signup-start').getAttribute('href'), baseURL);
        assert.equal(login.pathname, '/auth/sign-in');
        assert.equal(login.searchParams.get('next'), '/signup?next=checkout');
        assert(!(await page.locator('body').innerText()).includes('ChatGPT'));
        await fits(page, `${width}px signup`);
        await page.screenshot({ path: path.join(output, `signup-${width}.png`), fullPage: true });
      });
      await check(`${width}px: complete terms and privacy pages fit the screen and return to signup`, async () => {
        for (const kind of ['terms', 'privacy']) {
          const response = await page.goto(`/policies/${kind}`);
          assert.equal(response.status(), 200);
          await fits(page, `${width}px ${kind}`);
          assert((await page.locator('article').innerText()).includes('테스트 전용'));
          const back = page.getByRole('link', { name: '회원가입 화면으로', exact: true });
          assert(await back.isVisible());
          assert.equal(await back.getAttribute('href'), '/signup');
          if ([1440, 390, 320].includes(width)) {
            await page.screenshot({ path: path.join(output, `${kind}-top-${width}.png`) });
            await page.screenshot({ path: path.join(output, `${kind}-${width}.png`), fullPage: true });
          }
        }
      });
      await c.close();
    }
    await check('Original second campaign remains selectable and the transparent menu preserves image-dependent contrast', async () => {
      const c = await context(); contexts.push(c);
      const page = await c.newPage();
      await home(page);
      await page.locator('[data-slide="1"]').click();
      await page.waitForFunction(() => {
        const image = document.querySelector('#hero-photo');
        return image.getAttribute('src') === '/assets/campaign.png' && image.complete && image.naturalWidth > 100;
      });
      assert.equal(await page.locator('[data-slide="1"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#site-sidebar').evaluate(element => getComputedStyle(element).mixBlendMode), 'difference');
      await fits(page, 'second campaign');
      await page.screenshot({ path: path.join(output, 'home-second-1440.png') });
      await page.evaluate(() => scrollTo({ top: document.querySelector('.hero').getBoundingClientRect().height + 20, behavior: 'instant' }));
      await page.waitForFunction(() => !document.querySelector('#site-sidebar').classList.contains('hero-overlay'));
      assert.equal(await page.locator('#site-sidebar').evaluate(element => getComputedStyle(element).mixBlendMode), 'normal');
      await c.close();
    });
    await check('All four existing language choices remain selectable and persist after refresh', async () => {
      const c = await context(); contexts.push(c);
      const page = await c.newPage();
      await home(page);
      for (const [locale, label] of [ ['ko', '로그인 / 회원가입'], ['zh-CN', '登录 / 注册'], ['zh-TW', '登入 / 註冊'], ['ja', 'ログイン / 会員登録'] ]) {
        await page.locator('#language-button').click();
        await page.locator(`[data-set-language="${locale}"]`).click();
        await page.waitForFunction(locale => document.documentElement.lang === locale, locale);
        assert.equal((await page.locator('.account-link').innerText()).trim(), label);
        await page.reload();
        await page.waitForFunction(() => document.querySelectorAll('#products .product').length === 4);
        assert.equal(await page.locator('html').getAttribute('lang'), locale);
        await fits(page, `language ${locale}`);
      }
      await c.close();
    });
    assert.deepEqual(errors, [], 'No uncaught browser errors.');
    assert.deepEqual(externalRequests, [], 'No external auth, DB or storage requests are made by the browser; API requests never follow redirects.');
    const report = { passed: results.length, results, metrics, browserErrors: errors, externalRequests, baseURL, scope: 'Actual public TEST API and local production Next.js browser/API checks. No request intercept fixtures, successful simulated identity, successful mutation, real provider connection or live deployment checks. API requests do not follow redirects; externalRequests records browser requests only.' };
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(`PASS: ${results.length} read-only TEST production browser/API scenarios.`);
  } catch (error) {
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ results, metrics, browserErrors: errors, externalRequests, baseURL, error: String(error) }, null, 2) + '\n');
    throw error;
  } finally {
    for (const c of contexts) await c.close().catch(() => {});
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

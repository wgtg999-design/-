// Real Chromium + a separate local D1/R2 worker. Never run against production.
// Sites identity headers below are synthetic; real ChatGPT login is not tested.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseURL = process.env.STOREFRONT_QA_URL || 'http://127.0.0.1:8791';
const url = new URL(baseURL);
assert(['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:', 'Use the isolated local QA worker.');
const output = path.resolve('.sites-runtime/browser-qa/storefront-ux');
fs.mkdirSync(output, { recursive: true });
const owner = { 'oai-authenticated-user-id': 'browser-qa-owner', 'oai-authenticated-user-email': 'browser-owner@example.test' };
const customer = { 'oai-authenticated-user-id': 'ux-customer-' + crypto.randomUUID(), 'oai-authenticated-user-email': 'ux-customer@example.test' };
const locales = ['ko', 'zh-CN', 'zh-TW', 'ja'];
const loginLabels = ['로그인 / 회원가입', '登录 / 注册', '登入 / 註冊', 'ログイン / 会員登録'];
const names = ['QA 재킷', 'QA 简体夹克', 'QA 繁體外套', 'QA 日本語ジャケット'];
const results = [], browserErrors = [];
let browser, admin, original;

async function check(label, action) { await action(); results.push(label); console.log('PASS: ' + label); }
async function fits(page, label) {
  const size = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert(size.document <= size.viewport + 1, `${label}: horizontal overflow ${JSON.stringify(size)}`);
}
async function api(context, pathname, data, method = 'POST') {
  const response = data === undefined ? await context.request.get(pathname) : await context.request.fetch(pathname, { method, data, headers: { Origin: baseURL } });
  const payload = await response.json();
  return { response, payload };
}
async function putContent(content) {
  const current = await api(admin, '/api/admin/content');
  assert.equal(current.response.status(), 200, 'Synthetic QA owner must own this isolated database.');
  const saved = await api(admin, '/api/admin/content', { content, revision: current.payload.revision }, 'PUT');
  assert.equal(saved.response.status(), 200, JSON.stringify(saved.payload));
}
async function loaded(page, count = 4) {
  await page.waitForFunction(count => document.querySelectorAll('#products .product').length === count, count);
}
async function setLanguage(page, locale) {
  await page.locator('#language-button').click();
  await page.locator(`[data-set-language="${locale}"]`).click();
  await page.waitForFunction(locale => document.documentElement.lang === locale, locale);
  assert.equal(await page.locator('#language-dialog').evaluate(dialog => dialog.open), false);
}
async function close(page, id) { await page.locator(`#${id} .close`).click(); }

(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'], headless: true });
  async function context(headers = {}, width = 1440) {
    const context = await browser.newContext({ baseURL, viewport: { width, height: 1000 }, extraHTTPHeaders: headers, reducedMotion: 'reduce' });
    context.on('page', page => page.on('pageerror', error => browserErrors.push(error.message)));
    return context;
  }
  try {
    admin = await context(owner);
    original = (await api(admin, '/api/admin/content')).payload.content;
    assert(original?.products?.some(p => p.id === 'jacket'), 'Use the Street Label isolated QA checkout.');
    const content = structuredClone(original);
    content.products = content.products.filter(p => p.id !== 'qa-hidden');
    for (const product of content.products) { delete product.featured; delete product.sizeGuide; delete product.translations; }
    const jacket = content.products.find(p => p.id === 'jacket');
    jacket.featured = true;
    jacket.sizeGuide = 'QA 등록 실측: M 어깨 50cm / 가슴 60cm / 총장 70cm. 운영에 사용하지 않는 테스트 안내.';
    jacket.translations = Object.fromEntries(locales.map((locale, index) => [locale, { name: names[index], description: `QA ${locale} operator description`, sizeGuide: `QA ${locale} M 50cm / 60cm / 70cm` }]));
    content.products.find(p => p.id === 'denim').featured = true;
    content.products.push({ ...structuredClone(jacket), id: 'qa-hidden', name: 'QA hidden product', visible: false, price: 1000 });
    content.socialLinks = { instagram: '', kakao: '' };
    content.translations = { ja: { aboutTitle: 'QA 運営者のブランド紹介', aboutText: 'QA 運営者が登録した紹介文' } };
    await putContent(content);
    const commerce = (await api(admin, '/api/admin/commerce')).payload;
    const settings = { accepting: true, shippingFee: 3000, bankInfo: 'QA 전용 가상 입금 안내 — 실제 계좌 없음', support: 'QA 전용 고객센터', terms: 'QA 운영자 이용약관 원문. 실제 운영에 사용하지 않습니다.', privacy: 'QA 운영자 개인정보 안내 원문. 실제 운영에 사용하지 않습니다.', returnGuide: 'QA 운영자 배송·반품 안내 원문.' };
    assert.equal((await api(admin, '/api/admin/commerce', { action: 'settings', revision: commerce.revision, settings })).response.status(), 200);
    const stock = commerce.inventory.find(item => item.sku === 'jacket:M');
    assert.equal((await api(admin, '/api/admin/commerce', { action: 'stock', id: 'jacket', size: 'M', stock: 20, maxOrder: 3, enabled: true, revision: stock?.revision || 0 })).response.status(), 200);
    const hiddenStock = commerce.inventory.find(item => item.sku === 'qa-hidden:M');
    assert.equal((await api(admin, '/api/admin/commerce', { action: 'stock', id: 'qa-hidden', size: 'M', stock: 2, maxOrder: 1, enabled: true, revision: hiddenStock?.revision || 0 })).response.status(), 200);

    for (const width of [1440, 1024, 390, 320]) {
      const c = await context({}, width), page = await c.newPage();
      await page.goto('/'); await loaded(page);
      await check(`${width}px sidebar layout, visible product grid and overflow`, async () => {
        await fits(page, `${width}px homepage`);
        assert.equal(await page.locator('#products').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), width > 800 ? 4 : 2);
        const slideLabels = await page.locator('[data-slide]').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')));
        assert.equal(new Set(slideLabels).size, slideLabels.length, 'Hero slide labels must distinguish the photos.');
        if (width > 800) {
          const sidebar = await page.locator('#site-sidebar').boundingBox(), main = await page.locator('main').boundingBox();
          assert.equal(await page.locator('#site-sidebar').evaluate(el => getComputedStyle(el).position), 'fixed');
          assert(sidebar.x >= -1 && sidebar.x < 1 && sidebar.width >= 200);
          assert(main.x >= sidebar.x + sidebar.width - 1, 'Main content must clear the fixed sidebar.');
          assert(await page.locator('#site-sidebar .account-link').isVisible());
        } else assert.equal(await page.locator('#site-sidebar').evaluate(el => el.inert), true);
        await page.screenshot({ path: path.join(output, `home-${width}.png`), fullPage: true });
      });
      if (width <= 800) await check(`${width}px mobile drawer traps focus, locks scrolling and closes safely`, async () => {
        const sidebar = page.locator('#site-sidebar');
        await page.locator('.mobile-menu').click();
        assert.equal(await sidebar.evaluate(el => el.inert), false);
        assert.equal(await page.locator('.mobile-menu').getAttribute('aria-expanded'), 'true');
        assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflow), 'hidden');
        for (let i = 0; i < 24; i++) {
          await page.keyboard.press('Tab');
          assert(await page.evaluate(() => !!document.activeElement.closest('#site-sidebar')), 'Drawer focus must stay inside the open sidebar.');
        }
        for (let i = 0; i < 6; i++) {
          await page.keyboard.press('Shift+Tab');
          assert(await page.evaluate(() => !!document.activeElement.closest('#site-sidebar')), 'Reverse drawer navigation must also keep focus inside.');
        }
        await page.keyboard.press('Escape');
        assert.equal(await sidebar.evaluate(el => el.inert), true);
        assert(await page.evaluate(() => document.activeElement.matches('.mobile-menu')));
        assert.notEqual(await page.evaluate(() => getComputedStyle(document.body).overflow), 'hidden');
        await page.keyboard.press('Tab');
        assert(await page.evaluate(() => !document.activeElement.closest('#site-sidebar')), 'Closed drawer links must not receive keyboard focus.');
        await page.locator('.mobile-menu').click();
        await page.locator('#menu-backdrop').click({ position: { x: width - 10, y: 20 } });
        assert.equal(await sidebar.evaluate(el => el.inert), true);
        assert(await page.evaluate(() => document.activeElement.matches('.mobile-menu')));
      });
      await c.close();
    }

    const c = await context(), page = await c.newPage(); await page.goto('/'); await loaded(page);
    await check('Best items are operator-selected visible products, with all other menus reaching real sections', async () => {
      await page.locator('[data-view=best]').click(); await loaded(page, 2);
      assert.deepEqual(await page.locator('.product').evaluateAll(items => items.map(p => p.dataset.product)), ['jacket', 'denim']);
      const shopText = await page.locator('#shop').textContent();
      assert(/추천|운영자/.test(shopText), 'Best items must describe an operator selection.');
      assert(!/판매량|판매 순위|판매순위/.test(shopText));
      await page.locator('[data-view=all]').click(); await loaded(page);
      for (const section of ['about', 'archive', 'community']) {
        await page.locator(`#store-nav a[href="#${section}"]`).click();
        assert.equal(new URL(page.url()).hash, '#' + section);
        assert((await page.locator('#' + section).textContent()).trim().length > 0);
      }
      const publicCatalog = (await api(c, '/api/content')).payload.content;
      assert.equal(publicCatalog.products.length, 4);
      assert(!publicCatalog.products.some(p => p.id === 'qa-hidden'));
      const publicStock = (await api(c, '/api/shop?view=stock')).payload.inventory;
      assert(!publicStock.some(item => item.sku.startsWith('qa-hidden:')), 'Hidden inventory must also stay out of public APIs.');
    });

    await check('Wishlist adds/removes browser-saved favorites and filters out hidden IDs', async () => {
      await page.locator('[data-view=all]').click(); await loaded(page);
      assert.equal(await page.locator('[data-wishlist=jacket] svg').evaluate(el => getComputedStyle(el).fill), 'none');
      await page.locator('[data-wishlist=jacket]').click();
      assert.equal(await page.locator('[data-wishlist=jacket]').getAttribute('aria-pressed'), 'true');
      assert.notEqual(await page.locator('[data-wishlist=jacket] svg').evaluate(el => getComputedStyle(el).fill), 'none');
      assert.equal(await page.locator('#wishlist-count').textContent(), '1');
      await page.reload(); await loaded(page);
      assert.equal(await page.locator('#wishlist-count').textContent(), '1');
      await page.evaluate(() => localStorage.setItem('your-label-wishlist', JSON.stringify(['jacket', 'qa-hidden'])));
      await page.reload(); await loaded(page);
      assert.equal(await page.locator('#wishlist-count').textContent(), '1');
      await page.locator('#wishlist-button').click(); await loaded(page, 1);
      assert.equal(await page.locator('.product').getAttribute('data-product'), 'jacket');
      await page.locator('[data-wishlist=jacket]').click();
      assert.equal(await page.locator('#wishlist-count').textContent(), '0');
      assert.equal(await page.locator('.product').count(), 0);
      await page.locator('[data-view=all]').click(); await loaded(page);
    });

    await check('Actual supplied measurements display, while other products use a preparation notice', async () => {
      await page.locator('[data-product=jacket]').click(); await page.locator('#size-guide').click();
      assert((await page.locator('#size-guide-content').textContent()).includes('QA ko M 50cm / 60cm / 70cm'));
      await close(page, 'product-dialog');
      await page.locator('[data-product=shell]').click(); await page.locator('#size-guide').click();
      const guide = await page.locator('#size-guide-content').textContent();
      assert(/실측표.*등록되지 않았습니다|준비/.test(guide)); assert(!/\d+\s?cm/.test(guide), 'Missing measurements must not be invented.');
      await close(page, 'product-dialog');
    });

    await check('Unconfigured social links explain preparation and community only gives factual guidance', async () => {
      for (const service of ['instagram', 'kakao']) {
        const startURL = page.url(); await page.locator(`[data-info=${service}]`).click();
        assert((await page.locator('#info-content').textContent()).includes('연결 준비 중'));
        assert.equal(page.url(), startURL); await close(page, 'info-dialog');
      }
      const community = await page.locator('#community-content').textContent();
      assert(/무통장|입금/.test(community)); assert(/카드/.test(community));
      assert(!/구매 후기|고객 리뷰|별점|누적 판매|누적 주문/.test(community));
    });

    for (let index = 0; index < locales.length; index++) {
      const locale = locales[index];
      await check(`${locale}: native interface labels, supplied product translations, KRW and persisted choice`, async () => {
        await setLanguage(page, locale);
        assert.equal(await page.locator('.account-link').textContent(), loginLabels[index]);
        const clipped = await page.locator('.sidebar-primary a,.sidebar-primary button,.sidebar-tools a,.sidebar-tools button').evaluateAll(elements => elements.filter(el => el.getClientRects().length && el.scrollWidth > el.clientWidth + 1).map(el => el.id || el.textContent));
        assert.deepEqual(clipped, [], 'Translated sidebar labels must fit their controls.');
        assert.equal(await page.locator('[data-product=jacket] h3').textContent(), names[index]);
        const price = await page.locator('[data-product=jacket] .product-meta p').textContent();
        assert(price.includes('₩') && price.replace(/[^0-9]/g, '') === '129000');
        assert(!/[¥￥]/.test(price));
        await fits(page, locale);
        await page.reload(); await loaded(page);
        assert.equal(await page.locator('html').getAttribute('lang'), locale);
        assert.equal(await page.evaluate(() => localStorage.getItem('street-label-language')), locale);
        await page.evaluate(() => scrollTo({ top: 0, left: 0, behavior: 'instant' }));
        await page.screenshot({ path: path.join(output, `language-${locale}.png`), fullPage: true });
      });
    }

    await check('Language updates open product/cart dialogs without dropping a selected size or cart quantity', async () => {
      await setLanguage(page, 'ko');
      await page.locator('[data-product=jacket]').click(); await page.locator('#size').selectOption('M');
      await page.evaluate(() => StoreI18n.setLanguage('zh-TW'));
      assert.equal(await page.locator('#product-dialog').evaluate(dialog => dialog.open), true);
      assert.equal(await page.locator('#size').inputValue(), 'M');
      await page.locator('#add').click();
      assert.equal(await page.locator('#bag-dialog').evaluate(dialog => dialog.open), true);
      const before = await page.evaluate(() => localStorage.getItem('your-label-cart'));
      await page.evaluate(() => StoreI18n.setLanguage('ja'));
      assert.equal(await page.locator('#bag-dialog').evaluate(dialog => dialog.open), true);
      assert.equal(await page.locator('#bag-count').textContent(), '1');
      assert.equal(await page.evaluate(() => localStorage.getItem('your-label-cart')), before);
      assert((await page.locator('#cart-items').textContent()).includes(names[3]));
      await close(page, 'bag-dialog');
      await page.locator('.account-link').click();
      await page.waitForURL('**/signup');
      assert.equal(await page.locator('html').getAttribute('lang'), 'ja');
      assert.equal(await page.locator('[data-language-select]').inputValue(), 'ja');
    });

    await check('Account languages keep entered data, original policies and in-flight signup/order/cancel requests safe', async () => {
      const member = await context(customer), formPage = await member.newPage();
      await formPage.goto('/signup?next=checkout'); await formPage.locator('#profile-form').waitFor();
      await formPage.locator('[name=name]').fill('QA 가입회원');
      await formPage.locator('[name=terms]').check(); await formPage.locator('[name=privacy]').check();
      await formPage.locator('#profile details').first().evaluate(el => { el.open = true; });
      for (const locale of ['zh-CN', 'zh-TW', 'ja']) {
        await formPage.locator('[data-language-select]').selectOption(locale);
        assert.equal(await formPage.locator('[name=name]').inputValue(), 'QA 가입회원');
        assert.equal(await formPage.locator('#profile-form [name=phone]').count(), 0);
        assert(await formPage.locator('[name=terms]').isChecked());
        assert.equal(await formPage.locator('#profile details').first().evaluate(el => el.open), true);
        assert((await formPage.locator('#profile .terms').first().textContent()).includes(settings.terms));
        assert(await formPage.locator('[data-original-notice]').first().isVisible());
      }
      let release, submissions = 0;
      const gate = new Promise(resolve => { release = resolve; });
      await formPage.route('**/api/shop', async route => {
        if (route.request().method() === 'POST' && route.request().postDataJSON().action === 'register') { submissions++; await gate; }
        await route.continue();
      });
      await formPage.locator('#profile-form button[type=submit]').click();
      await formPage.waitForFunction(() => document.querySelector('#profile-form')?.getAttribute('aria-busy') === 'true');
      await formPage.locator('[data-language-select]').selectOption('zh-TW');
      assert(await formPage.locator('#profile-form button[type=submit]').isDisabled());
      assert.equal(await formPage.locator('[name=name]').inputValue(), 'QA 가입회원');
      await formPage.locator('#profile-form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      assert.equal(submissions, 1); release();
      await formPage.locator('#profile .signup-start').waitFor(); await formPage.unroute('**/api/shop');
      assert.equal((await api(member, '/api/shop')).payload.profile.name, 'QA 가입회원');
      await formPage.evaluate(() => localStorage.setItem('your-label-cart', JSON.stringify([{ id: 'jacket', size: 'M', qty: 1 }])));
      await formPage.locator('#profile .signup-start').click(); await formPage.locator('#order-form').waitFor();
      assert.equal(await formPage.locator('#order-form [name=phone]').inputValue(), '');
      await formPage.locator('#order-form [name=phone]').fill('01012345678');
      await formPage.locator('#order-form [name=postcode]').fill('01234');
      await formPage.locator('#order-form [name=line1]').fill('QA 유지되는 테스트 배송지');
      await formPage.locator('#order-form [name=line2]').fill('QA 101호');
      await formPage.locator('#order-form [name=memo]').fill('QA 배송 메모');
      await formPage.locator('#order-form [name=consent]').check();
      await formPage.locator('[data-language-select]').selectOption('ja');
      assert.equal(await formPage.locator('#order-form [name=line1]').inputValue(), 'QA 유지되는 테스트 배송지');
      assert.equal(await formPage.locator('#order-form [name=memo]').inputValue(), 'QA 배송 메모');
      assert(await formPage.locator('#order-form [name=consent]').isChecked());
      let releaseOrder, orderSubmissions = 0;
      const orderGate = new Promise(resolve => { releaseOrder = resolve; });
      await formPage.route('**/api/shop', async route => {
        if (route.request().method() === 'POST' && route.request().postDataJSON().action === 'create') { orderSubmissions++; await orderGate; }
        await route.continue();
      });
      await formPage.locator('[data-order-submit]').click();
      await formPage.waitForFunction(() => document.querySelector('#order-form')?.getAttribute('aria-busy') === 'true');
      await formPage.locator('[data-language-select]').selectOption('zh-CN');
      assert(await formPage.locator('[data-order-submit]').isDisabled());
      assert.equal(await formPage.locator('#order-form [name=line1]').inputValue(), 'QA 유지되는 테스트 배송지');
      await formPage.locator('#order-form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      assert.equal(orderSubmissions, 1); releaseOrder();
      await formPage.locator('#orders .order').waitFor(); await formPage.unroute('**/api/shop');
      const ownOrders = (await api(member, '/api/shop')).payload.orders;
      assert.equal(ownOrders.length, 1); assert.equal(ownOrders[0].payment, 'awaiting_payment');
      await formPage.locator('[data-action=cancel]').click(); await formPage.locator('#reason').fill('QA 테스트 취소 요청');
      let releaseRequest, requestSubmissions = 0;
      const requestGate = new Promise(resolve => { releaseRequest = resolve; });
      await formPage.route('**/api/shop', async route => {
        if (route.request().method() === 'POST' && route.request().postDataJSON().action === 'cancel') { requestSubmissions++; await requestGate; }
        await route.continue();
      });
      await formPage.locator('#request-form .primary').click();
      await formPage.waitForFunction(() => document.querySelector('#request-form')?.getAttribute('aria-busy') === 'true');
      // The global language control is outside the native modal; exercise
      // the same shared language event while its request is pending.
      await formPage.evaluate(() => StoreI18n.setLanguage('ja'));
      assert(await formPage.locator('#request-form .primary').isDisabled());
      assert.equal(await formPage.locator('#reason').inputValue(), 'QA 테스트 취소 요청');
      await formPage.locator('#request-form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      assert.equal(requestSubmissions, 1); releaseRequest();
      await formPage.waitForFunction(() => !document.querySelector('#request-dialog').open);
      await formPage.unroute('**/api/shop');
      // An unpaid order cancels immediately; a paid order needs operator review.
      const cancelled = (await api(member, '/api/shop')).payload.orders[0];
      assert.equal(cancelled.status, 'cancelled');
      assert.equal(cancelled.payment, 'awaiting_payment', 'Unpaid cancellation must not claim a payment or refund.');
      assert.equal((await api(admin, '/api/admin/commerce')).payload.inventory.find(row => row.sku === 'jacket:M').stock, 20, 'Unpaid cancellation restores the reserved unit.');
      await member.close();
    });

    await check('Validated configured social destinations become safe real anchors', async () => {
      content.socialLinks = { instagram: 'https://www.instagram.com/', kakao: 'https://pf.kakao.com/' };
      await putContent(content);
      await page.goto('/'); await loaded(page);
      for (const service of ['instagram', 'kakao']) {
        const anchor = page.locator(`.sidebar-social a[href="${content.socialLinks[service]}"]`);
        assert.equal(await anchor.count(), 1);
        assert.equal(await anchor.getAttribute('target'), '_blank');
        assert((await anchor.getAttribute('rel') || '').includes('noopener'));
        assert(await anchor.evaluate(el => parseFloat(getComputedStyle(el).minHeight) >= 29));
      }
    });

    await check('Admin basic edits keep featured, measurements and locale metadata intact', async () => {
      const editor = await admin.newPage(); await editor.goto('/admin');
      await editor.locator('#editor').waitFor({ state: 'visible' });
      assert(await editor.locator('[data-product="0"][data-key=featured]:not([data-locale])').isChecked());
      assert((await editor.locator('[data-product="0"][data-key=sizeGuide]:not([data-locale])').inputValue()).includes('QA 등록 실측'));
      await editor.locator('[data-product-locale="0"]').selectOption('ja');
      assert.equal(await editor.locator('[data-product="0"][data-key=name][data-locale=ja]').inputValue(), names[3]);
      await editor.locator('[data-product="0"][data-key=name][data-locale=ja]').fill('QA 日本語ブラウザー更新');
      await editor.locator('[data-product="0"][data-key=name]:not([data-locale])').fill('QA 원본 상품명 수정');
      await editor.locator('[data-product="0"][data-key=featured]:not([data-locale])').uncheck();
      await editor.locator('[data-product="0"][data-key=featured]:not([data-locale])').check();
      await editor.locator('#brand-locale').selectOption('ja');
      await editor.locator('[data-brand-translation=aboutTitle][data-locale=ja]').fill('QA ブラウザー保存後の紹介');
      await editor.locator('[data-social=instagram]').fill('https://instagram.com/');
      await editor.locator('[data-field=brand]').fill('QA 브랜드');
      const notice = editor.locator('[data-field=notice]');
      await notice.fill('QA 관리자 기본필드 저장 확인'); await editor.locator('#save').click();
      await editor.waitForFunction(() => document.querySelector('#save-state')?.textContent.includes('저장 완료'));
      const saved = (await api(admin, '/api/admin/content')).payload.content;
      assert.equal(saved.products[0].translations.ja.name, 'QA 日本語ブラウザー更新');
      assert.equal(saved.products[0].name, 'QA 원본 상품명 수정');
      assert.equal(saved.translations.ja.aboutTitle, 'QA ブラウザー保存後の紹介');
      assert.equal(saved.socialLinks.instagram, 'https://instagram.com/');
      assert.equal(saved.products[0].featured, true);
      assert.equal(saved.products[0].sizeGuide, jacket.sizeGuide);
      await editor.close();
      await page.goto('/signup');
      await page.waitForFunction(() => document.querySelector('[data-store-brand]')?.textContent === 'QA 브랜드');
      assert((await page.title()).includes('QA 브랜드'));
      const brandedMember = await context(customer), accountPage = await brandedMember.newPage();
      await accountPage.goto('/account');
      await accountPage.locator('#profile-form').waitFor();
      assert.equal(await accountPage.locator('[data-store-brand]').textContent(), 'QA 브랜드');
      assert((await accountPage.title()).includes('QA 브랜드'));
      await brandedMember.close();
    });

    assert.deepEqual(browserErrors, [], 'Storefront/signup/admin browser errors.');
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ baseURL, identity: 'Synthetic Sites trusted headers; isolated local D1/R2 only.', passed: results, browserErrors }, null, 2));
    console.log(`PASS: ${results.length} real local-worker storefront UX scenarios.`);
    await c.close();
  } catch (error) {
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ baseURL, passed: results, error: String(error), browserErrors }, null, 2));
    const currentPage = browser?.contexts().flatMap(context => context.pages()).reverse().find(page => !page.isClosed());
    if (currentPage) await currentPage.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    if (original && admin) await putContent(original).catch(error => console.error('Local fixture cleanup:', error.message));
    if (browser) await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

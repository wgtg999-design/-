// Run only against an isolated local D1/R2 worker: node tests/signup-browser.cjs.
// ChatGPT identity is simulated with platform headers; this does not test real login.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseURL = process.env.SIGNUP_QA_URL || 'http://127.0.0.1:8791';
const endpoint = new URL(baseURL);
assert(['127.0.0.1', 'localhost'].includes(endpoint.hostname), 'Browser QA must use a local isolated worker.');
assert.equal(endpoint.protocol, 'http:', 'Browser QA must use the local HTTP worker.');
const output = path.resolve('.sites-runtime/browser-qa');
fs.mkdirSync(output, { recursive: true });
const run = crypto.randomUUID();
const alice = { 'oai-authenticated-user-id': `browser-alice-${run}`, 'oai-authenticated-user-email': 'browser-alice@example.test' };
const bob = { 'oai-authenticated-user-id': `browser-bob-${run}`, 'oai-authenticated-user-email': 'browser-bob@example.test' };
const owner = { 'oai-authenticated-user-id': 'browser-qa-owner', 'oai-authenticated-user-email': 'browser-owner@example.test' };
const results = [], browserErrors = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitText(page, selector, text) {
  await page.waitForFunction(({ selector, text }) => document.querySelector(selector)?.textContent.includes(text), { selector, text });
}
async function overflow(page, label) {
  const sizes = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert(sizes.content <= sizes.viewport + 1, `${label}: horizontal overflow ${sizes.content}/${sizes.viewport}`);
}
async function api(context, url, body) {
  const response = body ? await context.request.post(url, { data: body, headers: { Origin: baseURL } }) : await context.request.get(url);
  const data = await response.json();
  return { response, data };
}
async function consent(page) {
  await page.locator('[name=terms]').check();
  await page.locator('[name=privacy]').check();
}
async function profileForm(page, name) {
  await page.locator('[name=name]').fill(name);
  await consent(page);
}
async function check(label, work) {
  await work();
  results.push(label);
  console.log(`PASS: ${label}`);
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const contexts = [];
  async function context(headers = {}, width = 1440) {
    const c = await browser.newContext({ baseURL, viewport: { width, height: 1000 }, extraHTTPHeaders: headers, reducedMotion: 'reduce' });
    contexts.push(c);
    c.on('page', p => p.on('pageerror', error => browserErrors.push(error.message)));
    return c;
  }
  try {
    for (const width of [1440, 390, 320]) {
      const c = await context({}, width), page = await c.newPage();
      await check(`Home ${width}px: visible signup link, usable header and ${width > 800 ? 4 : 2}-column product grid`, async () => {
        await page.goto('/');
        await page.waitForFunction(() => document.querySelectorAll('.product').length === 4);
        assert.equal((await page.locator('#products').evaluate(el => getComputedStyle(el).gridTemplateColumns)).split(' ').length, width > 800 ? 4 : 2);
        await overflow(page, `home ${width}`);
        const link = page.locator('#site-sidebar .account-link');
        await page.screenshot({ path: path.join(output, `home-${width}.png`), fullPage: true });
        if (width <= 800) {
          await page.locator('.mobile-menu').click();
          assert.equal(await page.locator('.mobile-menu').getAttribute('aria-expanded'), 'true');
        }
        assert(await link.isVisible());
        const box = await link.boundingBox();
        assert(box && box.x >= 0 && box.x + box.width <= width + 1);
        await link.click();
        await page.waitForURL('**/signup');
        assert(await page.getByRole('link', { name: 'ChatGPT로 로그인 / 회원가입', exact: true }).isVisible());
        await overflow(page, `public signup ${width}`);
        await page.screenshot({ path: path.join(output, `signup-public-${width}.png`), fullPage: true });
      });
      await c.close();
    }

    const anon = await context(), anonymous = await anon.newPage();
    await check('Anonymous checkout keeps its intended return path through signup and ChatGPT login link', async () => {
      await anonymous.goto('/account?next=checkout#checkout');
      await anonymous.waitForURL(url => url.pathname === '/signup' && url.searchParams.get('next') === 'checkout');
      const href = await anonymous.locator('.signup-start').getAttribute('href');
      assert.equal(new URL(href, baseURL).searchParams.get('return_to'), '/signup?next=checkout');
      assert.equal(new URL(href, baseURL).pathname, '/signin-with-chatgpt');
      assert.equal((await api(anon, '/api/shop')).response.status(), 401);
    });

    const c = await context(alice), page = await c.newPage(), admin = await context(owner);
    await check('Missing published policies block signup with a retry action', async () => {
      const { data: current } = await api(admin, '/api/admin/commerce');
      assert.equal((await api(admin, '/api/admin/commerce', { action: 'settings', revision: current.revision, settings: { accepting: false, shippingFee: 0, bankInfo: '', support: '', terms: '', privacy: '', returnGuide: '' } })).response.status(), 200);
      await page.goto('/signup');
      await waitText(page, '#profile', '회원가입 안내를 준비 중');
      assert.equal(await page.locator('#profile-form').count(), 0);
      assert(await page.locator('#policy-retry').isVisible());
    });

    await check('Synthetic policies and inventory are configured only in the local QA database', async () => {
      const { data: current } = await api(admin, '/api/admin/commerce');
      const settings = { accepting: true, shippingFee: 3000, bankInfo: 'QA 전용 가상 입금 안내 — 실제 계좌 없음', support: 'QA 전용 고객센터', terms: 'QA 테스트 전용 이용약관. 운영에 사용하지 않습니다.', privacy: 'QA 테스트 전용 개인정보 안내. 운영에 사용하지 않습니다.', returnGuide: 'QA 테스트 전용 반품 안내.' };
      const set = await api(admin, '/api/admin/commerce', { action: 'settings', revision: current.revision, settings });
      assert.equal(set.response.status(), 200, JSON.stringify(set.data));
      const stock = current.inventory.find(x => x.sku === 'jacket:M');
      const inv = await api(admin, '/api/admin/commerce', { action: 'stock', id: 'jacket', size: 'M', stock: 20, maxOrder: 3, enabled: true, revision: stock?.revision || 0 });
      assert.equal(inv.response.status(), 200, JSON.stringify(inv.data));
      await page.locator('#policy-retry').click();
      await page.locator('#profile-form').waitFor();
    });

    for (const width of [390, 320]) {
      await check(`Signed-in signup ${width}px: readable fields, policies, button and no overflow`, async () => {
        await page.setViewportSize({ width, height: 1000 });
        await overflow(page, `signup form ${width}`);
        await page.locator('#profile details').evaluateAll(details => details.forEach(detail => { detail.open = true; }));
        assert(await page.getByText('QA 테스트 전용 이용약관. 운영에 사용하지 않습니다.', { exact: true }).isVisible());
        await page.screenshot({ path: path.join(output, `signup-form-${width}.png`), fullPage: true });
      });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });

    await check('Product detail → size selection → cart → checkout redirects a new member to the signup form', async () => {
      await page.goto('/');
      await page.locator('[data-product=jacket]').waitFor();
      await page.locator('[data-product=jacket]').click();
      await page.locator('#size').selectOption('M');
      await page.locator('#add').click();
      await page.locator('.checkout-link').click();
      await page.waitForURL(url => url.pathname === '/signup' && url.searchParams.get('next') === 'checkout');
      await page.locator('#profile-form').waitFor();
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('your-label-cart'))), [{ id: 'jacket', size: 'M', qty: 1 }]);
    });

    await check('Phone-free signup still refuses whitespace-only names', async () => {
      await profileForm(page, '        ');
      assert.equal(await page.locator('#profile-form [name=phone]').count(), 0);
      await page.locator('#profile-form button[type=submit]').click();
      assert.equal((await api(c, '/api/shop')).data.profile, null);
      assert.equal(await page.locator('#profile-form').count(), 1);
      assert.equal(await page.locator('[name=name]').evaluate(input => input.validationMessage), '이름을 2글자 이상 입력해 주세요.');
    });

    await check('Failed signup reports an error, preserves typed values and enables retry', async () => {
      await profileForm(page, '테스트회원');
      await page.route('**/api/shop', async route => {
        if (route.request().method() === 'POST' && route.request().postDataJSON().action === 'register') {
          await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'QA 일시적인 저장 실패입니다. 다시 시도하세요.' }) });
        } else await route.continue();
      }, { times: 1 });
      await page.locator('#profile-form button[type=submit]').click();
      await waitText(page, '#profile-feedback', 'QA 일시적인 저장 실패');
      assert.equal(await page.locator('[name=name]').inputValue(), '테스트회원');
      assert.equal(await page.locator('#profile-form [name=phone]').count(), 0);
      assert(await page.locator('[name=terms]').isChecked());
      assert(await page.locator('[name=privacy]').isChecked());
      assert(await page.locator('#profile-form button[type=submit]').isEnabled());
    });

    await check('In-flight signup disables submission and repeated form events send only one request', async () => {
      let submissions = 0, release;
      const gate = new Promise(resolve => { release = resolve; });
      await page.route('**/api/shop', async route => {
        if (route.request().method() === 'POST' && route.request().postDataJSON().action === 'register') { submissions++; await gate; }
        await route.continue();
      });
      await page.locator('#profile-form button[type=submit]').click();
      await page.waitForFunction(() => document.querySelector('#profile-form')?.getAttribute('aria-busy') === 'true');
      assert(await page.locator('#profile-form button[type=submit]').isDisabled());
      await page.locator('#profile-form').evaluate(form => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      await delay(200);
      assert.equal(submissions, 1);
      release();
      await waitText(page, '#profile-title', '회원가입이 완료되었습니다.');
      await page.unroute('**/api/shop');
      assert.equal((await api(c, '/api/shop')).data.profile.name, '테스트회원');
      assert.equal((await api(c, '/api/shop')).data.profile.phone, '');
      const next = await page.locator('#profile .signup-start').getAttribute('href');
      assert.equal(next, '/account?next=checkout#checkout');
      await page.screenshot({ path: path.join(output, 'signup-success.png'), fullPage: true });
    });

    let orderId;
    await check('Signup success continues checkout and an isolated order remains explicitly unpaid', async () => {
      await page.locator('#profile .signup-start').click();
      await page.waitForURL('**/account?next=checkout#checkout');
      await page.locator('#order-form').waitFor();
      assert.equal(await page.locator('#order-form [name=recipient]').inputValue(), '테스트회원');
      assert.equal(await page.locator('#order-form [name=phone]').inputValue(), '');
      await page.locator('#order-form [name=phone]').fill('010-1234-5678');
      await page.locator('#order-form [name=postcode]').fill('01234');
      await page.locator('#order-form [name=line1]').fill('QA 전용 테스트 주소 123');
      await page.locator('#order-form [name=line2]').fill('QA 101호');
      await page.locator('#order-form [name=consent]').check();
      await page.locator('#order-form .primary').click();
      await waitText(page, '#status', '주문이 접수되었습니다.');
      const { data } = await api(c, '/api/shop');
      assert.equal(data.orders.length, 1);
      assert.equal(data.orders[0].payment, 'awaiting_payment');
      assert.equal(data.orders[0].status, 'received');
      assert.equal(data.orders[0].total, 132000);
      orderId = data.orders[0].id;
      assert.equal(await page.evaluate(() => localStorage.getItem('your-label-cart')), null);
      assert(await page.getByText('입금 대기', { exact: true }).isVisible());
      await page.screenshot({ path: path.join(output, 'account-order.png'), fullPage: true });
    });

    await check('Own member information updates and survives a page refresh', async () => {
      await profileForm(page, '수정한회원');
      await page.locator('#profile-form button[type=submit]').click();
      await waitText(page, '#profile-feedback', '회원정보를 저장했습니다.');
      await page.reload();
      await page.locator('#profile-form').waitFor();
      assert.equal(await page.locator('[name=name]').inputValue(), '수정한회원');
      assert.equal(await page.locator('#profile-form [name=phone]').count(), 0);
      assert((await page.locator('.order-id').textContent()).includes(orderId));
    });

    await check('A fresh browser context with the same mock identity retrieves server-saved member and order data', async () => {
      const fresh = await context(alice), otherPage = await fresh.newPage();
      await otherPage.goto('/account');
      await otherPage.locator('#profile-form').waitFor();
      assert.equal(await otherPage.locator('[name=name]').inputValue(), '수정한회원');
      assert.deepEqual(await otherPage.evaluate(() => Object.keys(localStorage).filter(key => key !== 'street-label-language')), []);
      assert.equal((await api(fresh, '/api/shop')).data.orders[0].id, orderId);
      await otherPage.goto('/signup?next=checkout');
      await otherPage.waitForURL('**/account?next=checkout#checkout');
      await otherPage.locator('#profile-form').waitFor();
      await fresh.close();
    });

    await check('Another identity cannot view or change this member’s order or access admin APIs', async () => {
      const other = await context(bob), otherPage = await other.newPage();
      const initial = await api(other, '/api/shop');
      assert.equal(initial.data.profile, null);
      assert.deepEqual(initial.data.orders, []);
      assert.equal((await api(other, '/api/shop', { action: 'cancel', id: orderId, revision: 0, note: 'QA cross-user denial' })).response.status(), 404);
      assert.equal((await api(other, '/api/admin/content')).response.status(), 403);
      assert.equal((await api(other, '/api/admin/commerce')).response.status(), 403);
      await otherPage.goto('/account');
      await otherPage.waitForURL('**/signup');
      await otherPage.locator('#profile-form').waitFor();
      const revision = initial.data.revision;
      const forged = await api(other, '/api/shop', { action: 'register', user_id: alice['oai-authenticated-user-id'], name: '다른회원', phone: '01000000000', consent: true, revision });
      assert.equal(forged.response.status(), 200);
      assert.equal((await api(other, '/api/shop')).data.profile.name, '다른회원');
      assert.equal((await api(c, '/api/shop')).data.profile.name, '수정한회원');
      await other.close();
    });

    await check('Cross-origin changes are rejected without modifying member data', async () => {
      const { data } = await api(c, '/api/shop');
      const denied = await c.request.post('/api/shop', { headers: { Origin: 'https://untrusted.example.test' }, data: { action: 'register', name: '거절대상', phone: '01000000000', consent: true, revision: data.revision } });
      assert(denied.status() >= 400);
      assert.equal((await api(c, '/api/shop')).data.profile.name, '수정한회원');
    });

    await check('Signup without a cart leads naturally to the saved account page', async () => {
      const normal = await context({ 'oai-authenticated-user-id': `browser-normal-${run}`, 'oai-authenticated-user-email': 'browser-normal@example.test' }), normalPage = await normal.newPage();
      await normalPage.goto('/signup');
      await normalPage.locator('#profile-form').waitFor();
      await profileForm(normalPage, '일반가입회원');
      await normalPage.locator('#profile-form button[type=submit]').click();
      await waitText(normalPage, '#profile-title', '회원가입이 완료되었습니다.');
      assert.equal(await normalPage.locator('#profile .signup-start').getAttribute('href'), '/account#profile');
      await normalPage.locator('#profile .signup-start').click();
      await normalPage.waitForURL('**/account#profile');
      await normalPage.locator('#profile-form').waitFor();
      assert.equal(await normalPage.locator('[name=name]').inputValue(), '일반가입회원');
      await normal.close();
    });

    for (const width of [390, 320]) {
      await check(`Account ${width}px: saved member/order view fits the screen`, async () => {
        await page.setViewportSize({ width, height: 1000 });
        await overflow(page, `account ${width}`);
        await page.screenshot({ path: path.join(output, `account-${width}.png`), fullPage: true });
      });
    }
    assert.deepEqual(browserErrors, [], 'Browser JavaScript errors');
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ baseURL, identity: 'Simulated Sites trusted headers in isolated local worker; real ChatGPT login untested.', passed: results, browserErrors }, null, 2));
    console.log(`PASS: ${results.length} local Chromium scenarios. Real ChatGPT authentication and deployed Sites remain untested.`);
  } catch (error) {
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ baseURL, passed: results, error: String(error), browserErrors }, null, 2));
    throw error;
  } finally {
    for (const c of contexts) await c.close().catch(() => {});
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

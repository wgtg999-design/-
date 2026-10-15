// Synthetic verified/unverified managed account states. No external Clerk
// requests, no DB connection, and no customer or administrator data changes.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const base = path.resolve(__dirname, '..');
const savedKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const savedAlias = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE;
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_setup-auth-fixture';
delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE;

let configured = true, accountStatus = 'verified', mappedUser = null;
let accountCalls = 0, identityCalls = 0, scenarios = 0;
let componentLanguage = 'ko';
function AuthUI() { return null; }
function AuthUnavailable() { return null; }
function AccountConnectionPending() { return null; }
class Redirect extends Error { constructor(target) { super('Synthetic redirect'); this.target = target; } }

const cache = new Map();
function load(file, page = false) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const localRequire = id => {
    if (id === 'react' && file.endsWith('connection-pending.tsx')) return {
      useEffect() {}, useState: () => [componentLanguage, () => {}],
    };
    if (page) {
      if (id === '../../../../runtime/auth') return {
        authConfigured: () => configured,
        safeRelativeReturnPath,
        async getClerkAccountState() {
          accountCalls++;
          return accountStatus === 'verified'
            ? { status: 'verified', user: { providerUserId: 'fixture-managed-account', email: 'verified@example.test', fullName: 'Fixture' } }
            : { status: accountStatus, user: null };
        },
        async getChatGPTUser() { identityCalls++; return mappedUser; },
      };
      if (id === '../../ui') return { __esModule: true, default: AuthUI };
      if (id === '../../unavailable') return { __esModule: true, default: AuthUnavailable };
      if (id === '../../connection-pending') return { __esModule: true, default: AccountConnectionPending };
    }
    if (id === 'next/navigation') return { redirect(target) { throw new Redirect(target); } };
    // Load the production return-path sanitizer without calling an external
    // session SDK or database adapter. Those functions are tested separately.
    if (id === '@clerk/nextjs/server') return {};
    if (id === './database') return { getDatabase() { throw Error('No DB calls permitted in page sanitizer test.'); } };
    return id.startsWith('.') ? load(path.resolve(path.dirname(file), id + '.ts')) : require(id);
  };
  vm.runInThisContext('(function(require,module,exports){' + code + '})', { filename: file })(localRequire, module, module.exports);
  cache.set(file, module.exports);
  return module.exports;
}
const { safeRelativeReturnPath } = load(path.join(base, 'runtime/auth.ts'));

function reset({ status = 'verified', available = true, user = null } = {}) {
  accountStatus = status; configured = available; mappedUser = user;
  accountCalls = 0; identityCalls = 0;
}
async function render(page, next) {
  try { return { element: await page({ searchParams: Promise.resolve(next === undefined ? {} : { next }) }) }; }
  catch (error) { if (error instanceof Redirect) return { location: error.target }; throw error; }
}
async function expectRedirect(page, next, location, calls) {
  const result = await render(page, next);
  assert.equal(result.location, location);
  assert.equal(identityCalls, calls);
  scenarios++;
}
async function expectUnavailable(page, next, calls) {
  const result = await render(page, next);
  assert.equal(result.element?.type, AuthUnavailable);
  assert.equal(result.location, undefined);
  assert.equal(identityCalls, calls);
  scenarios++;
}
async function expectConnectionPending(page, next, safeNext, calls) {
  const result = await render(page, next);
  assert.equal(result.element?.type, AccountConnectionPending);
  assert.equal(result.element.props.next, safeNext);
  assert.equal(result.location, undefined, 'A temporary identity-store failure must not redirect the customer to setup.');
  assert.equal(identityCalls, calls);
  scenarios++;
}

(async () => {
  for (const mode of ['sign-in', 'sign-up', 'verify-email']) {
    const file = path.join(base, `templates/auth/${mode}/[[...${mode}]]/page.tsx`);
    const pageModule = load(file, true);
    assert.equal(pageModule.dynamic, 'force-dynamic');
    const page = pageModule.default;

    // A verified account may return to the public diagnostic before identity
    // tables exist. This exception neither loads nor grants a shop identity.
    reset(); await expectRedirect(page, '/setup', '/setup', 0);
    assert.equal(accountCalls, 1);

    // Verified accounts without a usable DB identity keep their managed
    // session and requested destination on a recoverable customer screen.
    // This grants neither private-page access nor an invented shop identity.
    for (const next of ['/admin', '/account', '/signup', '/account?next=checkout', '/setup?prepare=1', '/setup#prepare', '/setup/extra', '/%73etup', '/SETUP']) {
      reset(); await expectConnectionPending(page, next, next, 1);
    }
    const defaultPath = mode === 'sign-up' ? '/signup' : '/account';
    reset(); await expectConnectionPending(page, undefined, defaultPath, 1);
    reset({ user: { userId: 'mapped-fixture-user', email: 'verified@example.test' } });
    await expectRedirect(page, undefined, defaultPath, 1);
    for (const next of ['/admin', '/account?next=checkout']) {
      reset({ user: { userId: 'mapped-fixture-user', email: 'verified@example.test' } });
      await expectRedirect(page, next, next, 1);
    }

    // An external or malformed callback never expands the diagnostic bypass
    // and cannot send the user to an attacker-provided origin.
    for (const next of ['https://evil.example.test/setup', '//evil.example.test', '/\\evil.example.test', '/%255cevil.example.test', '/auth/sign-in']) {
      reset(); await expectConnectionPending(page, next, '/', 1);
      reset({ user: { userId: 'mapped-fixture-user', email: 'verified@example.test' } });
      await expectRedirect(page, next, '/', 1);
    }

    reset({ available: false }); await expectUnavailable(page, '/setup', 0);
    assert.equal(accountCalls, 0, 'Missing configuration never queries a provider account.');
    reset({ status: 'unavailable' }); await expectUnavailable(page, '/setup', 0);

    reset({ status: 'unverified' });
    if (mode === 'verify-email') {
      const { element } = await render(page, '/setup');
      assert.equal(element?.type, AuthUI); assert.equal(element.props.mode, 'verify-email');
      assert.equal(element.props.next, '/setup'); assert.equal(identityCalls, 0); scenarios++;
    } else await expectRedirect(page, '/setup', '/auth/verify-email?next=%2Fsetup', 0);

    reset({ status: 'signed-out' });
    if (mode === 'verify-email') await expectRedirect(page, '/setup', '/auth/sign-in?next=%2Fsetup', 0);
    else {
      const { element } = await render(page, '/setup');
      assert.equal(element?.type, AuthUI); assert.equal(element.props.mode, mode);
      assert.equal(element.props.next, '/setup');
      assert.equal(element.props.publishableKey, 'pk_test_setup-auth-fixture');
      assert.equal(identityCalls, 0); scenarios++;
    }

    // The UI uses the same resolved public key as middleware, without writing
    // a missing canonical variable or changing the signed-in account state.
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE = 'pk_test_setup-exact-alias';
    reset({ status: mode === 'verify-email' ? 'unverified' : 'signed-out' });
    let result = await render(page, '/setup');
    assert.equal(result.element?.type, AuthUI);
    assert.equal(result.element.props.publishableKey, 'pk_test_setup-exact-alias');
    assert.equal(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, undefined);
    assert.equal(identityCalls, 0); scenarios++;
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_setup-auth-fixture';
    result = await render(page, '/setup');
    assert.equal(result.element?.type, AuthUI);
    assert.equal(result.element.props.publishableKey, 'pk_test_setup-auth-fixture');
    assert.equal(identityCalls, 0); scenarios++;
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE;
  }
  const ConnectionUI = load(path.join(base, 'templates/auth/connection-pending.tsx')).default;
  function descendants(node) {
    if (!node || typeof node !== 'object') return [];
    const children = node.props?.children;
    return [node, ...(Array.isArray(children) ? children : [children]).flatMap(descendants)];
  }
  // Exercise the actual recovery component, without mounting Clerk or making
  // network requests. Retry preserves the sanitized destination; logout only
  // opens the existing confirmation page and never sends a GET mutation.
  for (const language of ['ko', 'zh-CN', 'zh-TW', 'ja']) {
    componentLanguage = language;
    for (const rawNext of ['/signup', '/account?next=checkout#checkout', '//evil.example.test', '/auth/sign-in']) {
      const next = safeRelativeReturnPath(rawNext);
      const tree = descendants(ConnectionUI({ next }));
      const links = tree.filter(node => node.type === 'a');
      assert.equal(links.length, 3);
      const retry = new URL(links[0].props.href, 'https://shop.test');
      const signout = new URL(links[2].props.href, 'https://shop.test');
      assert.equal(retry.pathname, '/auth/sign-in');
      assert.equal(retry.searchParams.get('next'), next);
      assert.equal(signout.pathname, '/auth/sign-out');
      assert.equal(signout.searchParams.get('next'), next);
      assert.equal(links[1].props.href, '/');
      assert.equal(tree.some(node => node.type === 'form'), false);
      assert.equal(tree.some(node => node.props?.dangerouslySetInnerHTML), false);
      assert.ok(tree.find(node => node.type === 'h1')?.props.children);
      assert.ok(tree.find(node => node.props?.role === 'status')?.props.children);
      assert.equal(links.some(node => node.props.href === '/setup'), false);
      scenarios++;
    }
  }
  console.log(`PASS: ${scenarios} setup authentication callback scenarios; only explicit verified /setup returns bypass DB identity lookup; unavailable identity storage keeps verified customers on a recoverable screen with sanitized next, private routes remain gated, resolved-key UI matches canonical precedence, and signed-out/unverified/unavailable states preserve their managed authentication flow.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  savedKey === undefined ? delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY : process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = savedKey;
  savedAlias === undefined ? delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE : process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE = savedAlias;
});

// Synthetic managed sessions + isolated SQLite only. No live Clerk/Sites/DB.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
const base = path.resolve(__dirname, '..');
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE auth_identity_links(provider_user_id TEXT PRIMARY KEY,legacy_user_id TEXT UNIQUE,verified_at TEXT NOT NULL);CREATE TABLE store_owner(key TEXT PRIMARY KEY,user_id TEXT NOT NULL);');
const environmentNames = ['NODE_ENV', 'NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY', 'VERCEL_ENV', 'VERCEL_URL'];
const savedEnvironment = Object.fromEntries(environmentNames.map(name => [name, process.env[name]]));
Object.assign(process.env, {
  NODE_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://shop.example.test',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_synthetic', CLERK_SECRET_KEY: 'sk_test_synthetic',
});
delete process.env.VERCEL_ENV; delete process.env.VERCEL_URL;
let session = { userId: null, sessionId: null };
let providerUser = null, providerFailure = false, databaseFailure = false;
let calls = { auth: 0, currentUser: 0, legacyHeaders: 0, middleware: 0, revoked: [] };
const verifiedUser = (id = 'provider-alice', email = 'alice@example.test') => ({
  id, firstName: 'Alice', lastName: 'Test', primaryEmailAddressId: 'primary',
  emailAddresses: [{ id: 'primary', emailAddress: email, verification: { status: 'verified' } }],
});
const database = {
  prepare(sql) {
    if (databaseFailure) throw Error('Synthetic unavailable DB');
    let params = [];
    return {
      bind(...values) { params = values; return this; },
      async first() { return db.prepare(sql).get(...params) ?? null; },
      async run() { return db.prepare(sql).run(...params); },
    };
  },
};
const sdk = {
  async auth() { calls.auth++; if (providerFailure) throw Error('Synthetic invalid session'); return session; },
  async currentUser() { calls.currentUser++; if (providerFailure) throw Error('Synthetic provider failure'); return providerUser; },
  async clerkClient() { return { sessions: { async revokeSession(id) { calls.revoked.push(id); } } }; },
  clerkMiddleware(options) { calls.middleware++; calls.middlewareOptions = options; return async () => new Response('verified provider middleware'); },
};
class NextResponse extends Response { static next() { return new NextResponse(null, { headers: { 'x-test-next': 'yes' } }); } }
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const localRequire = id => id === '@clerk/nextjs/server' ? sdk
    : id === 'next/headers' ? { headers() { calls.legacyHeaders++; throw Error('Client headers cannot be trusted'); } }
    : id === 'next/navigation' ? { redirect(target) { const error = Error('redirect'); error.target = target; throw error; } }
    : id === 'next/server' ? { NextResponse }
    : id === 'cloudflare:workers' ? { env: { DB: database, OWNER_BOOTSTRAP_EMAIL: 'owner@example.test' } }
    : id === './database' ? { getDatabase() { if (databaseFailure) throw Error('Synthetic missing DB'); return database; } }
    : id.endsWith('/runtime/auth') || id.includes('chatgpt-auth') ? load(path.join(base, 'runtime/auth.ts'))
    : id.startsWith('.') ? load(path.resolve(path.dirname(file), id + '.ts')) : require(id);
  vm.runInThisContext('(function(require,module,exports){' + code + '})', { filename: file })(localRequire, module, module.exports);
  cache.set(file, module.exports);
  return module.exports;
}
const auth = load(path.join(base, 'runtime/auth.ts'));
const admin = load(path.resolve(base, '../../lib/admin.ts'));
const signout = load(path.join(base, 'templates/auth/sign-out/confirm/route.ts'));
// Generated proxy.ts imports ./runtime; its original template relative path is
// deliberately remapped here exactly as the build script copies it.
const proxySource = fs.readFileSync(path.join(base, 'templates/proxy.ts'), 'utf8');
const proxyModule = { exports: {} };
const proxyCode = ts.transpileModule(proxySource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInThisContext('(function(require,module,exports){' + proxyCode + '})')(id => id === '@clerk/nextjs/server' ? sdk : id === 'next/server' ? { NextResponse } : load(path.join(base, 'runtime/auth-config.ts')), proxyModule, proxyModule.exports);

function signInAs(user) { providerUser = user; session = { userId: user?.id ?? null, sessionId: user ? 'session-test' : null }; }
function logoutRequest({ origin = 'https://shop.example.test', url = 'https://shop.example.test/auth/sign-out/confirm', body = 'next=%2Faccount', contentType = 'application/x-www-form-urlencoded' } = {}) {
  return new Request(url, { method: 'POST', headers: {
    ...(origin === null ? {} : { origin }), 'content-type': contentType,
    cookie: '__session=synthetic; __session_a1b2=synthetic; unrelated=keep',
  }, body });
}

(async () => {
  assert.equal(auth.authConfigured(), true);
  assert.equal(auth.isTrustedOrigin('https://shop.example.test'), true);
  for (const origin of [null, 'https://evil.example.test', 'http://shop.example.test', 'https://shop.example.test/']) assert.equal(auth.isTrustedOrigin(origin), false);
  for (const unsafe of [
    '', null, '//evil.example.test', 'https://evil.example.test', '/\\evil.example.test', '/%5cevil.example.test',
    '/%255cevil.example.test', '/%2f%2fevil.example.test', '/\naccount', '/%0aaccount', '/%250daccount',
    '/auth', '/auth/sign-in', '/AUTH/SIGN-UP', '/%61uth/sign-in', '/%2561uth/sign-in', '/a/../auth/sign-out',
    '/signin-with-chatgpt', '/signout-with-chatgpt?next=/account', '/callback', '/callback/nested', '/%' , '/' + 'a'.repeat(2049),
  ]) assert.equal(auth.safeRelativeReturnPath(unsafe), '/', String(unsafe));
  for (const safe of ['/account', '/signup?next=checkout', '/account?next=checkout#form', '/shop?search=%E8%A1%A3']) assert.equal(auth.safeRelativeReturnPath(safe), safe);
  assert.equal(auth.chatGPTSignInPath('/account?next=checkout'), '/auth/sign-in?next=%2Faccount%3Fnext%3Dcheckout');
  assert.equal(auth.chatGPTSignOutPath('//evil.test'), '/auth/sign-out?next=%2F');

  // Forged Sites identity headers are irrelevant. Only the injected managed
  // SDK session is used; this loader would fail if next/headers were read.
  signInAs(null);
  globalThis.syntheticClientHeaders = { 'oai-authenticated-user-id': 'legacy-owner', 'oai-authenticated-user-email': 'owner@example.test' };
  assert.equal(await auth.getChatGPTUser(), null);
  assert.equal(calls.legacyHeaders, 0);
  assert.equal(calls.currentUser, 0);
  for (const invalid of [
    { ...verifiedUser(), primaryEmailAddressId: 'missing' },
    { ...verifiedUser(), emailAddresses: [{ id: 'primary', emailAddress: 'a@example.test', verification: { status: 'unverified' } }] },
    { ...verifiedUser(), emailAddresses: [{ id: 'primary', emailAddress: '', verification: { status: 'verified' } }] },
    { ...verifiedUser(), emailAddresses: [{ id: 'primary', emailAddress: 'a@example.test', verification: { status: 'unverified' } }, { id: 'secondary', emailAddress: 'owner@example.test', verification: { status: 'verified' } }] },
  ]) { signInAs(invalid); assert.equal(await auth.getChatGPTUser(), null); }
  signInAs(verifiedUser()); providerUser = verifiedUser('different-user');
  assert.equal(await auth.getChatGPTUser(), null, 'Provider user must equal verified session ID');
  signInAs(verifiedUser());
  assert.deepEqual(await auth.getChatGPTUser(), { userId: 'clerk:provider-alice', displayName: 'Alice Test', email: 'alice@example.test', fullName: 'Alice Test' });
  db.prepare('INSERT INTO auth_identity_links VALUES (?,?,?)').run('provider-alice', 'legacy-alice', '2026-10-14T00:00:00Z');
  assert.equal((await auth.getChatGPTUser()).userId, 'legacy-alice');
  signInAs(verifiedUser('provider-alice', 'changed@example.test'));
  assert.equal((await auth.getChatGPTUser()).userId, 'legacy-alice', 'A pinned provider ID is independent of an email change');
  signInAs(verifiedUser('provider-bob', 'alice@example.test'));
  assert.equal((await auth.getChatGPTUser()).userId, 'clerk:provider-bob', 'Equal email never transfers another member ID');
  db.prepare('INSERT INTO auth_identity_links VALUES (?,?,?)').run('provider-invalid', 'legacy-invalid', 'not-verified-date');
  signInAs(verifiedUser('provider-invalid'));
  assert.equal(await auth.getChatGPTUser(), null);
  databaseFailure = true;
  assert.equal(await auth.getChatGPTUser(), null);
  databaseFailure = false; providerFailure = true;
  assert.equal(await auth.getChatGPTUser(), null);
  providerFailure = false;

  // Existing owner is preserved even if a different verified account has the
  // owner's email. Only an explicit provider-ID mapping restores that owner.
  db.prepare('INSERT INTO store_owner VALUES (?,?)').run('owner', 'legacy-owner');
  signInAs(verifiedUser('provider-other-owner', 'owner@example.test'));
  assert.equal(await admin.isOwner(), false);
  assert.equal(db.prepare('SELECT user_id FROM store_owner').get().user_id, 'legacy-owner');
  db.prepare('INSERT INTO auth_identity_links VALUES (?,?,?)').run('provider-owner', 'legacy-owner', '2026-10-14T00:00:00Z');
  signInAs(verifiedUser('provider-owner', 'owner@example.test'));
  assert.equal(await admin.isOwner(), true);
  signInAs(null);
  try { await auth.requireChatGPTUser('/account'); assert.fail('Expected redirect'); }
  catch (error) { assert.equal(error.target, '/auth/sign-in?next=%2Faccount'); }

  // GET is only a confirmation page. Mutation route implements POST only and
  // rejects other origins, missing origins, forged hosts, and oversized input.
  assert.equal(signout.GET, undefined);
  for (const origin of [null, 'https://evil.example.test']) assert.equal((await signout.POST(logoutRequest({ origin }))).status, 403);
  assert.equal((await signout.POST(logoutRequest({ origin: 'https://forged.example.test', url: 'https://forged.example.test/auth/sign-out/confirm' }))).status, 403);
  assert.equal((await signout.POST(logoutRequest({ contentType: 'application/json' }))).status, 415);
  assert.equal((await signout.POST(logoutRequest({ body: 'x'.repeat(4097) }))).status, 413);
  signInAs(verifiedUser());
  let response = await signout.POST(logoutRequest());
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/account');
  assert.deepEqual(calls.revoked, ['session-test']);
  assert.match(response.headers.get('set-cookie'), /__session=; Path=\/; Max-Age=0/);
  assert.match(response.headers.get('set-cookie'), /__session_a1b2=; Path=\/; Max-Age=0/);
  assert.doesNotMatch(response.headers.get('set-cookie'), /unrelated/);
  response = await signout.POST(logoutRequest({ body: 'next=https%3A%2F%2Fevil.test' }));
  assert.equal(response.headers.get('location'), '/');

  // Only configured environment origins are allowed as session-token parties.
  process.env.VERCEL_ENV = 'preview'; process.env.VERCEL_URL = 'test-build.vercel.app';
  assert.equal(auth.isTrustedOrigin('https://test-build.vercel.app'), true);
  await proxyModule.exports.default({ nextUrl: new URL('https://shop.example.test/account') }, {});
  assert.deepEqual(calls.middlewareOptions.authorizedParties, ['https://shop.example.test', 'https://test-build.vercel.app']);
  delete process.env.NEXT_PUBLIC_SITE_URL;
  assert.equal(auth.authConfigured(), false);
  assert.equal(await auth.getChatGPTUser(), null);
  response = await proxyModule.exports.default({ nextUrl: new URL('https://shop.example.test/auth/sign-in') }, {});
  assert.equal(response.status, 503);
  assert.match(await response.text(), /로그인 연결 준비 중/);
  response = await proxyModule.exports.default({ nextUrl: new URL('https://shop.example.test/') }, {});
  assert.equal(response.headers.get('x-test-next'), 'yes');
  process.env.NEXT_PUBLIC_SITE_URL = 'http://public.example.test';
  assert.equal(auth.authConfigured(), false);
  process.env.NEXT_PUBLIC_SITE_URL = 'http://127.0.0.1:3000'; process.env.NODE_ENV = 'development';
  assert.equal(auth.authConfigured(), true);
  process.env.NODE_ENV = 'production';
  assert.equal(auth.authConfigured(), false);
  delete process.env.CLERK_SECRET_KEY;
  assert.equal(await auth.getChatGPTUser(), null);

  console.log('PASS: Vercel auth fails closed; managed sessions and verified primary email; spoofed Sites headers ignored; immutable explicit member/owner identity mapping; safe internal redirects; canonical origin/preview parties; POST-only bounded signout and cookie removal.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  for (const [name, value] of Object.entries(savedEnvironment)) value === undefined ? delete process.env[name] : process.env[name] = value;
  delete globalThis.syntheticClientHeaders;
  db.close();
});

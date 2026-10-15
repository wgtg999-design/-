// Exercises the ACTUAL generated Vercel commerce/admin source after prepare.
// Verified session results are synthetic; all statements run on an isolated
// in-memory SQLite database. No credentials or production services are used.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

const base = path.resolve(__dirname, '..');
const repository = path.resolve(base, '../..');
const siteOrigin = 'https://commerce-fixture.example.test';
const initialMode = process.env.STORE_SITE_MODE;
const owner = { userId: 'clerk:fixture-owner', email: 'owner@example.test' };
const alice = { userId: 'clerk:fixture-alice', email: 'alice@example.test' };
const bob = { userId: 'clerk:fixture-bob', email: 'bob@example.test' };
let fixture, session = { status: 'signed-out', user: null }, writes = [], batches = 0, checks = 0;
const cache = new Map();

function execute(sql, values, kind) {
  if (!/^\s*SELECT\b/i.test(sql)) writes.push(sql);
  const statement = fixture.prepare(sql);
  if (kind === 'first') return statement.get(...values) || null;
  if (kind === 'all') return { results: statement.all(...values), success: true };
  const result = statement.run(...values);
  return { success: true, meta: { changes: Number(result.changes) } };
}
const database = {
  prepare(sql) {
    let values = [];
    return {
      bind(...next) { values = next; return this; },
      async first() { return execute(sql, values, 'first'); },
      async all() { return execute(sql, values, 'all'); },
      async run() { return execute(sql, values, 'run'); },
      execute() { return execute(sql, values, 'run'); },
    };
  },
  async batch(statements) {
    batches++;
    fixture.exec('BEGIN IMMEDIATE');
    try {
      const result = statements.map(statement => statement.execute());
      fixture.exec('COMMIT');
      return result;
    } catch (error) { fixture.exec('ROLLBACK'); throw error; }
  },
};
const environment = { DB: database, OWNER_BOOTSTRAP_EMAIL: owner.email };

function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const localRequire = id => {
    if (id.endsWith('/runtime/environment')) return { env: environment };
    if (id.endsWith('/chatgpt-auth')) return { getChatGPTUser: async () => session.status === 'verified' ? session.user : null };
    if (id.endsWith('/runtime/auth')) return { isTrustedOrigin: origin => origin === siteOrigin };
    if (id.endsWith('.json')) return require(path.resolve(path.dirname(file), id));
    if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id + '.ts'));
    if (id.includes('clerk') || id.includes('aws') || id.includes('libsql')) throw Error('External service dependency is forbidden in this integration fixture.');
    return require(id);
  };
  vm.runInThisContext('(function(require,module,exports){' + code + '})', { filename: file })(localRequire, module, module.exports);
  cache.set(file, module.exports);
  return module.exports;
}
function reset(mode = 'test', initialized = true) {
  fixture?.close();
  fixture = new DatabaseSync(':memory:');
  process.env.STORE_SITE_MODE = mode;
  cache.clear();
  if (initialized) {
    for (const name of fs.readdirSync(path.join(repository, 'drizzle')).filter(name => /^\d+_[\w-]+\.sql$/.test(name)).sort()) {
      fixture.exec(fs.readFileSync(path.join(repository, 'drizzle', name), 'utf8'));
    }
    fixture.exec(fs.readFileSync(path.join(base, 'migrations/0003_vercel.sql'), 'utf8'));
    fixture.prepare('INSERT INTO store_owner(key,user_id) VALUES (?,?)').run('owner', owner.userId);
  }
  writes = []; batches = 0;
  session = { status: 'signed-out', user: null };
  return load(path.join(base, 'lib/commerce.ts'));
}
function authenticate(user, status = 'verified') { session = { status, user }; }
function request(body, { origin = siteOrigin, urlOrigin = siteOrigin, headers = {} } = {}) {
  return new Request(urlOrigin + '/api/shop', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(origin === null ? {} : { origin }), ...headers },
    body: JSON.stringify(body),
  });
}
function readRequest() { return new Request(siteOrigin + '/api/shop'); }
function tableSnapshot() {
  const names = fixture.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => row.name);
  return names.map(name => [name, fixture.prepare('SELECT * FROM "' + name + '" ORDER BY rowid').all()]);
}
async function deniedWithoutChanges(callback, status) {
  const before = tableSnapshot();
  const beforeWrites = writes.length, beforeBatches = batches;
  const response = await callback();
  assert.equal(response.status, status, await response.clone().text());
  assert.deepEqual(tableSnapshot(), before, 'Rejected requests preserve all existing fixture rows.');
  assert.equal(writes.length, beforeWrites, 'Rejected request does not execute a write statement.');
  assert.equal(batches, beforeBatches, 'Rejected request does not enter a write transaction.');
  checks++;
  return response;
}
function savedSettings(value, revision = 7) {
  fixture.prepare('INSERT INTO shop_settings(key,data,revision) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,revision=excluded.revision').run('main', JSON.stringify(value), revision);
}
const signup = { action: 'register', name: '시험 회원', consent: true, revision: 0 };
const realSettings = { accepting: true, shippingFee: 0, bankInfo: 'Fixture bank text', support: 'Fixture support', terms: 'Fixture operator terms', privacy: 'Fixture operator privacy', returnGuide: 'Fixture return guide' };

(async () => {
  assert(fs.existsSync(path.join(base, 'lib/commerce.ts')), 'Run prepare:source before this integration test.');
  let commerce = reset();
  const { TEST_TERMS, TEST_PRIVACY } = load(path.join(base, 'runtime/test-policies.ts'));
  const beforeDefaultRead = tableSnapshot();
  const initial = await commerce.settings();
  assert.equal(initial.revision, 0); assert.equal(initial.testOnly, true);
  assert.equal(initial.settings.terms, TEST_TERMS); assert.equal(initial.settings.privacy, TEST_PRIVACY);
  assert.equal(initial.settings.accepting, false); assert.equal(initial.settings.bankInfo, '');
  assert.deepEqual(tableSnapshot(), beforeDefaultRead); assert.equal(writes.length, 0); checks++;

  // Headers cannot manufacture a verified login in the generated commerce
  // integration. The auth module's verified SDK result remains the only input.
  await deniedWithoutChanges(() => commerce.shopPost(request(signup, { headers: { 'oai-is-authenticated': 'true', 'oai-user-id': alice.userId, 'oai-user-email': alice.email } })), 401);
  authenticate(alice, 'unverified');
  await deniedWithoutChanges(() => commerce.shopPost(request(signup)), 401);
  authenticate(alice);
  for (const options of [
    { origin: 'https://foreign.example.test' },
    { origin: null },
    { origin: 'https://foreign.example.test', urlOrigin: 'https://foreign.example.test' },
    { origin: siteOrigin, urlOrigin: 'https://foreign.example.test' },
  ]) {
    await deniedWithoutChanges(() => commerce.shopPost(request(signup, options)), 400);
  }
  for (const payload of [{ ...signup, consent: false }, { ...signup, consent: undefined }, { ...signup, revision: 1 }, { ...signup, name: 'x' }, { ...signup, phone: 'letters' }]) {
    await deniedWithoutChanges(() => commerce.shopPost(request(payload)), 400);
  }

  const register = await commerce.shopPost(request({ ...signup, userId: bob.userId, email: bob.email }));
  assert.equal(register.status, 200, await register.clone().text());
  const aliceRow = fixture.prepare('SELECT * FROM shop_customers WHERE user_id=?').get(alice.userId);
  assert.equal(aliceRow.email, alice.email); assert.equal(aliceRow.name, signup.name); assert.equal(aliceRow.phone, '');
  assert.equal(aliceRow.consent_version, 0); assert(aliceRow.created_at);
  assert.equal(fixture.prepare('SELECT count(*) AS n FROM shop_customers').get().n, 1);
  assert.equal(fixture.prepare('SELECT * FROM shop_customers WHERE user_id=?').get(bob.userId), undefined); checks++;
  // Reload the actual generated module to represent reconnecting; the profile
  // survives in the fixture DB rather than a browser-local member cache.
  cache.clear(); commerce = load(path.join(base, 'lib/commerce.ts'));
  let response = await commerce.shopGet(readRequest());
  let account = await response.json(); assert.equal(response.status, 200); assert.equal(account.profile.name, signup.name); checks++;
  authenticate(bob);
  response = await commerce.shopGet(readRequest()); account = await response.json();
  assert.equal(account.profile, null); assert.deepEqual(account.orders, []); checks++;
  authenticate(alice);
  response = await commerce.shopPost(request({ ...signup, name: '시험 변경', userId: bob.userId }));
  assert.equal(response.status, 200);
  assert.equal(fixture.prepare('SELECT name FROM shop_customers WHERE user_id=?').get(alice.userId).name, '시험 변경');
  assert.equal(fixture.prepare('SELECT * FROM shop_customers WHERE user_id=?').get(bob.userId), undefined); checks++;

  savedSettings(realSettings);
  const beforeRead = tableSnapshot();
  const constrained = await commerce.settings();
  assert.equal(constrained.settings.accepting, false); assert.equal(constrained.settings.terms, realSettings.terms);
  assert.equal(JSON.parse(fixture.prepare('SELECT data FROM shop_settings').get().data).accepting, true);
  assert.deepEqual(tableSnapshot(), beforeRead); checks++;
  authenticate(owner);
  const blockedOpen = await deniedWithoutChanges(() => commerce.adminPost(request({ action: 'settings', revision: 7, settings: realSettings })), 400);
  assert.match((await blockedOpen.json()).error, /테스트 사이트에서는 주문 접수를 열 수 없습니다/);
  authenticate(bob);
  await deniedWithoutChanges(() => commerce.adminPost(request({ action: 'settings', revision: 7, settings: { ...realSettings, accepting: false } })), 403);
  authenticate(owner);
  await deniedWithoutChanges(() => commerce.adminPost(request({ action: 'settings', revision: 7, settings: { ...realSettings, accepting: false } }, { origin: 'https://foreign.example.test' })), 403);
  authenticate(alice);
  await deniedWithoutChanges(() => commerce.shopPost(request({ ...signup, revision: 0 })), 400);
  const orderDraft = { action: 'create', requestKey: crypto.randomUUID(), expectedTotal: 1, settingsRevision: 7, consent: true, items: [{ id: 'fixture', size: 'M', qty: 1 }], address: { name: '시험 수령인', phone: '00000000', postcode: '00000', line1: '가상 배송지 테스트', line2: '시험용', memo: '' } };
  const closedOrder = await deniedWithoutChanges(() => commerce.shopPost(request(orderDraft)), 400);
  assert.match((await closedOrder.json()).error, /주문 접수가 중지/);
  assert.equal(fixture.prepare('SELECT count(*) AS n FROM shop_orders').get().n, 0);

  // Reading explicitly saved test policies preserves raw rows too.
  savedSettings({ ...realSettings, terms: TEST_TERMS, privacy: TEST_PRIVACY });
  const testSavedBefore = tableSnapshot();
  const testSaved = await commerce.settings();
  assert.equal(testSaved.settings.terms, TEST_TERMS); assert.equal(testSaved.settings.accepting, false);
  assert.deepEqual(tableSnapshot(), testSavedBefore); checks++;

  // A pre-existing blank policy row is authoritative even in test mode.
  savedSettings({ ...realSettings, accepting: false, terms: '', privacy: '' });
  authenticate(alice);
  await deniedWithoutChanges(() => commerce.shopPost(request({ ...signup, revision: 7 })), 400);

  for (const mode of ['live', 'unknown', '']) {
    commerce = reset(mode);
    savedSettings({ ...realSettings, terms: TEST_TERMS, privacy: TEST_PRIVACY });
    authenticate(alice);
    const before = tableSnapshot();
    const live = await commerce.settings();
    assert.equal(live.testOnly, false); assert.equal(live.settings.terms, ''); assert.equal(live.settings.privacy, ''); assert.equal(live.settings.accepting, false);
    assert.deepEqual(tableSnapshot(), before); checks++;
    await deniedWithoutChanges(() => commerce.shopPost(request({ ...signup, revision: 7 })), 400);
  }

  // The live-mode block is narrow: confirmed non-fixture policy strings
  // continue to register a verified member with current consent/version.
  commerce = reset('live'); savedSettings({ ...realSettings, accepting: false }); authenticate(alice);
  response = await commerce.shopPost(request({ ...signup, revision: 7 }));
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(fixture.prepare('SELECT consent_version FROM shop_customers WHERE user_id=?').get(alice.userId).consent_version, 7); checks++;

  commerce = reset('test', false); authenticate(alice);
  await deniedWithoutChanges(() => commerce.shopPost(request(signup)), 400);
  assert.equal(fixture.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get().n, 0, 'No automatic schema or member seed when a DB is uninitialized.');

  console.log(`PASS: ${checks} generated Vercel commerce integration cases; real isolated SQL registration/persistence, authentication handoff, consent/version/origin checks, owner-only changes, test order closure, saved-row preservation, live/unknown fixture-policy rejection, and no production/provider calls.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  fixture?.close();
  if (initialMode === undefined) delete process.env.STORE_SITE_MODE;
  else process.env.STORE_SITE_MODE = initialMode;
});

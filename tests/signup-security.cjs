// Isolated synthetic identities and legal text; never connects to production D1.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(':memory:');
for (const file of fs.readdirSync('drizzle').filter(file => file.endsWith('.sql')).sort()) {
  db.exec(fs.readFileSync(path.join('drizzle', file), 'utf8'));
}
let identity = null;
const owner = { userId: 'test-owner', email: 'owner@example.test' };
const alice = { userId: 'test-alice', email: 'alice@example.test' };
const bob = { userId: 'test-bob', email: 'bob@example.test' };
const env = {
  OWNER_BOOTSTRAP_EMAIL: owner.email,
  DB: {
    async batch(statements) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(statement => statement.exec());
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    prepare(sql) {
      let params = [];
      return {
        bind(...values) { params = values; return this; },
        exec() { return { meta: { changes: Number(db.prepare(sql).run(...params).changes) } }; },
        async first() { return db.prepare(sql).get(...params) || null; },
        async all() { return { results: db.prepare(sql).all(...params) }; },
        async run() { return db.prepare(sql).run(...params); },
      };
    },
  },
};
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const module = { exports: {} };
  cache.set(file, module.exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const localRequire = id => id === 'cloudflare:workers' ? { env }
    : id.includes('chatgpt-auth') ? { getChatGPTUser: async () => identity }
    : id.startsWith('.') ? load(path.resolve(path.dirname(file), id + '.ts'))
    : require(id);
  vm.runInThisContext('(function(require,module,exports){' + code + '})', { filename: file })(localRequire, module, module.exports);
  cache.set(file, module.exports);
  return module.exports;
}
const commerce = load('lib/commerce.ts');
const get = (suffix = '') => new Request('https://shop.test/api/shop' + suffix);
const post = (body, origin = 'https://shop.test') => new Request('https://shop.test/api/shop', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(origin === null ? {} : { origin }) },
  body: JSON.stringify(body),
});
const count = () => db.prepare('SELECT count(*) AS n FROM shop_customers').get().n;
const profile = userId => db.prepare('SELECT * FROM shop_customers WHERE user_id=?').get(userId);
const registration = revision => ({ action: 'register', name: 'Alice Test', phone: '01000000001', consent: true, revision });
const testSettings = {
  accepting: false, shippingFee: 0, bankInfo: '', support: '',
  terms: 'Synthetic test terms only.', privacy: 'Synthetic test privacy only.', returnGuide: '',
};
async function saveSettings(overrides = {}) {
  identity = owner;
  const current = await (await commerce.shopGet(get('?view=settings'))).json();
  const response = await commerce.adminPost(post({ action: 'settings', revision: current.revision, settings: { ...testSettings, ...overrides } }));
  assert.equal(response.status, 200, await response.text());
  return current.revision + 1;
}
async function rejectRegistration(payload, origin = 'https://shop.test', message, expectedStatus = 400) {
  const before = count();
  const response = await commerce.shopPost(post(payload, origin));
  assert.equal(response.status, expectedStatus);
  if (message) assert.match((await response.json()).error, message);
  assert.equal(count(), before, 'Rejected registration must not create a member');
}

(async () => {
  // No legal settings, incomplete settings, and whitespace are all closed.
  identity = alice;
  await rejectRegistration(registration(0), undefined, /준비 중/);
  for (const incomplete of [
    { terms: '' }, { privacy: '' }, { terms: ' \n\t ' }, { privacy: ' \n\t ' },
  ]) {
    const revision = await saveSettings(incomplete);
    identity = alice;
    await rejectRegistration(registration(revision), undefined, /준비 중/);
  }
  const revision = await saveSettings();
  identity = null;
  assert.equal((await commerce.shopGet(get())).status, 401);
  await rejectRegistration(registration(revision), undefined, /로그인/, 401);
  identity = alice;
  await rejectRegistration(registration(revision), 'https://other.test', /출처/);
  await rejectRegistration(registration(revision), null, /출처/);
  await rejectRegistration({ ...registration(revision), consent: false });
  const withoutConsent = registration(revision);
  delete withoutConsent.consent;
  await rejectRegistration(withoutConsent);
  await rejectRegistration(registration(revision - 1), undefined, /약관이 변경/);
  await rejectRegistration({ ...registration(revision), name: 'A' });
  await rejectRegistration({ ...registration(revision), phone: 'not-a-phone' });
  for (const phone of ['        ', '--------', '010-----', '1234567']) {
    await rejectRegistration({ ...registration(revision), phone });
  }
  assert.equal(count(), 0);

  // The trusted session chooses both the member ID and email, ignoring input.
  let response = await commerce.shopPost(post({ ...registration(revision), phone: ' 01000000001 ', userId: bob.userId, user_id: bob.userId, email: bob.email }));
  assert.equal(response.status, 200);
  assert.equal(profile(alice.userId).email, alice.email);
  assert.equal(profile(bob.userId), undefined);
  assert.ok(!Number.isNaN(Date.parse(profile(alice.userId).created_at)), 'New member has a server-created join time');
  // A fixed old fixture date makes a forbidden timestamp rewrite detectable,
  // even when the registration requests happen within the same millisecond.
  const createdAt = '2000-01-02T03:04:05.000Z';
  db.prepare('UPDATE shop_customers SET created_at=? WHERE user_id=?').run(createdAt, alice.userId);
  const reloaded = await (await commerce.shopGet(get())).json();
  assert.equal(reloaded.profile.name, 'Alice Test');
  assert.equal(reloaded.profile.phone, '01000000001');
  assert.equal(reloaded.profile.email, alice.email);
  assert.equal(reloaded.profile.created_at, createdAt);
  assert.equal(reloaded.profile.user_id, undefined, 'Public profile omits internal identity');

  // Replay and profile editing remain an upsert for this identity, retaining join time.
  const retries = await Promise.all([
    commerce.shopPost(post(registration(revision))),
    commerce.shopPost(post(registration(revision))),
  ]);
  assert.deepEqual(retries.map(result => result.status), [200, 200]);
  assert.equal(count(), 1);
  assert.equal(profile(alice.userId).created_at, createdAt);
  response = await commerce.shopPost(post({ ...registration(revision), name: 'Alice Updated', phone: '01000000002' }));
  assert.equal(response.status, 200);
  const aliceUpdated = { ...profile(alice.userId) };
  assert.equal(aliceUpdated.created_at, createdAt);
  assert.equal(aliceUpdated.consent_version, revision);
  assert.equal((await (await commerce.shopGet(get())).json()).profile.phone, '01000000002');

  // A second authenticated customer cannot read or overwrite the first member.
  identity = bob;
  assert.equal((await (await commerce.shopGet(get())).json()).profile, null);
  response = await commerce.shopPost(post({ ...registration(revision), name: 'Bob Test', phone: '01000000003', userId: alice.userId, email: alice.email }));
  assert.equal(response.status, 200);
  assert.equal(count(), 2);
  assert.equal(profile(bob.userId).email, bob.email);
  assert.deepEqual({ ...profile(alice.userId) }, aliceUpdated);
  const bobUpdated = await (await commerce.shopGet(get('?userId=' + alice.userId))).json();
  assert.equal(bobUpdated.profile.name, 'Bob Test', 'URL identity cannot select another member');

  // Build an actual order through the service, then test ownership at read/mutation boundaries.
  const orderRevision = await saveSettings({
    accepting: true, bankInfo: 'Synthetic bank test instructions.', support: 'Synthetic support.', returnGuide: 'Synthetic returns.',
  });
  response = await commerce.adminPost(post({ action: 'stock', id: 'jacket', size: 'M', stock: 2, maxOrder: 1, enabled: true, revision: 0 }));
  assert.equal(response.status, 200);
  identity = alice;
  const orderDraft = {
    action: 'create', requestKey: crypto.randomUUID(), expectedTotal: 129000, settingsRevision: orderRevision, consent: true,
    items: [{ id: 'jacket', size: 'M', qty: 1 }],
    address: { name: 'Alice Test', phone: ' 010-0000-0002 ', postcode: '01234', line1: 'Synthetic Test Street', line2: 'Test Room', memo: '' },
  };
  for (const phone of ['        ', '--------', '010-----', '1234567']) {
    response = await commerce.shopPost(post({ ...orderDraft, address: { ...orderDraft.address, phone } }));
    assert.equal(response.status, 400, 'Delivery contact needs at least eight actual digits');
    assert.equal(db.prepare('SELECT count(*) AS n FROM shop_orders').get().n, 0);
    assert.equal(db.prepare('SELECT stock FROM shop_inventory').get().stock, 2);
  }
  response = await commerce.shopPost(post(orderDraft));
  assert.equal(response.status, 201, 'Fixture order must be created through server checks');
  const orderId = (await response.json()).order.id;
  const aliceOrders = await (await commerce.shopGet(get())).json();
  assert.equal(aliceOrders.orders.length, 1);
  assert.equal(aliceOrders.orders[0].address.phone, '010-0000-0002', 'Stored delivery phone trims surrounding whitespace');
  for (const internal of ['user_id', 'request_key', 'last_actor', 'action_token', 'catalog_revision', 'settings_revision']) {
    assert.equal(aliceOrders.orders[0][internal], undefined);
  }
  identity = bob;
  assert.deepEqual((await (await commerce.shopGet(get('?userId=' + alice.userId))).json()).orders, []);
  for (const action of ['cancel', 'return']) {
    assert.equal((await commerce.shopPost(post({ action, id: orderId, revision: 0, note: 'Synthetic other-customer request' }))).status, 404);
  }
  assert.equal(db.prepare('SELECT status FROM shop_orders WHERE id=?').get(orderId).status, 'received');
  assert.equal(db.prepare('SELECT stock FROM shop_inventory').get().stock, 1);

  // Admin access remains bound to the pinned site ID and validates mutation origin.
  for (const visitor of [null, alice, bob, { userId: 'test-other-owner-id', email: owner.email }]) {
    identity = visitor;
    assert.equal((await commerce.adminGet(get())).status, 403);
    assert.equal((await commerce.adminPost(post({ action: 'settings', revision: orderRevision, settings: testSettings }))).status, 403);
  }
  identity = owner;
  for (const origin of ['https://other.test', null]) {
    assert.equal((await commerce.adminPost(post({ action: 'settings', revision: orderRevision, settings: testSettings }, origin))).status, 403);
  }
  assert.equal((await (await commerce.shopGet(get('?view=settings'))).json()).revision, orderRevision);
  assert.equal((await commerce.adminGet(get())).status, 200);

  console.log('PASS: isolated SQL-backed signup policy, consent/origin/auth/version denial, trusted identity binding, member persistence/upsert, customer profile/order isolation, and pinned administrator protection.');
  db.close();
})().catch(error => { console.error(error); db.close(); process.exitCode = 1; });

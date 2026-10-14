// Read-only launch diagnostics against synthetic environment values and an
// isolated SQLite fixture. No production DB, Clerk, R2, or owner bootstrap.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

const base = path.resolve(__dirname, '..');
const repository = path.resolve(base, '../..');
const environmentNames = [
  'NODE_ENV', 'NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'NEXT_PUBLIC_CLERK_PUBLISHABLE',
  'CLERK_SECRET_KEY', 'VERCEL_ENV', 'VERCEL_URL', 'OWNER_BOOTSTRAP_EMAIL',
  'TURSO_DATABASE_URL', 'TURSO_URL', 'TURSO_AUTH_TOKEN', 'TURSO_TOKEN',
  'TURSO_DATABASE_AUTH_TOKEN', 'TURSO_DATABASE_TOKEN', 'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'UPLOAD_SIGNING_SECRET',
  'STORE_SITE_MODE',
];
const savedEnvironment = Object.fromEntries(environmentNames.map(name => [name, process.env[name]]));
const sentinels = [
  'readonly-db-secret-token', 'readonly-r2-access-key', 'readonly-r2-secret-key',
  'owner-private@example.test', 'private-owner-user-id', 'Private diagnostic brand',
  'Private diagnostic policy text', 'sk_test_readonly-secret',
  'libsql://readonly-database.example.test', 'private-customer@example.test',
  'private-order-id', 'private-customer-user-id', 'pk_test_readonly-public', 'pk_test_readonly-alias',
];
const fields = [
  'databaseConfigured', 'databaseConnected', 'schemaReady', 'catalog', 'legalReady',
  'ownerRegistered', 'ownerBootstrapConfigured', 'authConfigured', 'imageConfigured', 'uploadConfigured',
  'testMode', 'testPoliciesAvailable', 'authConfiguration',
].sort();
let fixture, statements = [], forbidden = [], databaseCalls = 0, connectionFailure = false;
let checks = 0;
let middlewareCalls = 0;
class NextResponse extends Response {
  static next() { return new NextResponse(null, { headers: { 'x-test-next': 'yes' } }); }
}

function readonly(sql) {
  if (!/^\s*SELECT\b/i.test(sql)
      || /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|REPLACE|ATTACH|DETACH|VACUUM|REINDEX|PRAGMA)\b/i.test(sql)
      || /;\s*\S/.test(sql)) {
    forbidden.push(sql);
    throw Error('Readiness attempted a non-read-only operation.');
  }
}
const database = {
  prepare(sql) {
    readonly(sql);
    let values = [];
    return {
      bind(...next) { values = next; return this; },
      async first(column) {
        statements.push({ sql, values });
        if (connectionFailure) throw Error(sentinels.join(' '));
        const row = fixture.prepare(sql).get(...values) ?? null;
        return column === undefined ? row : row?.[column] ?? null;
      },
      async all() {
        statements.push({ sql, values });
        if (connectionFailure) throw Error(sentinels.join(' '));
        return { success: true, results: fixture.prepare(sql).all(...values) };
      },
      async run() { forbidden.push('run'); throw Error('Readiness must not write.'); },
    };
  },
  async batch() { forbidden.push('batch'); throw Error('No write batch is permitted.'); },
};

const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const localRequire = id => {
    if (id.endsWith('.json')) return require(path.resolve(path.dirname(file), id));
    if (file === path.join(base, 'templates/setup/route.ts') && id === '../../runtime/readiness') return { getReadiness };
    if (file === path.join(base, 'templates/proxy.ts')) {
      if (id === './runtime/auth-config') return load(path.join(base, 'runtime/auth-config.ts'));
      if (id === 'next/server') return { NextResponse };
      if (id === '@clerk/nextjs/server') return {
        clerkMiddleware() { middlewareCalls++; return async () => new Response('provider middleware reached'); },
      };
    }
    if (path.basename(file) === 'readiness.ts') {
      if (id === './database') return {
        validateDatabaseUrl: load(path.join(base, 'runtime/database.ts')).validateDatabaseUrl,
        getDatabase() { databaseCalls++; return database; },
      };
      if (id === './auth-config') return load(path.join(base, 'runtime/auth-config.ts'));
      if (id === '../lib/content') return load(path.join(repository, 'lib/content.ts'));
    }
    if (id === '@libsql/client') return {
      createClient() { forbidden.push('external DB client'); throw Error('No network client in this test.'); },
    };
    if (id.includes('clerk') || id.includes('aws-sdk') || id.includes('storage') || id.includes('admin') || id.includes('chatgpt-auth')) {
      forbidden.push('forbidden dependency: ' + id);
      throw Error('Readiness may not call identity services, storage, or owner bootstrap.');
    }
    return id.startsWith('.') ? load(path.resolve(path.dirname(file), id + '.ts')) : require(id);
  };
  vm.runInThisContext('(function(require,module,exports){' + code + '})', { filename: file })(localRequire, module, module.exports);
  cache.set(file, module.exports);
  return module.exports;
}

function reset({ initialized = false, env = {}, databaseConfigured = true } = {}) {
  fixture?.close();
  fixture = new DatabaseSync(':memory:');
  for (const name of environmentNames) delete process.env[name];
  Object.assign(process.env, { NODE_ENV: 'production', STORE_SITE_MODE: 'live' });
  if (databaseConfigured) Object.assign(process.env, {
    TURSO_DATABASE_URL: 'libsql://readonly-database.example.test',
    TURSO_AUTH_TOKEN: 'readonly-db-secret-token',
  });
  Object.assign(process.env, env);
  if (initialized) {
    for (const name of fs.readdirSync(path.join(repository, 'drizzle')).filter(name => /^\d+_[\w-]+\.sql$/.test(name)).sort()) {
      fixture.exec(fs.readFileSync(path.join(repository, 'drizzle', name), 'utf8'));
    }
    fixture.exec(fs.readFileSync(path.join(base, 'migrations/0003_vercel.sql'), 'utf8'));
  }
  statements = []; forbidden = []; databaseCalls = 0; connectionFailure = false;
}

function storeCatalog(value) {
  fixture.prepare('INSERT INTO store_content (key,data,revision,updated_at) VALUES (?,?,?,?)').run('main', typeof value === 'string' ? value : JSON.stringify(value), 12, '2026-10-14T00:00:00Z');
}
function storeSettings(value) {
  fixture.prepare('INSERT INTO shop_settings (key,data,revision) VALUES (?,?,?)').run('main', typeof value === 'string' ? value : JSON.stringify(value), 7);
}
function persistedSnapshot() {
  const names = fixture.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => row.name);
  return names.map(name => [name, fixture.prepare('SELECT * FROM "' + name + '"').all()]);
}
const emptyStatus = {
  databaseConfigured: false, databaseConnected: false, schemaReady: false,
  catalog: 'unavailable', legalReady: false, ownerRegistered: false,
  ownerBootstrapConfigured: false,
  authConfigured: false,
  authConfiguration: { siteUrl: 'missing', publishableKey: 'missing', secretKey: 'missing', publishableKeySource: 'missing', keysMatch: false },
  imageConfigured: false, uploadConfigured: false,
  testMode: false, testPoliciesAvailable: false,
};
async function inspect(expected = {}) {
  const before = persistedSnapshot();
  const value = await getReadiness();
  assert.deepEqual(Object.keys(value).sort(), fields, 'Only approved coarse diagnostic fields may be public.');
  for (const name of fields.filter(name => name !== 'catalog' && name !== 'authConfiguration')) assert.equal(typeof value[name], 'boolean', name);
  assert.deepEqual(Object.keys(value.authConfiguration).sort(), ['keysMatch', 'publishableKey', 'publishableKeySource', 'secretKey', 'siteUrl']);
  for (const name of ['siteUrl', 'publishableKey', 'secretKey']) assert(['missing', 'invalid', 'ready'].includes(value.authConfiguration[name]));
  assert(['canonical', 'compatibility', 'missing'].includes(value.authConfiguration.publishableKeySource));
  assert.equal(typeof value.authConfiguration.keysMatch, 'boolean');
  assert(['unavailable', 'initial-sample', 'stored'].includes(value.catalog));
  for (const [name, wanted] of Object.entries(expected)) assert.deepEqual(value[name], wanted, name);
  const encoded = JSON.stringify(value);
  for (const sentinel of sentinels) assert(!encoded.includes(sentinel), 'No credentials, private content, identity, or SDK error leaks.');
  assert.deepEqual(forbidden, [], 'No writes, external service calls, or authentication/owner mutations.');
  statements.forEach(({ sql }) => readonly(sql));
  assert.deepEqual(persistedSnapshot(), before, 'Diagnostic requests leave all fixture data unchanged.');
  checks++;
  return value;
}

let getReadiness;
(async () => {
  ({ getReadiness } = load(path.join(base, 'runtime/readiness.ts')));
  const { defaults } = load(path.join(repository, 'lib/content.ts'));
  const { TEST_TERMS, TEST_PRIVACY } = load(path.join(base, 'runtime/test-policies.ts'));

  reset({ databaseConfigured: false, env: { STORE_SITE_MODE: 'test' } });
  await inspect({ testMode: true, testPoliciesAvailable: true, schemaReady: false, legalReady: false });
  assert.equal(databaseCalls, 0);
  reset({ initialized: true, env: { STORE_SITE_MODE: 'test' } });
  await inspect({ testMode: true, testPoliciesAvailable: true, schemaReady: true, legalReady: false });
  for (const legal of [{ terms: '', privacy: '' }, '{bad-json']) {
    reset({ initialized: true, env: { STORE_SITE_MODE: 'test' } });
    storeSettings(legal);
    await inspect({ testMode: true, testPoliciesAvailable: false, legalReady: false });
  }
  for (const modeValue of ['test', 'live', 'unknown']) {
    reset({ initialized: true, env: { STORE_SITE_MODE: modeValue } });
    storeSettings({ terms: TEST_TERMS, privacy: TEST_PRIVACY });
    await inspect({ testMode: modeValue === 'test', testPoliciesAvailable: false, legalReady: modeValue === 'test' });
  }

  reset({ databaseConfigured: false });
  assert.deepEqual(await inspect(), emptyStatus);
  assert.equal(databaseCalls, 0); assert.equal(statements.length, 0);
  for (const invalid of ['file:///tmp/unsafe.db', 'ftp://wrong.example.test', 'libsql://user:secret@example.test', 'https://example.test/?token=secret', 'not a URL']) {
    reset({ env: { TURSO_DATABASE_URL: invalid } });
    await inspect({ databaseConfigured: false, databaseConnected: false, schemaReady: false });
    assert.equal(databaseCalls, 0); assert.equal(statements.length, 0);
  }
  reset({ env: { TURSO_AUTH_TOKEN: '   ' } });
  await inspect({ databaseConfigured: false }); assert.equal(databaseCalls, 0);

  reset(); connectionFailure = true;
  await inspect({ databaseConfigured: true, databaseConnected: false, schemaReady: false, catalog: 'unavailable' });
  reset();
  await inspect({ databaseConfigured: true, databaseConnected: true, schemaReady: false, catalog: 'unavailable', ownerRegistered: false });
  assert.equal(fixture.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get().n, 0, 'Uninitialized DB is never automatically migrated.');

  reset({ initialized: true });
  await inspect({ databaseConfigured: true, databaseConnected: true, schemaReady: true, catalog: 'initial-sample', legalReady: false, ownerRegistered: false });
  for (const tokenName of ['TURSO_AUTH_TOKEN', 'TURSO_TOKEN', 'TURSO_DATABASE_AUTH_TOKEN', 'TURSO_DATABASE_TOKEN']) {
    reset({ initialized: true, databaseConfigured: false, env: { TURSO_URL: ' libsql://readonly-database.example.test ', [tokenName]: ' readonly-db-secret-token ' } });
    await inspect({ databaseConfigured: true, databaseConnected: true, schemaReady: true, catalog: 'initial-sample' });
  }
  for (const [table, column] of [['shop_orders', 'action_token'], ['auth_identity_links', 'verified_at'], ['store_upload_tickets', 'final_key']]) {
    reset({ initialized: true }); fixture.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
    await inspect({ databaseConnected: true, schemaReady: false, catalog: 'unavailable' });
  }

  reset({ initialized: true });
  const catalog = structuredClone(defaults); catalog.brand = 'Private diagnostic brand';
  storeCatalog(catalog);
  await inspect({ schemaReady: true, catalog: 'stored' });
  for (const malformed of ['{not-json', { brand: 'Missing required fields' }]) {
    reset({ initialized: true }); storeCatalog(malformed);
    await inspect({ databaseConnected: true, schemaReady: true, catalog: 'unavailable' });
  }

  for (const legal of [null, { terms: '', privacy: '' }, { terms: ' \n\t ', privacy: 'Private diagnostic policy text' }, { terms: 'Private diagnostic policy text', privacy: ' \n ' }, { terms: 123, privacy: 'Valid fixture' }, '{malformed']) {
    reset({ initialized: true }); if (legal !== null) storeSettings(legal);
    await inspect({ schemaReady: true, legalReady: false });
  }
  reset({ initialized: true });
  storeSettings({ accepting: false, shippingFee: 0, bankInfo: '', support: '', returnGuide: '', terms: 'Private diagnostic policy text', privacy: 'Private diagnostic policy text' });
  fixture.prepare('INSERT INTO store_owner VALUES (?,?)').run('owner', 'private-owner-user-id');
  fixture.prepare('INSERT INTO shop_customers VALUES (?,?,?,?,?,?)').run('private-customer-user-id', 'private-customer@example.test', 'Private customer', '01000000000', 7, '2026-10-14T00:00:00Z');
  process.env.OWNER_BOOTSTRAP_EMAIL = 'owner-private@example.test';
  await inspect({ ownerRegistered: true, legalReady: true, ownerBootstrapConfigured: true });
  assert(!statements.some(({ sql }) => /\bFROM\s+["`]?shop_(?:customers|orders|events)\b/i.test(sql) && !/\bWHERE\s+0\b/i.test(sql)), 'Customer/order data is never queried.');
  assert(!statements.some(({ sql }) => /SELECT\s+(?:\*|user_id)\s+FROM\s+store_owner/i.test(sql)), 'Owner identity is never retrieved.');
  reset({ initialized: true, env: { OWNER_BOOTSTRAP_EMAIL: 'owner-private@example.test' } });
  await inspect({ ownerRegistered: false, ownerBootstrapConfigured: true });
  assert.equal(fixture.prepare('SELECT count(*) AS n FROM store_owner').get().n, 0, 'Configured bootstrap email is never assigned by diagnostics.');

  const authEnv = { NEXT_PUBLIC_SITE_URL: 'https://shop.example.test', NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_readonly-public', CLERK_SECRET_KEY: 'sk_test_readonly-secret' };
  reset({ env: authEnv }); await inspect({ authConfigured: true, databaseConnected: true, schemaReady: false });
  for (const patch of [{ NEXT_PUBLIC_SITE_URL: '' }, { NEXT_PUBLIC_SITE_URL: 'http://shop.example.test' }, { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: '' }, { CLERK_SECRET_KEY: 'invalid' }]) {
    reset({ env: { ...authEnv, ...patch } }); await inspect({ authConfigured: false });
  }
  reset({ env: {
    NEXT_PUBLIC_SITE_URL: authEnv.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_CLERK_PUBLISHABLE: 'pk_test_readonly-alias', CLERK_SECRET_KEY: authEnv.CLERK_SECRET_KEY,
  } });
  await inspect({ authConfigured: true, authConfiguration: {
    siteUrl: 'ready', publishableKey: 'ready', secretKey: 'ready', publishableKeySource: 'compatibility', keysMatch: true,
  } });
  for (const [value, status] of [['', 'missing'], ['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_readonly-public', 'invalid'], ['pk_test_readonly-public\nCLERK_SECRET_KEY=sk_test_readonly-secret', 'invalid']]) {
    reset({ env: { ...authEnv, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: value, NEXT_PUBLIC_CLERK_PUBLISHABLE: 'pk_test_readonly-alias' } });
    await inspect({ authConfigured: false, authConfiguration: {
      siteUrl: 'ready', publishableKey: status, secretKey: 'ready', publishableKeySource: 'canonical', keysMatch: false,
    } });
  }
  reset({ env: { ...authEnv, CLERK_SECRET_KEY: 'sk_live_readonly-secret' } });
  await inspect({ authConfigured: false, authConfiguration: {
    siteUrl: 'ready', publishableKey: 'ready', secretKey: 'ready', publishableKeySource: 'canonical', keysMatch: false,
  } });

  const imageEnv = { R2_ACCOUNT_ID: 'a'.repeat(32), R2_ACCESS_KEY_ID: 'readonly-r2-access-key', R2_SECRET_ACCESS_KEY: 'readonly-r2-secret-key', R2_BUCKET_NAME: 'readonly-images' };
  reset({ env: imageEnv }); await inspect({ imageConfigured: true, uploadConfigured: false });
  for (const patch of [{ R2_ACCOUNT_ID: 'invalid' }, { R2_ACCOUNT_ID: 'A'.repeat(32) }, { R2_ACCESS_KEY_ID: '' }, { R2_SECRET_ACCESS_KEY: '' }, { R2_BUCKET_NAME: '' }]) {
    reset({ env: { ...imageEnv, ...patch } }); await inspect({ imageConfigured: false });
  }
  reset({ env: { ...imageEnv, UPLOAD_SIGNING_SECRET: 'x'.repeat(31) } }); await inspect({ imageConfigured: true, uploadConfigured: false });
  reset({ env: { ...imageEnv, UPLOAD_SIGNING_SECRET: 'x'.repeat(32) } }); await inspect({ imageConfigured: true, uploadConfigured: true });
  reset({ env: { ...imageEnv, UPLOAD_SIGNING_SECRET: '한'.repeat(11) } }); await inspect({ imageConfigured: true, uploadConfigured: true });

  // Opening the public GET remains read-only. The fixed, explicit preparation
  // form submits only to the separately protected POST endpoint.
  const page = load(path.join(base, 'templates/setup/route.ts'));
  assert.deepEqual(Object.keys(page).sort(), ['GET', 'dynamic', 'runtime']);
  assert.equal(page.dynamic, 'force-dynamic'); assert.equal(page.runtime, 'nodejs');
  for (const ready of [false, true]) {
    reset({ initialized: ready, databaseConfigured: ready, env: ready ? { ...authEnv, ...imageEnv, UPLOAD_SIGNING_SECRET: 'x'.repeat(32) } : {} });
    if (ready) {
      const catalog = structuredClone(defaults); catalog.brand = 'Private diagnostic brand'; storeCatalog(catalog);
      storeSettings({ terms: 'Private diagnostic policy text', privacy: 'Private diagnostic policy text' });
      fixture.prepare('INSERT INTO store_owner VALUES (?,?)').run('owner', 'private-owner-user-id');
    }
    const before = persistedSnapshot();
    const response = await page.GET();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.match(response.headers.get('content-type'), /text\/html; charset=utf-8/);
    const html = await response.text();
    for (const sentinel of sentinels) assert(!html.includes(sentinel), 'Public HTML cannot expose private fields, environment values, or SDK errors.');
    assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
    assert.doesNotMatch(html, /<script\b/i, 'Diagnostic GET does not trigger an initialization request.');
    assert.match(html, /Clerk 공개키 설정/);
    assert.match(html, /Clerk 비밀키 설정/);
    if (!ready) {
      assert.match(html, /NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY가 없습니다/);
      assert.match(html, /CLERK_SECRET_KEY가 없습니다/);
      assert.match(html, /Vercel에서 표시된 연결값 수정하기/);
    }
    if (ready) assert.doesNotMatch(html, /<form\b/i, 'Existing initialized schema does not offer preparation again.');
    else {
      assert.match(html, /<form\b[^>]*method=["']POST["'][^>]*action=["']\/api\/setup\/initialize["']/i, 'Explicit preparation uses the fixed protected POST endpoint.');
      assert.match(html, /<input\b(?=[^>]*\btype=["']checkbox["'])(?=[^>]*\bname=["']confirm_new_empty["'])(?=[^>]*\bvalue=["']yes["'])(?=[^>]*\brequired\b)[^>]*>/i, 'New empty database confirmation is mandatory.');
      assert.match(html, /<button\b[^>]*\bdisabled\b/i, 'Preparation is disabled unless DB, auth, owner bootstrap and missing schema gates all permit it.');
    }
    assert.deepEqual(persistedSnapshot(), before); assert.deepEqual(forbidden, []);
    checks++;
  }

  // Only connected, uninitialized databases with configured login and owner
  // email can offer the explicit POST. Missing gates never enable it.
  for (const [env, initialized, enabled] of [
    [{ ...authEnv, OWNER_BOOTSTRAP_EMAIL: 'owner-private@example.test' }, false, true],
    [{ ...authEnv }, false, false],
    [{ OWNER_BOOTSTRAP_EMAIL: 'owner-private@example.test' }, false, false],
    [{ ...authEnv, OWNER_BOOTSTRAP_EMAIL: 'owner-private@example.test' }, true, false],
  ]) {
    reset({ initialized, env });
    const before = persistedSnapshot();
    const html = await (await page.GET()).text();
    const submit = html.match(/<button\b[^>]*type=["']submit["'][^>]*>/i);
    if (initialized) assert.equal(submit, null, 'Already prepared schema offers no reinitialization.');
    else {
      assert(submit, 'Explicit preparation submit button exists.');
      assert.equal(!/\bdisabled\b/i.test(submit[0]), enabled);
    }
    assert.deepEqual(persistedSnapshot(), before); assert.deepEqual(forbidden, []);
    for (const sentinel of sentinels) assert(!html.includes(sentinel));
    checks++;
  }

  // Only the exact public diagnostic's GET and HEAD skip Clerk. Private
  // pages/APIs and mutation requests retain their existing middleware path.
  const proxy = load(path.join(base, 'templates/proxy.ts')).default;
  reset({ env: authEnv }); middlewareCalls = 0;
  for (const method of ['GET', 'HEAD']) {
    const response = await proxy({ nextUrl: new URL('https://shop.example.test/setup'), method }, {});
    assert.equal(response.headers.get('x-test-next'), 'yes');
  }
  assert.equal(middlewareCalls, 0);
  for (const [pathname, method] of [['/setup', 'POST'], ['/setup/extra', 'GET'], ['/admin', 'GET'], ['/account', 'GET'], ['/api/admin/content', 'PUT']]) {
    const response = await proxy({ nextUrl: new URL('https://shop.example.test' + pathname), method }, {});
    assert.equal(await response.text(), 'provider middleware reached');
  }
  assert.equal(middlewareCalls, 5);
  reset({ env: { ...authEnv, CLERK_SECRET_KEY: 'invalid' } });
  const diagnostic = await proxy({ nextUrl: new URL('https://shop.example.test/setup'), method: 'GET' }, {});
  assert.equal(diagnostic.headers.get('x-test-next'), 'yes', 'Diagnostic remains accessible while authentication configuration is invalid.');
  const unavailable = await proxy({ nextUrl: new URL('https://shop.example.test/auth/sign-in'), method: 'GET' }, {});
  assert.equal(unavailable.status, 503, 'Unavailable authentication stays closed.');
  checks++;

  console.log(`PASS: ${checks} read-only readiness scenarios; config aliases, connection/schema/column failure, catalog and legal readiness, coarse owner status, error redaction, no credentials or customer/order data, no bootstrap, no external readiness auth/storage calls, unchanged fixture data, safe GET-only HTML, and exact GET/HEAD diagnostic middleware bypass.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  fixture?.close();
  for (const [name, value] of Object.entries(savedEnvironment)) value === undefined ? delete process.env[name] : process.env[name] = value;
});

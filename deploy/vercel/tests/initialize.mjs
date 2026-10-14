import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createClient } from '@libsql/client';
import ts from 'typescript';
import { migrationPlan, ledger, tables, extraTables, assertInitialized } from '../scripts/database-tools.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const base = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'street-label-initialize-api-'));
const plan = await migrationPlan();
const initializationPlan = { ledger, migrations: plan };
const origin = 'https://shop.example.test';
const owner = 'owner-private@example.test';
const verified = (email = owner) => ({ status: 'verified', user: { providerUserId: 'provider-owner-private', email, fullName: 'Private Owner' } });
const environmentBefore = process.env.OWNER_BOOTSTRAP_EMAIL;
const sensitive = [owner, 'provider-owner-private', 'Private Owner', 'private-provider-token', 'libsql://private.example.test', 'private-order-data'];
let defaultAccount = { status: 'signed-out', user: null }, defaultDatabase;
let forbiddenOwnerChecks = 0, defaultAuthCalls = 0, defaultDatabaseCalls = 0, passed = 0;

async function compile(file, resolve) {
  const module = { exports: {} };
  const code = ts.transpileModule(await fs.readFile(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInThisContext('(function(require,module,exports){' + code + '})', { filename: file })(resolve, module, module.exports);
  return module.exports;
}
const databaseRuntime = await compile(path.join(base, 'runtime/database.ts'), require);
const admin = await compile(path.join(root, 'lib/admin.ts'), id => {
  if (id === 'cloudflare:workers') return { env: {} };
  if (id.includes('chatgpt-auth')) return { async getChatGPTUser() { forbiddenOwnerChecks++; throw Error('Do not use identity-link/owner APIs before schema exists.'); } };
  return require(id);
});
const runtime = await compile(path.join(base, 'runtime/initialize.ts'), id => {
  if (id === './auth') return {
    async getClerkAccountState() { defaultAuthCalls++; return defaultAccount; },
    isTrustedOrigin(value) { return value === origin; },
  };
  if (id === './database') return { getDatabase() { defaultDatabaseCalls++; return defaultDatabase; } };
  if (id === '../lib/admin') return admin;
  if (id === '../lib/initialization-plan') return { initializationPlan };
  return require(id);
});
function request(options = {}) {
  const method = options.method ?? 'POST';
  return new Request(options.url ?? origin + '/api/setup/initialize', {
    method,
    headers: {
      ...(options.origin === null ? {} : { Origin: options.origin ?? origin }),
      'Content-Type': options.contentType ?? 'application/x-www-form-urlencoded;charset=UTF-8',
      ...options.headers,
    },
    ...(method === 'GET' || method === 'HEAD' ? {} : { body: options.body ?? 'confirm_new_empty=yes' }),
  });
}
async function check(label, test) { await test(); passed++; console.log('PASS ' + label); }
async function inspectResponse(response, expected) {
  assert.equal(response.status, expected);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  const body = await response.text();
  for (const value of sensitive) assert.ok(!body.includes(value), 'Private values never appear in API HTML.');
  if (expected !== 303) {
    assert.match(response.headers.get('content-type'), /^text\/html; charset=utf-8$/);
    assert.match(body, /href="\/setup"/);
  }
  return body;
}
async function fixture(name, overrides = {}) {
  const client = createClient({ url: 'file:' + path.join(directory, name + '.db'), intMode: 'number' });
  const adapter = databaseRuntime.createDatabase(client);
  const calls = { database: 0, auth: 0, batch: 0 };
  const database = {
    prepare(sql) { return adapter.prepare(sql); },
    async batch(statements) { calls.batch++; return adapter.batch(statements); },
  };
  const handler = runtime.createInitializationHandler({
    async accountState() { calls.auth++; return verified(); },
    ownerEmail: () => owner,
    database() { calls.database++; return database; },
    trustedOrigin: value => value === origin,
    ...overrides,
  });
  return { client, adapter, database, calls, handler };
}
async function snapshot(client) {
  const schema = (await client.execute("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name")).rows.map(row => ({ ...row }));
  const records = {};
  for (const row of schema.filter(row => row.type === 'table')) records[row.name] = (await client.execute(`SELECT * FROM "${row.name}" ORDER BY rowid`)).rows.map(row => ({ ...row }));
  return { schema, records };
}

try {
  const blocked = [
    ['method', {}, { method: 'GET' }, 405],
    ['missing owner configuration', { ownerEmail: () => undefined }, {}, 503],
    ['empty owner configuration', { ownerEmail: () => ' ' }, {}, 503],
    ['signed out with forged Sites identity', { accountState: async () => ({ status: 'signed-out', user: null }) }, { headers: { 'oai-authenticated-user-id': 'provider-owner-private', 'oai-authenticated-user-email': owner } }, 401],
    ['unverified email', { accountState: async () => ({ status: 'unverified', user: null }) }, {}, 403],
    ['wrong verified email', { accountState: async () => verified('stranger@example.test') }, {}, 403],
    ['provider unavailable', { accountState: async () => ({ status: 'unavailable', user: null }) }, {}, 503],
    ['provider error redacted', { accountState: async () => { throw Error(sensitive.join(' ')); } }, {}, 503],
    ['missing origin', {}, { origin: null }, 403],
    ['external origin', {}, { origin: 'https://evil.example.test' }, 403],
    ['trusted origin must also match request origin', {}, { url: 'https://forged.example.test/api/setup/initialize' }, 403],
    ['untrusted canonical origin', { trustedOrigin: () => false }, {}, 403],
    ['JSON body', {}, { contentType: 'application/json', body: '{"confirm_new_empty":"yes"}' }, 415],
    ['missing confirmation', {}, { body: 'other=no' }, 400],
    ['explicit confirmation not yes', {}, { body: 'confirm_new_empty=no' }, 400],
    ['duplicate confirmation', {}, { body: 'confirm_new_empty=yes&confirm_new_empty=yes' }, 400],
    ['extra arbitrary fields', {}, { body: 'confirm_new_empty=yes&owner=' + owner }, 400],
    ['malformed encoding', {}, { body: 'confirm_new_empty=yes%' }, 400],
    ['invalid UTF-8', {}, { body: new Uint8Array([255]) }, 400],
    ['oversized body', {}, { body: 'confirm_new_empty=yes&x=' + 'a'.repeat(4096) }, 413],
  ];
  for (const [name, override, options, status] of blocked) {
    await check('refuses ' + name + ' before database access or writes', async () => {
      const value = await fixture('blocked-' + passed, override);
      try {
        await inspectResponse(await value.handler(request(options)), status);
        assert.equal(value.calls.database, 0);
        assert.equal(value.calls.batch, 0);
        assert.deepEqual(await snapshot(value.client), { schema: [], records: {} });
      } finally { value.client.close(); }
    });
  }

  await check('verified case-insensitive exact owner initializes all migrations and no owner/customer/shop records', async () => {
    const value = await fixture('success', { ownerEmail: () => ' OWNER-PRIVATE@EXAMPLE.TEST ', accountState: async () => verified('OWNER-PRIVATE@example.test') });
    try {
      const response = await value.handler(request());
      assert.equal(response.headers.get('location'), '/setup');
      await inspectResponse(response, 303);
      await assertInitialized(value.client);
      assert.equal(value.calls.batch, 1);
      const saved = await snapshot(value.client);
      assert.deepEqual(Object.keys(saved.records).sort(), [...tables, ...extraTables, ledger].sort());
      for (const table of [...tables, ...extraTables]) assert.deepEqual(saved.records[table], []);
      assert.equal(saved.records[ledger].length, 4);
      for (const row of saved.records[ledger]) assert.match(row.applied_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    } finally { value.client.close(); }
  });

  for (const [name, sql] of [
    ['arbitrary empty table', 'CREATE TABLE existing(value TEXT)'],
    ['existing owner', "CREATE TABLE store_owner(key TEXT,user_id TEXT);INSERT INTO store_owner VALUES('owner','KEEP-OWNER')"],
    ['existing orders', "CREATE TABLE shop_orders(id TEXT,data TEXT);INSERT INTO shop_orders VALUES('KEEP','private-order-data')"],
  ]) {
    await check('refuses ' + name + ' without changing schema or data', async () => {
      const value = await fixture('existing-' + passed);
      try {
        await value.client.executeMultiple(sql);
        const before = await snapshot(value.client);
        await inspectResponse(await value.handler(request()), 409);
        assert.equal(value.calls.batch, 0);
        assert.deepEqual(await snapshot(value.client), before);
      } finally { value.client.close(); }
    });
  }

  await check('repeat initialization refuses without overwriting records or changing ledger', async () => {
    const value = await fixture('repeat');
    try {
      assert.equal((await value.handler(request())).status, 303);
      await value.client.execute("INSERT INTO store_owner(key,user_id) VALUES('owner','KEEP-OWNER')");
      const before = await snapshot(value.client);
      await inspectResponse(await value.handler(request()), 409);
      assert.deepEqual(await snapshot(value.client), before);
      assert.equal(value.calls.batch, 1);
    } finally { value.client.close(); }
  });

  await check('table created between preflight and batch is refused inside atomic batch', async () => {
    const value = await fixture('race-foreign');
    let before;
    value.database.batch = async statements => {
      value.calls.batch++;
      await value.client.executeMultiple("CREATE TABLE external_record(value TEXT);INSERT INTO external_record VALUES('KEEP');");
      before = await snapshot(value.client);
      return value.adapter.batch(statements);
    };
    try {
      await inspectResponse(await value.handler(request()), 409);
      assert.deepEqual(await snapshot(value.client), before);
      assert.equal((await value.client.execute("SELECT count(*) AS n FROM sqlite_temp_master WHERE type='table'")).rows[0].n, 0);
    } finally { value.client.close(); }
  });

  await check('simultaneous initializers commit once and losing transaction cannot overwrite schema', async () => {
    const value = await fixture('race-initialize');
    let waiting = 0, release;
    const gate = new Promise(resolve => { release = resolve; });
    const prepare = value.database.prepare.bind(value.database);
    value.database.prepare = sql => {
      const statement = prepare(sql);
      if (sql.startsWith('SELECT name FROM sqlite_master')) {
        const all = statement.all.bind(statement);
        statement.all = async () => {
          const result = await all();
          waiting++;
          if (waiting === 2) release();
          await gate;
          return result;
        };
      }
      return statement;
    };
    try {
      const responses = await Promise.all([value.handler(request()), value.handler(request())]);
      assert.deepEqual(responses.map(item => item.status).sort(), [303, 409]);
      await assertInitialized(value.client);
      for (const name of [...tables, ...extraTables]) assert.equal((await value.client.execute(`SELECT count(*) AS n FROM "${name}"`)).rows[0].n, 0);
      assert.equal((await value.client.execute(`SELECT count(*) AS n FROM ${ledger}`)).rows[0].n, 4);
    } finally { value.client.close(); }
  });

  await check('failed write batch rolls back all schema and migration metadata; error details redacted', async () => {
    const value = await fixture('failure');
    value.database.batch = async statements => {
      value.calls.batch++;
      return value.adapter.batch([...statements, value.adapter.prepare("INSERT INTO store_owner(key,user_id) VALUES('owner',NULL)")]);
    };
    try {
      await inspectResponse(await value.handler(request()), 503);
      assert.deepEqual(await snapshot(value.client), { schema: [], records: {} });
      assert.equal((await value.client.execute("SELECT count(*) AS n FROM sqlite_temp_master WHERE type='table'")).rows[0].n, 0);
      await value.client.executeMultiple('BEGIN IMMEDIATE; COMMIT;');
    } finally { value.client.close(); }
  });

  await check('default POST ignores client identities and can verify owner before identity tables exist', async () => {
    process.env.OWNER_BOOTSTRAP_EMAIL = owner;
    defaultAuthCalls = 0; defaultDatabaseCalls = 0;
    defaultAccount = { status: 'signed-out', user: null };
    await inspectResponse(await runtime.POST(request({ headers: { 'oai-authenticated-user-id': 'provider-owner-private', 'oai-authenticated-user-email': owner } })), 401);
    assert.equal(defaultDatabaseCalls, 0);
    assert.equal(defaultAuthCalls, 1);
    const value = await fixture('default');
    try {
      defaultAccount = verified();
      defaultDatabase = value.database;
      await inspectResponse(await runtime.POST(request()), 303);
      await assertInitialized(value.client);
      assert.equal(defaultDatabaseCalls, 1);
      assert.equal(forbiddenOwnerChecks, 0, 'No guard/isOwner/identity-link bootstrap read or assignment occurs.');
      assert.equal((await value.client.execute('SELECT count(*) AS n FROM store_owner')).rows[0].n, 0);
    } finally { value.client.close(); }
  });

  await check('Next API template exports only POST with Node runtime and dynamic caching', async () => {
    const page = await compile(path.join(base, 'templates/api/setup/initialize/route.ts'), id => {
      assert.equal(id, '../../../../runtime/initialize');
      return runtime;
    });
    assert.deepEqual(Object.keys(page).sort(), ['POST', 'dynamic', 'runtime']);
    assert.equal(page.POST, runtime.POST);
    assert.equal(page.runtime, 'nodejs');
    assert.equal(page.dynamic, 'force-dynamic');
  });
  console.log(`Initialization API: ${passed} scenarios passed. Synthetic Clerk sessions and isolated local libSQL databases only; no provider credentials or production data used.`);
} finally {
  environmentBefore === undefined ? delete process.env.OWNER_BOOTSTRAP_EMAIL : process.env.OWNER_BOOTSTRAP_EMAIL = environmentBefore;
  await fs.rm(directory, { recursive: true, force: true });
}

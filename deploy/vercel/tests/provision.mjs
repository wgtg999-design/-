// Isolated libSQL fixtures and synthetic Clerk responses only. Never contacts
// Vercel, Clerk, Turso, or the original shop's production resources.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { initializeDatabase } from '../scripts/migrate.mjs';
import { tables, extraTables } from '../scripts/database-tools.mjs';
import { provisionDeployment } from '../scripts/provision.mjs';

const canonical = 'https://street-label-shop.vercel.app';
const clock = Date.parse('2026-10-15T10:00:00.000Z');
const syntheticSecret = 'sk_test_SYNTHETIC_NEVER_REAL_PROVISION';
const syntheticToken = 'SYNTHETIC_NEVER_REAL_DATABASE_TOKEN';
const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'street-label-provision-tests-'));
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('Live network access is forbidden in provisioning tests.'); };
let scenarios = 0, serial = 0;
const environment = () => ({
  VERCEL: '1', VERCEL_ENV: 'production', STORE_SITE_MODE: 'test',
  NEXT_PUBLIC_SITE_URL: canonical, OWNER_BOOTSTRAP_EMAIL: ' Owner@Example.Test ',
  TURSO_DATABASE_URL: 'libsql://provision.example.test', TURSO_AUTH_TOKEN: syntheticToken,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_SYNTHETIC_NEVER_REAL', CLERK_SECRET_KEY: syntheticSecret,
});
const providerUser = (overrides = {}) => ({
  id: 'user_bootstrapOwner', primary_email_address_id: 'email_primary',
  email_addresses: [{ id: 'email_primary', email_address: 'owner@example.test', verification: { status: 'verified' } }],
  last_sign_in_at: clock - 10_000, banned: false, locked: false, ...overrides,
});

function local(file) { return createClient({ url: 'file:' + file, intMode: 'number' }); }
async function fixture({ initialized = false, owner = null, seed, onFetch, users = [providerUser()], fetchError } = {}) {
  const file = path.join(folder, `${++serial}.db`);
  const client = local(file);
  try {
    if (initialized) await initializeDatabase(client);
    if (owner) await client.execute({ sql: "INSERT INTO store_owner(key,user_id) VALUES('owner',?)", args: [owner] });
    if (seed) await seed(client);
  } finally { client.close(); }
  const requests = [];
  let factories = 0;
  const options = {
    environment: environment(), now: () => clock,
    clientFactory() { factories++; return local(file); },
    async fetcher(input, init = {}) {
      requests.push({ input, init });
      const url = new URL(input);
      assert.equal(url.origin, 'https://api.clerk.com');
      assert.equal(url.pathname, '/v1/users');
      assert.equal(init.method ?? 'GET', 'GET');
      assert.equal(url.searchParams.get('email_address'), 'owner@example.test');
      assert.equal(url.searchParams.get('limit'), '2');
      assert.equal(new Headers(init.headers).get('authorization'), 'Bearer ' + syntheticSecret);
      if (onFetch) {
        const concurrent = local(file);
        try { await onFetch(concurrent); } finally { concurrent.close(); }
      }
      if (fetchError) throw fetchError;
      return Response.json(users);
    },
  };
  return {
    file, options, requests,
    get factories() { return factories; },
    async inspect(fn) { const reader = local(file); try { return await fn(reader); } finally { reader.close(); } },
  };
}
async function ownerId(f) {
  return f.inspect(async reader => {
    const rows = await reader.execute("SELECT user_id FROM store_owner WHERE key='owner'");
    return rows.rows[0]?.user_id ?? null;
  });
}
async function catalogNames(f) {
  return f.inspect(async reader => (await reader.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).rows.map(row => row.name));
}
async function check(label, fn) { await fn(); scenarios++; console.log('PASS ' + label); }
async function rejectOrPending(f) {
  let response;
  try { response = await provisionDeployment(f.options); }
  catch (error) {
    assert.doesNotMatch(String(error), new RegExp(syntheticSecret + '|' + syntheticToken));
    assert.doesNotMatch(String(error), /private-provider-diagnostic/);
    return;
  }
  assert.equal(response.status, 'ready');
  assert.equal(response.owner, 'pending-verification');
}

try {
  await check('local, preview and unrelated deployments do not touch any service', async () => {
    for (const patch of [
      { VERCEL: undefined }, { VERCEL: '0' }, { VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'development' },
      { STORE_SITE_MODE: 'live' }, { STORE_SITE_MODE: '' }, { STORE_SITE_MODE: 'unknown' },
      { NEXT_PUBLIC_SITE_URL: 'https://other.example.test' }, { NEXT_PUBLIC_SITE_URL: canonical + '/other' },
      { NEXT_PUBLIC_SITE_URL: 'http://street-label-shop.vercel.app' },
    ]) {
      const f = await fixture(); Object.assign(f.options.environment, patch);
      const result = await provisionDeployment(f.options);
      assert.equal(result.status, 'skipped');
      assert.equal(f.factories, 0); assert.equal(f.requests.length, 0);
      assert.deepEqual(await catalogNames(f), []);
    }
  });

  await check('missing or incompatible login configuration fails before any service is touched', async () => {
    for (const patch of [
      { OWNER_BOOTSTRAP_EMAIL: '' }, { CLERK_SECRET_KEY: undefined },
      { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: undefined },
      { CLERK_SECRET_KEY: 'sk_live_SYNTHETIC_NEVER_REAL' },
    ]) {
      const f = await fixture(); Object.assign(f.options.environment, patch);
      await assert.rejects(() => provisionDeployment(f.options));
      assert.equal(f.factories, 0); assert.equal(f.requests.length, 0);
      assert.deepEqual(await catalogNames(f), []);
    }
  });

  await check('verified existing Clerk login initializes an empty database and pins that identity', async () => {
    const f = await fixture();
    assert.deepEqual(await provisionDeployment(f.options), { status: 'ready', database: 'initialized', owner: 'registered' });
    assert.equal(await ownerId(f), 'clerk:user_bootstrapOwner');
    assert.equal(f.requests.length, 1);
    await f.inspect(async reader => {
      for (const table of [...tables, ...extraTables].filter(name => name !== 'store_owner')) {
        assert.equal(Number((await reader.execute(`SELECT count(*) AS n FROM "${table}"`)).rows[0].n), 0);
      }
    });
  });

  await check('the committed test mode applies only when the environment override is absent', async () => {
    const f = await fixture(); delete f.options.environment.STORE_SITE_MODE;
    const result = await provisionDeployment(f.options);
    assert.equal(result.status, 'ready'); assert.equal(result.owner, 'registered');
  });

  await check('repeat deployment is idempotent and never rechecks or reassigns an owner', async () => {
    const f = await fixture({ initialized: true, owner: 'legacy-pinned-owner' });
    const before = await catalogNames(f);
    assert.deepEqual(await provisionDeployment(f.options), { status: 'ready', database: 'existing', owner: 'existing' });
    assert.equal(await ownerId(f), 'legacy-pinned-owner');
    assert.deepEqual(await catalogNames(f), before);
    assert.equal(f.requests.length, 0);
  });

  await check('a matching initialized database with every application table empty can register the owner', async () => {
    const f = await fixture({ initialized: true });
    const result = await provisionDeployment(f.options);
    assert.equal(result.database, 'existing'); assert.equal(result.owner, 'registered');
    assert.equal(await ownerId(f), 'clerk:user_bootstrapOwner');
  });

  await check('partial schemas and modified migration history are refused without alteration', async () => {
    for (const kind of ['partial', 'ledger', 'missing-table']) {
      const f = await fixture({ initialized: kind !== 'partial', seed: async client => {
        if (kind === 'partial') await client.execute('CREATE TABLE original_data(value TEXT)');
        else if (kind === 'ledger') await client.execute("UPDATE store_migration_ledger SET sha256='unrelated-checkout'");
        else await client.execute('ALTER TABLE shop_customers RENAME TO original_customer_data');
      } });
      const before = await catalogNames(f);
      await assert.rejects(() => provisionDeployment(f.options));
      assert.deepEqual(await catalogNames(f), before); assert.equal(f.requests.length, 0);
      if (kind === 'ledger') {
        assert.equal(await ownerId(f), null);
        await f.inspect(async client => assert.equal((await client.execute('SELECT DISTINCT sha256 FROM store_migration_ledger')).rows[0].sha256, 'unrelated-checkout'));
      }
    }
  });

  await check('an unowned database containing shop data is never claimed', async () => {
    for (const seed of [
      client => client.execute({ sql: 'INSERT INTO shop_customers(user_id,email,name,phone,consent_version,created_at) VALUES(?,?,?,?,?,?)', args: ['original-member','original@example.test','Original','01000000000',0,'2026-10-01T00:00:00Z'] }),
      client => client.execute({ sql: 'INSERT INTO store_content(key,data,revision,updated_at) VALUES(?,?,?,?)', args: ['main','{}',0,'2026-10-01T00:00:00Z'] }),
      client => client.execute({ sql: 'INSERT INTO auth_identity_links(provider_user_id,legacy_user_id,verified_at) VALUES(?,?,?)', args: ['user_original','legacy-original','2026-10-01T00:00:00Z'] }),
    ]) {
      const f = await fixture({ initialized: true, seed });
      await assert.rejects(() => provisionDeployment(f.options));
      assert.equal(await ownerId(f), null); assert.equal(f.requests.length, 0);
    }
  });

  await check('missing, ambiguous and different-primary-email accounts cannot become administrator', async () => {
    const ambiguous = providerUser({ id: 'user_duplicate' });
    const secondaryOnly = providerUser({
      primary_email_address_id: 'email_other', email_addresses: [
        { id: 'email_primary', email_address: 'owner@example.test', verification: { status: 'verified' } },
        { id: 'email_other', email_address: 'different@example.test', verification: { status: 'verified' } },
      ],
    });
    for (const users of [[], [providerUser(), ambiguous], [secondaryOnly], [providerUser({ primary_email_address_id: 'missing' })]]) {
      const f = await fixture({ users }); await rejectOrPending(f);
      assert.equal(await ownerId(f), null);
    }
  });

  await check('unverified, banned, locked and accounts without a genuine past login are refused', async () => {
    for (const overrides of [
      { email_addresses: [{ id: 'email_primary', email_address: 'owner@example.test', verification: { status: 'unverified' } }] },
      { banned: true }, { locked: true }, { last_sign_in_at: null }, { last_sign_in_at: 0 },
      { last_sign_in_at: -1 }, { last_sign_in_at: clock + 60_000 }, { last_sign_in_at: String(clock - 1000) },
      { id: 'wrong-provider-id' },
    ]) {
      const f = await fixture({ users: [providerUser(overrides)] }); await rejectOrPending(f);
      assert.equal(await ownerId(f), null);
    }
  });

  await check('a concurrent owner is preserved after the provider lookup', async () => {
    const f = await fixture({ initialized: true, onFetch: async client => {
      await client.execute({ sql: "INSERT INTO store_owner(key,user_id) VALUES('owner',?)", args: ['concurrent-pinned-owner'] });
    } });
    try { await provisionDeployment(f.options); } catch { /* A conflict may fail the build, but never replace the existing owner. */ }
    assert.equal(await ownerId(f), 'concurrent-pinned-owner');
  });

  await check('a concurrent member write prevents owner registration without losing that member', async () => {
    const f = await fixture({ initialized: true, onFetch: async client => {
      await client.execute({ sql: 'INSERT INTO shop_customers(user_id,email,name,phone,consent_version,created_at) VALUES(?,?,?,?,?,?)', args: ['concurrent-member','member@example.test','KEEP','01000000000',0,'2026-10-01T00:00:00Z'] });
    } });
    await assert.rejects(() => provisionDeployment(f.options));
    assert.equal(await ownerId(f), null);
    await f.inspect(async client => assert.equal((await client.execute("SELECT name FROM shop_customers WHERE user_id='concurrent-member'")).rows[0].name, 'KEEP'));
  });

  await check('remote provider diagnostics and credentials are absent from results and errors', async () => {
    const f = await fixture({ fetchError: Error(`private-provider-diagnostic ${syntheticSecret} ${syntheticToken}`) });
    let output;
    try { output = JSON.stringify(await provisionDeployment(f.options)); } catch (error) { output = String(error); }
    assert.doesNotMatch(output, /private-provider-diagnostic|SYNTHETIC_NEVER_REAL/);
    assert.equal(await ownerId(f), null);
  });

  await check('database connection failures expose neither credentials nor provider diagnostics', async () => {
    const f = await fixture();
    f.options.clientFactory = () => { throw Error(`private-provider-diagnostic ${syntheticSecret} ${syntheticToken}`); };
    let failure;
    try { await provisionDeployment(f.options); } catch (error) { failure = error; }
    assert.ok(failure instanceof Error);
    assert.doesNotMatch(String(failure), /private-provider-diagnostic|SYNTHETIC_NEVER_REAL/);
    assert.deepEqual(await catalogNames(f), []); assert.equal(f.requests.length, 0);
  });

  await check('a table created between inspection and schema initialization is never overwritten', async () => {
    const f = await fixture();
    f.options.clientFactory = () => {
      const client = local(f.file);
      let injected = false;
      return new Proxy(client, { get(target, property) {
        if (property === 'batch') return async (...args) => {
          if (!injected) {
            injected = true;
            const concurrent = local(f.file);
            try {
              await concurrent.execute('CREATE TABLE concurrent_original(value TEXT)');
              await concurrent.execute("INSERT INTO concurrent_original(value) VALUES('KEEP')");
            }
            finally { concurrent.close(); }
          }
          return target.batch(...args);
        };
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
    };
    await assert.rejects(() => provisionDeployment(f.options));
    assert.deepEqual(await catalogNames(f), ['concurrent_original']); assert.equal(f.requests.length, 0);
    await f.inspect(async client => assert.equal((await client.execute('SELECT value FROM concurrent_original')).rows[0].value, 'KEEP'));
  });

  console.log(`Provisioning: ${scenarios} isolated scenarios passed. No live accounts, credentials, or databases used.`);
} finally {
  globalThis.fetch = realFetch;
  await fs.rm(folder, { recursive: true, force: true });
}

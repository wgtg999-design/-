// Public prototype fallbacks against real isolated SQLite and original
// parsing/authentication code. No production DB, R2, Clerk or network calls.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

const base = path.resolve(__dirname, '..');
const repository = path.resolve(base, '../..');
const names = ['STORE_SITE_MODE', 'TURSO_DATABASE_URL', 'TURSO_URL', 'TURSO_AUTH_TOKEN', 'TURSO_TOKEN', 'TURSO_DATABASE_AUTH_TOKEN', 'TURSO_DATABASE_TOKEN'];
const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
const sentinel = 'provider-private-token private-user@example.test libsql://private.example.test';
let fixture, statements = [], forbidden = [], probeCalls = 0, identityCalls = 0, connectionFailure = false;
let checks = 0;

const database = {
  prepare(sql) {
    if (!/^\s*SELECT\b/i.test(sql) || /;\s*\S/.test(sql)) {
      forbidden.push(sql); throw Error('Only a single read is permitted.');
    }
    let values = [];
    return {
      bind(...input) { values = input; return this; },
      async first(column) {
        statements.push(sql);
        if (connectionFailure) throw Error(sentinel);
        const row = fixture.prepare(sql).get(...values) || null;
        return column === undefined ? row : row?.[column] ?? null;
      },
      async all() {
        statements.push(sql);
        if (connectionFailure) throw Error(sentinel);
        return { results: fixture.prepare(sql).all(...values) };
      },
      async run() { forbidden.push('run'); throw Error('No writes are permitted.'); },
    };
  },
  async batch() { forbidden.push('batch'); throw Error('No writes are permitted.'); },
};
const env = { get DB() { return database; }, get OWNER_BOOTSTRAP_EMAIL() { return undefined; } };
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const localRequire = id => {
    if (id === 'cloudflare:workers') return { env };
    if (id.includes('chatgpt-auth')) return { getChatGPTUser: async () => { identityCalls++; return null; } };
    if (id === './database') return { getDatabase: () => { probeCalls++; return database; } };
    if (id === '../lib/content' || id === '../lib/store' || id === '../lib/commerce') return load(path.join(repository, id.slice(3) + '.ts'));
    if (file.includes('/templates/api/')) {
      if (id === '../../../runtime/test-catalog') return load(path.join(base, 'runtime/test-catalog.ts'));
      if (id === '../../../lib/commerce') return load(path.join(repository, 'lib/commerce.ts'));
    }
    if (id.endsWith('.json')) return require(path.resolve(path.dirname(file), id));
    if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id + '.ts'));
    if (/clerk|aws-sdk|libsql/.test(id)) { forbidden.push(id); throw Error('No provider SDK is permitted in these tests.'); }
    return require(id);
  };
  vm.runInThisContext('(function(require,module,exports){' + code + '})', { filename: file })(localRequire, module, module.exports);
  cache.set(file, module.exports);
  return module.exports;
}
function reset({ mode = 'test', env: input = {}, tables = false } = {}) {
  fixture?.close(); fixture = new DatabaseSync(':memory:');
  for (const name of names) delete process.env[name];
  if (mode !== null) process.env.STORE_SITE_MODE = mode;
  Object.assign(process.env, input);
  statements = []; forbidden = []; probeCalls = 0; identityCalls = 0; connectionFailure = false;
  if (tables) fixture.exec(`
    CREATE TABLE store_content (key TEXT PRIMARY KEY, data TEXT, revision INTEGER, updated_at TEXT);
    CREATE TABLE shop_settings (key TEXT PRIMARY KEY, data TEXT, revision INTEGER);
    CREATE TABLE shop_inventory (sku TEXT PRIMARY KEY, stock INTEGER, max_order INTEGER, enabled INTEGER);
  `);
}
function snapshot() {
  return fixture.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name").all().map(
    row => ({ name: row.name, rows: fixture.prepare('SELECT * FROM "' + row.name + '"').all() }),
  );
}
async function read(responsePromise, expectedStatus) {
  const before = snapshot();
  const response = await responsePromise;
  assert.equal(response.status, expectedStatus);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  const data = await response.json();
  assert(!JSON.stringify(data).includes('provider-private-token'));
  assert(!JSON.stringify(data).includes('private-user@example.test'));
  assert.deepEqual(snapshot(), before, 'The gateway must never create or overwrite tables or rows.');
  assert.deepEqual(forbidden, []); checks++;
  return data;
}

(async () => {
  const { defaults } = load(path.join(repository, 'lib/content.ts'));
  const { getDefaultShopSettings } = load(path.join(base, 'runtime/test-site.ts'));
  const { publicContent, publicShop, createTestCatalogGateway } = load(path.join(base, 'runtime/test-catalog.ts'));
  const contentRoute = load(path.join(base, 'templates/api/content/route.ts'));
  const shopRoute = load(path.join(base, 'templates/api/shop/route.ts'));
  const commerce = load(path.join(repository, 'lib/commerce.ts'));
  const valid = { TURSO_DATABASE_URL: 'libsql://fixture.example.test', TURSO_AUTH_TOKEN: 'fixture-token' };
  const variants = [
    {},
    { TURSO_URL: ' ', TURSO_DATABASE_AUTH_TOKEN: '' },
    valid,
    { TURSO_URL: 'libsql://fixture.example.test', TURSO_TOKEN: 'fixture-token' },
    { TURSO_URL: 'libsql://fixture.example.test', TURSO_DATABASE_AUTH_TOKEN: 'fixture-token' },
    { TURSO_URL: 'libsql://fixture.example.test', TURSO_DATABASE_TOKEN: 'fixture-token' },
  ];
  for (const configuration of variants) {
    reset({ env: configuration });
    const expectedSource = Object.values(configuration).some(value => value.trim()) ? 'test-empty-database' : 'test-unconfigured-database';
    const content = await read(contentRoute.GET(), 200);
    assert.deepEqual(content.content, defaults); assert.equal(content.content.products.length, 4);
    assert.equal(content.revision, 0); assert.equal(content.updatedAt, null);
    assert.equal(content.testOnly, true); assert.equal(content.source, expectedSource);
    const settings = await read(shopRoute.GET(new Request('https://shop.example.test/api/shop?view=settings')), 200);
    assert.deepEqual(settings.settings, getDefaultShopSettings()); assert.equal(settings.settings.accepting, false);
    assert.equal(settings.revision, 0); assert.equal(settings.source, expectedSource); assert.equal(settings.testOnly, true);
    const stock = await read(shopRoute.GET(new Request('https://shop.example.test/api/shop?view=stock')), 200);
    assert.deepEqual(stock.inventory, []); assert.equal(stock.source, expectedSource); assert.equal(stock.testOnly, true);
    assert.equal(identityCalls, 0, 'Public prototype GET must never bootstrap an owner or sign in a user.');
    assert.equal(probeCalls, expectedSource === 'test-empty-database' ? 3 : 0);
  }

  for (const mode of ['live', 'unknown', '', 'TEST', 'test ', 'development']) {
    for (const configuration of [{}, valid]) {
      reset({ mode, env: configuration });
      for (const response of [publicContent(), publicShop('settings'), publicShop('stock')]) {
        const data = await read(response, 503); assert.deepEqual(Object.keys(data), ['error']);
      }
      assert.equal(probeCalls, 0, 'Live/unknown modes may not probe for a demo fallback.');
    }
  }
  reset({ mode: null });
  assert.equal((await read(publicContent(), 200)).testOnly, true, 'The committed explicit test mode is the only absent-env default.');

  for (const configuration of [
    { TURSO_DATABASE_URL: valid.TURSO_DATABASE_URL },
    { TURSO_URL: valid.TURSO_DATABASE_URL },
    { TURSO_AUTH_TOKEN: valid.TURSO_AUTH_TOKEN },
    { TURSO_TOKEN: valid.TURSO_AUTH_TOKEN },
    { TURSO_DATABASE_AUTH_TOKEN: valid.TURSO_AUTH_TOKEN },
    { TURSO_DATABASE_TOKEN: valid.TURSO_AUTH_TOKEN },
  ]) {
    reset({ env: configuration });
    for (const response of [publicContent(), publicShop('settings'), publicShop('stock')]) await read(response, 503);
    assert.equal(probeCalls, 0, 'Partial configuration must not be mistaken for an unconfigured DB.');
  }

  reset({ env: valid }); connectionFailure = true;
  for (const response of [publicContent(), publicShop('settings'), publicShop('stock')]) await read(response, 503);
  assert.equal(probeCalls, 3);

  for (const table of ['shop_customers', 'store_owner', 'shop_orders', 'unrelated_table']) {
    reset({ env: valid }); fixture.exec('CREATE TABLE ' + table + ' (id TEXT)');
    for (const response of [publicContent(), publicShop('settings'), publicShop('stock')]) await read(response, 503);
  }

  for (const mode of ['test', 'live', 'unknown']) {
    reset({ mode, env: valid, tables: true });
    const stored = structuredClone(defaults); stored.brand = 'Saved brand'; stored.products[0].visible = false;
    fixture.prepare('INSERT INTO store_content VALUES (?,?,?,?)').run('main', JSON.stringify(stored), 9, '2026-10-14T00:00:00Z');
    const storedSettings = { ...getDefaultShopSettings(), terms: 'Saved actual terms', privacy: 'Saved actual privacy' };
    fixture.prepare('INSERT INTO shop_settings VALUES (?,?,?)').run('main', JSON.stringify(storedSettings), 7);
    fixture.prepare('INSERT INTO shop_inventory VALUES (?,?,?,?)').run('jacket:S', 40, 3, 1);
    fixture.prepare('INSERT INTO shop_inventory VALUES (?,?,?,?)').run('shell:M', 8, 2, 1);
    const content = await read(publicContent(), 200);
    assert.equal(content.content.brand, 'Saved brand'); assert.equal(content.revision, 9);
    assert.equal(content.content.products.length, 3); assert(!content.content.products.some(product => product.id === 'jacket'));
    assert.equal(content.testOnly, undefined); assert.equal(content.source, undefined);
    const settings = await read(publicShop('settings'), 200);
    assert.deepEqual(settings, { settings: storedSettings, revision: 7 });
    const stock = await read(publicShop('stock'), 200);
    assert.deepEqual(stock.inventory, [{ sku: 'shell:M', stock: 8, maxOrder: 2, enabled: true }]);
    assert.equal(probeCalls, 0, 'Successfully loaded catalogue/settings always take precedence over prototype defaults.');
    assert.equal(identityCalls, 0);
  }

  for (const corrupt of ['{bad-json', JSON.stringify({ brand: 'Malformed content' })]) {
    reset({ env: valid, tables: true });
    fixture.prepare('INSERT INTO store_content VALUES (?,?,?,?)').run('main', corrupt, 9, '2026-10-14T00:00:00Z');
    await read(publicContent(), 503); await read(publicShop('stock'), 503);
  }
  reset({ env: valid, tables: true });
  fixture.prepare('INSERT INTO shop_settings VALUES (?,?,?)').run('main', '{bad-json', 4);
  await read(publicShop('settings'), 503);
  reset({ env: valid, tables: true }); fixture.exec('DROP TABLE shop_inventory');
  await read(publicShop('stock'), 503);

  // Private member/order access and all POST requests are the original
  // authentication path, even with a completely unconfigured test DB.
  reset();
  assert.equal(shopRoute.POST, commerce.shopPost);
  for (const query of ['', '?view=member', '?view=orders', '?view=unknown']) {
    const data = await read(shopRoute.GET(new Request('https://shop.example.test/api/shop' + query)), 401);
    assert.equal(data.error, '로그인이 필요합니다.'); assert.equal(data.testOnly, undefined);
  }
  for (const action of ['register', 'create', 'cancel']) {
    const request = new Request('https://shop.example.test/api/shop', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://shop.example.test' }, body: JSON.stringify({ action }),
    });
    const data = await read(shopRoute.POST(request), 401); assert.equal(data.testOnly, undefined);
  }
  assert.equal(identityCalls, 7); assert.equal(statements.length, 0); assert.equal(probeCalls, 0);
  assert.equal(contentRoute.POST, undefined, 'Content gateway exposes no mutation handler.');

  // A successful SQLite response with a missing/invalid count must close,
  // rather than letting a loosely coerced value grant prototype visibility.
  for (const row of [null, {}, { userTables: '0' }, { userTables: -1 }]) {
    const gateway = createTestCatalogGateway({
      testMode: () => true, environment: () => valid,
      database: () => ({ prepare: () => ({ first: async () => row }) }),
      readStore: async () => { throw Error(sentinel); },
      readSettings: async () => { throw Error(sentinel); },
      readStocks: async () => { throw Error(sentinel); }, defaultSettings: getDefaultShopSettings,
    });
    await read(gateway.content(), 503);
  }
  console.log(`PASS: ${checks} public test catalogue cases; real SQLite emptiness guards, original stored content/hidden stock precedence, live/configured-failure closure, authenticated private/POST delegation, no writes or provider calls.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  fixture?.close();
  for (const name of names) {
    if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name];
  }
});

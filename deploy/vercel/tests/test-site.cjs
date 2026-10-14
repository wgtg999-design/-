// Explicit test policy behavior against an isolated database. No production
// DB, Clerk, R2, credentials, registrations, or owner bootstrap is touched.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

const base = path.resolve(__dirname, '..');
const initialMode = process.env.STORE_SITE_MODE;
const fixture = new DatabaseSync(':memory:');
fixture.exec('CREATE TABLE shop_settings (key TEXT PRIMARY KEY, data TEXT NOT NULL, revision INTEGER NOT NULL)');
let databaseFailure = false;
let queries = [];
let checks = 0;
const database = {
  prepare(sql) {
    assert(/^SELECT\b/i.test(sql), 'Public policies may read but never change stored settings.');
    queries.push(sql);
    return {
      bind(key) { this.key = key; return this; },
      async first() {
        if (databaseFailure) throw Error('private-secret-token private-owner@example.test');
        return fixture.prepare(sql).get(this.key) || null;
      },
    };
  },
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
    if (id === './database') return { getDatabase: () => database };
    if (id.endsWith('.json')) return require(path.resolve(path.dirname(file), id));
    if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id + '.ts'));
    throw Error('Unexpected external dependency: ' + id);
  };
  vm.runInThisContext('(function(require,module,exports){' + code + '})', { filename: file })(localRequire, module, module.exports);
  cache.set(file, module.exports);
  return module.exports;
}
function mode(value) {
  if (value === undefined) delete process.env.STORE_SITE_MODE;
  else process.env.STORE_SITE_MODE = value;
}
function settings(value) {
  fixture.prepare('DELETE FROM shop_settings').run();
  if (value !== null) fixture.prepare('INSERT INTO shop_settings VALUES (?,?,?)').run('main', typeof value === 'string' ? value : JSON.stringify(value), 8);
}
function snapshot() { return fixture.prepare('SELECT * FROM shop_settings').all(); }

(async () => {
  const { isTestSite, getDefaultShopSettings, normalizeShopSettingsForMode } = load(path.join(base, 'runtime/test-site.ts'));
  const { TEST_TERMS, TEST_PRIVACY } = load(path.join(base, 'runtime/test-policies.ts'));
  const { getPolicyDocument, policyPage, policyLinks } = load(path.join(base, 'runtime/policy-pages.ts'));

  mode(undefined);
  assert.equal(require(path.join(base, 'site-mode.json')).mode, 'test');
  assert.equal(isTestSite(), true);
  const defaults = getDefaultShopSettings();
  assert.deepEqual(Object.keys(defaults).sort(), ['accepting', 'shippingFee', 'bankInfo', 'support', 'terms', 'privacy', 'returnGuide'].sort());
  assert.equal(defaults.accepting, false); assert.equal(defaults.bankInfo, '');
  assert.equal(defaults.terms, TEST_TERMS); assert.equal(defaults.privacy, TEST_PRIVACY);
  assert(TEST_TERMS.length <= 15000 && TEST_PRIVACY.length <= 15000, 'Test defaults fit the existing server validation limits.');
  assert(TEST_TERMS.includes('테스트용·미등록') && TEST_TERMS.includes('support@example.invalid'));
  assert(TEST_PRIVACY.includes('Clerk') && TEST_PRIVACY.includes('sessionStorage'));
  checks++;

  for (const value of ['live', '', 'TEST', 'test ', 'unknown', 'development']) {
    mode(value); assert.equal(isTestSite(), false);
    const valueDefaults = getDefaultShopSettings();
    assert.equal(valueDefaults.terms, ''); assert.equal(valueDefaults.privacy, '');
    assert.equal(valueDefaults.accepting, false);
    assert.equal((await policyLinks()).status, 503, 'No test DTO while live/unknown policies are absent.');
    checks++;
  }
  mode('test'); assert.equal(isTestSite(), true); checks++;
  const mutated = getDefaultShopSettings(); mutated.accepting = true; mutated.terms = '';
  assert.equal(getDefaultShopSettings().accepting, false); assert.equal(getDefaultShopSettings().terms, TEST_TERMS);
  checks++;
  const stored = { ...defaults, accepting: true };
  const beforeStored = structuredClone(stored);
  assert.equal(normalizeShopSettingsForMode(stored).accepting, false);
  assert.deepEqual(stored, beforeStored, 'Response constraints do not rewrite stored records.');
  for (const value of ['live', 'unknown']) {
    mode(value);
    const sanitized = normalizeShopSettingsForMode(stored);
    assert.equal(sanitized.terms, ''); assert.equal(sanitized.privacy, ''); assert.equal(sanitized.accepting, false);
    settings(stored);
    assert.equal((await policyPage('terms')).status, 503, 'A saved test document cannot serve as operating policy.');
    assert.equal((await policyPage('privacy')).status, 503);
    const real = { ...stored, terms: 'Operator reviewed terms', privacy: 'Operator reviewed privacy' };
    assert.deepEqual(normalizeShopSettingsForMode(real), real, 'Non-fixture saved operator policies remain intact.');
    assert.deepEqual(stored, beforeStored); checks++;
  }
  mode('live');
  for (const value of [TEST_TERMS.replaceAll('\n', '\r\n'), TEST_TERMS.replace('테스트 운영자', '시험 담당자'), '  \n' + TEST_TERMS, '# ' + TEST_TERMS, '### ' + TEST_PRIVACY]) {
    assert.equal(normalizeShopSettingsForMode({ ...stored, terms: value }).terms, '', 'Formatting or fixture edits do not make test terms an operating policy.');
    checks++;
  }
  mode('test');

  settings(null); databaseFailure = true;
  for (const kind of ['terms', 'privacy']) {
    const before = snapshot();
    const response = await policyPage(kind);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
    const html = await response.text();
    assert(html.includes('테스트 전용') && html.includes('실제 판매·결제·배송'));
    assert(!html.includes('private-secret-token') && !html.includes('private-owner@example.test'));
    assert(!/<script\b/.test(html));
    assert.deepEqual(snapshot(), before); checks++;
  }
  mode('live');
  const failed = await policyPage('privacy'); assert.equal(failed.status, 503);
  const failedHtml = await failed.text();
  assert(!failedHtml.includes(TEST_PRIVACY) && !failedHtml.includes('private-secret-token'));
  checks++;

  databaseFailure = false;
  for (const modeValue of ['test', 'live', 'unknown']) {
    mode(modeValue);
    settings({ terms: 'Saved operator terms <script>alert(1)</script>', privacy: 'Saved operator privacy & notice' });
    const before = snapshot();
    for (const kind of ['terms', 'privacy']) {
      const doc = await getPolicyDocument(kind); assert.equal(doc.available, true);
      assert(doc.text.startsWith('Saved operator'));
      const response = await policyPage(kind); assert.equal(response.status, 200);
      const html = await response.text(); assert(!html.includes('<script>alert(1)</script>'));
      if (kind === 'terms') assert(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
      assert.deepEqual(snapshot(), before); checks++;
    }
  }
  mode('test');
  for (const malformed of ['{bad-json', { terms: '', privacy: '' }, { terms: '  ', privacy: 12 }, { terms: 'x'.repeat(15001), privacy: 'x'.repeat(15001) }]) {
    settings(malformed);
    const before = snapshot();
    for (const kind of ['terms', 'privacy']) {
      const response = await policyPage(kind); assert.equal(response.status, 503);
      assert.deepEqual(snapshot(), before); checks++;
    }
  }
  settings(null);
  for (const value of ['live', 'unknown']) {
    mode(value);
    for (const kind of ['terms', 'privacy']) {
      assert.equal((await getPolicyDocument(kind)).available, false); checks++;
    }
  }
  mode('test');
  const dtoResponse = await policyLinks();
  assert.equal(dtoResponse.headers.get('cache-control'), 'no-store');
  const dto = await dtoResponse.json();
  assert.equal(dto.business.operator, '테스트 운영자');
  assert.equal(dto.business.registrationNumber, '테스트용·미등록');
  assert.equal(dto.testOnly, true); assert.equal(dto.source, 'test-defaults');
  assert.equal(dto.terms, '/policies/terms'); assert.equal(dto.privacy, '/policies/privacy');
  assert(!JSON.stringify(dto).includes('private-owner@example.test')); checks++;
  assert(queries.every(sql => /^SELECT\b/i.test(sql)));
  console.log(`PASS: ${checks} explicit test-mode policy cases; live/unknown closed defaults, stored policy precedence, escaped public HTML, read-only fixture data, no provider calls and no credentials.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  fixture.close();
  if (initialMode === undefined) delete process.env.STORE_SITE_MODE;
  else process.env.STORE_SITE_MODE = initialMode;
});

// Synthetic provider metadata only. Never contacts Clerk or creates records.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../runtime/auth-environment.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + code + '})')(id => id.endsWith('auth-config')
  ? { authConfigured: () => false, getClerkPublishableKey: () => undefined }
  : { isTestSite: () => false }, loaded, loaded.exports);
const { createAuthEnvironmentDiagnostic } = loaded.exports;
const secret = 'sk_test_synthetic-no-provider';
const host = 'fixture.clerk.accounts.dev';
let checks = 0;
async function scenario({ testMode = true, configured = true, metadata = {}, domains, failing = false } = {}) {
  const calls = [];
  const diagnostic = createAuthEnvironmentDiagnostic({
    testMode: () => testMode, configured: () => configured,
    secretKey: () => secret, publicKey: () => 'pk_test_' + Buffer.from(host + '$').toString('base64'),
    request: async (url, options) => {
      calls.push(url);
      assert(['https://api.clerk.com/v1/instance', 'https://api.clerk.com/v1/domains'].includes(url));
      assert.equal(options.method, 'GET'); assert.equal(options.body, undefined);
      assert.equal(options.headers.Authorization, 'Bearer ' + secret);
      assert.equal(options.redirect, 'error');
      if (failing) throw Error('Sensitive provider details: ' + secret);
      return Response.json(url.endsWith('/instance')
        ? { id: 'ins_SyntheticDevelopment', environment_type: 'development', private_owner: 'private@example.test', ...metadata }
        : domains ?? { data: [{ frontend_api_url: 'https://' + host, private_field: secret }] });
    },
  });
  const response = await diagnostic();
  const value = await response.json();
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert(!JSON.stringify(value).includes(secret)); assert(!JSON.stringify(value).includes('private@example.test'));
  checks++;
  return { response, value, calls, diagnostic };
}
(async () => {
  for (const state of [{ testMode: false }, { configured: false }]) {
    const result = await scenario(state); assert.equal(result.response.status, 503); assert.equal(result.calls.length, 0);
  }
  const ready = await scenario();
  assert.deepEqual(ready.value, { instanceId: 'ins_SyntheticDevelopment', environment: 'development', frontendMatchesSecret: true });
  await Promise.all([ready.diagnostic(), ready.diagnostic()]);
  assert.equal(ready.calls.length, 2, 'Repeated requests use only cached safe metadata'); checks++;
  const mismatch = await scenario({ domains: { data: [{ frontend_api_url: 'https://other.clerk.accounts.dev' }] } });
  assert.equal(mismatch.value.frontendMatchesSecret, false);
  const array = await scenario({ domains: [{ frontend_api_url: 'https://' + host }] });
  assert.equal(array.value.frontendMatchesSecret, true);
  for (const options of [{ failing: true }, { metadata: { id: 'unsafe/id?value' } }, { metadata: { environment_type: 'unknown' } }, { domains: { unexpected: [] } }]) {
    assert.equal((await scenario(options)).response.status, 503);
  }
  console.log(`PASS: ${checks} test-only auth-environment diagnostics; fixed GET destinations, no users/session/DB writes, metadata cache and no credential/identity leakage.`);
})().catch(error => { console.error(error); process.exitCode = 1; });

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const crypto = require('node:crypto');
const JPEG = Uint8Array.from([255, 216, 255, 0]);
const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const WEBP = Uint8Array.from(Buffer.from('RIFF0000WEBP0'));
const MAX = 8 * 1024 * 1024;
const headers = { 'content-type': 'application/json', origin: 'https://store.test' };
const request = body => new Request('https://store.test/api/admin/upload', { method: 'POST', headers, body: JSON.stringify(body) });
let count = 0;
async function check(name, run) { await run(); count++; console.log(`PASS ${name}`); }

function load(file, imports) {
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require: name => Object.hasOwn(imports, name) ? imports[name] : require(name), Buffer, TextDecoder, Uint8Array, Request, Response, Date, process }, { filename: file });
  return module.exports;
}
class PutObjectCommand { constructor(input) { this.input = input; } }
class GetObjectCommand { constructor(input) { this.input = input; } }
class HeadObjectCommand { constructor(input) { this.input = input; } }
class DeleteObjectCommand { constructor(input) { this.input = input; } }
const storage = load('runtime/storage.ts', {
  '@aws-sdk/client-s3': { PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, S3Client: class {} },
  '@aws-sdk/s3-request-presigner': { getSignedUrl: async () => 'unused' }
});
const imports = {
  './database': { getDatabase: () => { throw Error('Do not use production DB'); } },
  './storage': storage,
  '../app/chatgpt-auth': { getChatGPTUser: async () => null },
  '../lib/admin': {
    guard: async () => new Response('', { status: 403 }),
    noCache: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    limitedBody: async (req, max) => { const bytes = new Uint8Array(await req.arrayBuffer()); if (bytes.length > max) throw Error('파일 또는 데이터가 너무 큽니다.'); return bytes; }
  }
};
const { createUploadHandler } = load('runtime/uploads.ts', imports);

function fixture() {
  const tickets = new Map();
  const objects = new Map();
  const puts = [];
  const deletes = [];
  let clock = 100000;
  let identity = 'owner-a';
  let failPut = false, failComplete = false, failGet = false, failPresign = false;
  let onGet = null;
  const db = { prepare(sql) {
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { const row = tickets.get(args[0]); return row ? { ...row } : null; },
      async run() {
        let changes = 0;
        if (sql.startsWith('INSERT')) {
          const [id, user_id, object_key, content_type, byte_length, expires_at, status] = args;
          if (tickets.has(id)) throw Error('Duplicate');
          tickets.set(id, { id, user_id, object_key, content_type, byte_length, expires_at, status, final_key: null }); changes = 1;
        } else if (sql.includes("status = 'complete'")) {
          if (failComplete) { failComplete = false; throw Error('DB secret=private'); }
          const [final, id, user] = args; const row = tickets.get(id);
          if (row && row.user_id === user && row.status === 'processing') { row.status = 'complete'; row.final_key = final; changes = 1; }
        } else if (sql.includes("SET status = 'processing'")) {
          const [id, user, now] = args; const row = tickets.get(id);
          if (row && row.user_id === user && row.status === 'pending' && row.expires_at > now) { row.status = 'processing'; changes = 1; }
        } else if (sql.includes("SET status = 'rejected'")) {
          const [id, user] = args; const row = tickets.get(id); const status = sql.includes("status = 'pending'") ? 'pending' : 'processing';
          if (row && row.status === status && (user === undefined || row.user_id === user)) { row.status = 'rejected'; changes = 1; }
        } else if (sql.includes("SET status = 'pending'")) {
          const [id, user] = args; const row = tickets.get(id);
          if (row && row.user_id === user && row.status === 'processing') { row.status = 'pending'; changes = 1; }
        } else throw Error(`Unhandled SQL ${sql}`);
        return { meta: { changes } };
      }
    };
  } };
  const bucket = {
    async get(key) {
      if (failGet) throw Error('S3 endpoint secret=private');
      const object = objects.get(key);
      const copy = object ? { body: new Uint8Array(object.body), httpMetadata: { ...object.httpMetadata } } : null;
      if (onGet) await onGet(key);
      return copy;
    },
    async put(key, bytes, options) {
      if (failPut) { failPut = false; throw Error('S3 secret=private'); }
      puts.push({ key, bytes: new Uint8Array(bytes), contentType: options.httpMetadata.contentType });
      objects.set(key, { body: new Uint8Array(bytes), httpMetadata: { ...options.httpMetadata } });
    },
    async delete(key) { deletes.push(key); objects.delete(key); },
    async presignPut(key, type, size) { if (failPresign) throw Error('S3 signing private'); return `https://private-r2.test/${key}?signed-type=${type}&signed-size=${size}`; }
  };
  const handler = createUploadHandler({ database: () => db, bucket: () => bucket, ownerGuard: async req => identity && req.headers.get('origin') === new URL(req.url).origin ? null : new Response('', { status: 403 }), user: async () => identity ? { userId: identity } : null, secret: () => 'testing-secret-never-production-123456789', now: () => clock, uuid: crypto.randomUUID });
  return {
    handler, tickets, objects, puts, deletes,
    set user(value) { identity = value; },
    set clock(value) { clock = value; },
    set failPut(value) { failPut = value; },
    set failComplete(value) { failComplete = value; },
    set failGet(value) { failGet = value; },
    set failPresign(value) { failPresign = value; },
    set onGet(value) { onGet = value; },
    async init(bytes = JPEG, type = 'image/jpeg') {
      const response = await handler(request({ action: 'init', contentType: type, size: bytes.length })); assert.equal(response.status, 200);
      const data = await response.json();
      const token = JSON.parse(Buffer.from(data.token.split('.')[0], 'base64url').toString());
      objects.set(token.key, { body: new Uint8Array(bytes), httpMetadata: { contentType: type } });
      return { data, token };
    },
    async finalize(token) { return handler(request({ action: 'finalize', token })); }
  };
}

(async () => {
  await check('owner and same-origin guard deny before storage access', async () => {
    const f = fixture(); f.user = null; assert.equal((await f.handler(request({ action: 'init', contentType: 'image/jpeg', size: 4 }))).status, 403); assert.equal(f.tickets.size, 0);
    f.user = 'owner-a'; const req = new Request('https://store.test/api/admin/upload', { method: 'POST', headers: { ...headers, origin: 'https://other.test' }, body: '{}' }); assert.equal((await f.handler(req)).status, 403); assert.equal(f.tickets.size, 0);
  });
  await check('init rejects unsupported types and invalid/over-limit size', async () => {
    const f = fixture(); for (const [contentType, size] of [['image/svg+xml', 4], ['image/jpeg', 0], ['image/jpeg', MAX + 1], ['image/png', 1.1], ['image/webp', '4']]) assert.equal((await f.handler(request({ action: 'init', contentType, size }))).status, 400); assert.equal(f.tickets.size, 0);
  });
  await check('init signs only private quarantine key and bounded expiry', async () => {
    const f = fixture(), { data, token } = await f.init(); assert.match(token.key, /^_uploads\/[a-f0-9]{24}\/[a-f0-9-]{36}$/); assert.equal(token.expires, 700000); assert.equal(data.contentType, 'image/jpeg'); assert.equal(data.url, undefined); assert.ok(!/\/media\//.test(data.uploadUrl));
  });
  for (const [bytes, type, extension] of [[JPEG, 'image/jpeg', 'jpg'], [PNG, 'image/png', 'png'], [WEBP, 'image/webp', 'webp']]) await check(`${type} finalized as immutable UUID.${extension} from verified bytes`, async () => {
    const f = fixture(), { data, token } = await f.init(bytes, type), response = await f.finalize(data.token); assert.equal(response.status, 200); const result = await response.json(); assert.equal(result.url, `/media/${token.id}.${extension}`); assert.equal(f.tickets.get(token.id).status, 'complete'); assert.equal(f.puts.length, 1); assert.deepEqual(Array.from(f.puts[0].bytes), Array.from(bytes)); assert.ok(!f.objects.has(token.key)); assert.equal(response.headers.get('cache-control'), 'no-store');
  });
  await check('exactly 8MB allowed and never crosses function body', async () => {
    const f = fixture(), image = new Uint8Array(MAX); image.set(JPEG); const { data } = await f.init(image); assert.equal((await f.finalize(data.token)).status, 200); assert.equal(f.puts[0].bytes.length, MAX);
  });
  await check('tampered malformed missing and oversized tokens rejected', async () => {
    const f = fixture(), { data } = await f.init(); for (const token of [null, 'x.y', data.token.slice(0, -2) + 'xx', 'x'.repeat(3000)]) assert.equal((await f.finalize(token)).status, 400); assert.equal(f.puts.length, 0);
  });
  await check('another administrator identity cannot finalize owner ticket', async () => {
    const f = fixture(), { data } = await f.init(); f.user = 'owner-b'; assert.equal((await f.finalize(data.token)).status, 403); assert.equal(f.puts.length, 0);
  });
  await check('single-use ledger prevents replay and duplicate writes', async () => {
    const f = fixture(), { data } = await f.init(); assert.equal((await f.finalize(data.token)).status, 200); assert.equal((await f.finalize(data.token)).status, 409); assert.equal(f.puts.length, 1);
  });
  await check('concurrent finalize has one successful compare-and-set claimant', async () => {
    const f = fixture(), { data } = await f.init(); const responses = await Promise.all([f.finalize(data.token), f.finalize(data.token)]); assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]); assert.equal(f.puts.length, 1);
  });
  await check('overwritten quarantine cannot change already validated final bytes', async () => {
    const f = fixture(), { data, token } = await f.init(); f.onGet = async key => { f.objects.set(key, { body: Uint8Array.from([1, 2, 3, 4]), httpMetadata: { contentType: 'image/jpeg' } }); }; assert.equal((await f.finalize(data.token)).status, 200); assert.deepEqual(Array.from(f.puts[0].bytes), Array.from(JPEG)); assert.equal(f.puts[0].key, `${token.id}.jpg`);
  });
  for (const [name, mutation] of [
    ['size mismatch', object => { object.body = Uint8Array.from([255, 216, 255, 0, 0]); }],
    ['MIME mismatch', object => { object.httpMetadata.contentType = 'text/html'; }],
    ['magic bytes mismatch', object => { object.body = Uint8Array.from([60, 104, 116, 109]); }],
    ['valid different format', object => { object.body = PNG; object.httpMetadata.contentType = 'image/png'; }]
  ]) await check(`${name} rejected and temporary object removed`, async () => {
    const f = fixture(), { data, token } = await f.init(); mutation(f.objects.get(token.key)); assert.equal((await f.finalize(data.token)).status, 400); assert.equal(f.tickets.get(token.id).status, 'rejected'); assert.equal(f.puts.length, 0); assert.ok(!f.objects.has(token.key));
  });
  await check('expired ticket fails closed and clears quarantine', async () => {
    const f = fixture(), { data, token } = await f.init(); f.clock = token.expires; assert.equal((await f.finalize(data.token)).status, 400); assert.equal(f.tickets.get(token.id).status, 'rejected'); assert.ok(!f.objects.has(token.key)); assert.equal(f.puts.length, 0);
  });
  await check('transient missing object releases ticket for safe retry', async () => {
    const f = fixture(), { data, token } = await f.init(); f.objects.delete(token.key); assert.equal((await f.finalize(data.token)).status, 400); assert.equal(f.tickets.get(token.id).status, 'pending'); f.objects.set(token.key, { body: JPEG, httpMetadata: { contentType: 'image/jpeg' } }); assert.equal((await f.finalize(data.token)).status, 200);
  });
  await check('SDK error is sanitized and retry remains possible', async () => {
    const f = fixture(), { data, token } = await f.init(); f.failGet = true; const response = await f.finalize(data.token); assert.equal(response.status, 400); assert.ok(!JSON.stringify(await response.json()).includes('private')); assert.equal(f.tickets.get(token.id).status, 'pending'); f.failGet = false; assert.equal((await f.finalize(data.token)).status, 200);
  });
  await check('final PUT failure releases ticket and retry succeeds', async () => {
    const f = fixture(), { data, token } = await f.init(); f.failPut = true; assert.equal((await f.finalize(data.token)).status, 400); assert.equal(f.tickets.get(token.id).status, 'pending'); assert.equal((await f.finalize(data.token)).status, 200);
  });
  await check('ledger failure cleans canonical orphan and retry succeeds', async () => {
    const f = fixture(), { data, token } = await f.init(); f.failComplete = true; assert.equal((await f.finalize(data.token)).status, 400); assert.equal(f.tickets.get(token.id).status, 'pending'); assert.ok(!f.objects.has(`${token.id}.jpg`)); assert.equal((await f.finalize(data.token)).status, 200);
  });
  await check('JSON exchange capped at 4KB and unknown action rejected', async () => {
    const f = fixture(); assert.equal((await f.handler(request({ action: 'bad' }))).status, 400); assert.equal((await f.handler(request({ padding: 'x'.repeat(5000) }))).status, 400); assert.equal(f.tickets.size, 0);
  });
  await check('presigning failure never persists unusable ticket or leaks diagnostics', async () => {
    const f = fixture(); f.failPresign = true; const response = await f.handler(request({ action: 'init', contentType: 'image/jpeg', size: 4 })); assert.equal(response.status, 400); assert.ok(!JSON.stringify(await response.json()).includes('private')); assert.equal(f.tickets.size, 0);
  });
  await check('R2 adapter streams bytes and retains object keys/MIME', async () => {
    const commands = []; const bucket = storage.createR2Bucket({ send: async command => { commands.push(command); if (command instanceof GetObjectCommand) return { ContentLength: 4, ContentType: 'image/jpeg', Body: { async *[Symbol.asyncIterator]() { yield JPEG.slice(0, 2); yield JPEG.slice(2); } } }; return {}; } }, 'existing-private-bucket'); const object = await bucket.get('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'); assert.deepEqual(Array.from(object.body), Array.from(JPEG)); assert.equal(object.httpMetadata.contentType, 'image/jpeg'); await bucket.put('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg', JPEG, { httpMetadata: { contentType: 'image/jpeg' } }); assert.equal(commands[1].input.ContentLength, 4); assert.equal(commands[1].input.Bucket, 'existing-private-bucket');
  });
  await check('R2 advertised and streamed oversize blocked with stream destruction', async () => {
    for (const advertised of [true, false]) { let destroyed = false; const bucket = storage.createR2Bucket({ send: async () => ({ ContentLength: advertised ? MAX + 1 : undefined, Body: { destroy() { destroyed = true; }, async *[Symbol.asyncIterator]() { yield new Uint8Array(MAX); yield Uint8Array.of(1); } } }) }, 'private'); await assert.rejects(() => bucket.get('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'), /8MB/); assert.equal(destroyed, true); }
  });
  await check('R2 missing key returns null and unsafe object paths blocked', async () => {
    const bucket = storage.createR2Bucket({ send: async () => { const err = Error(); err.name = 'NoSuchKey'; throw err; } }, 'private'); assert.equal(await bucket.get('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'), null); await assert.rejects(() => bucket.get('../secret'), /저장 경로/); await assert.rejects(() => bucket.presignPut('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg', 'image/jpeg', 4));
  });
  await check('R2 presigned PUT explicitly signs exact MIME and length', async () => {
    let observed; const bucket = storage.createR2Bucket({ send: async () => ({}) }, 'private', async (_client, command, options) => { observed = { command, options }; return 'https://example.test'; }); await bucket.presignPut('_uploads/aaaaaaaaaaaaaaaaaaaaaaaa/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'image/png', 9); assert.equal(observed.command.input.ContentLength, 9); assert.equal(observed.command.input.ContentType, 'image/png'); assert.equal(observed.options.expiresIn, 600); assert.equal(observed.options.signableHeaders.has('content-length'), true); assert.equal(observed.options.signableHeaders.has('content-type'), true);
  });
  await check('public media uses short signed GET and never signs quarantine', async () => {
    const commands = []; let signed; const bucket = storage.createR2Bucket({ send: async command => { commands.push(command); return { ContentLength: MAX }; } }, 'private', async (_client, command, options) => { signed = { command, options }; return 'https://private.test/image'; });
    const key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'; assert.equal(await bucket.presignGet(key), 'https://private.test/image'); assert.ok(commands[0] instanceof HeadObjectCommand); assert.ok(signed.command instanceof GetObjectCommand); assert.equal(signed.command.input.Key, key); assert.equal(signed.options.expiresIn, 60);
    await assert.rejects(() => bucket.presignGet('_uploads/aaaaaaaaaaaaaaaaaaaaaaaa/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), /공개/); assert.equal(commands.length, 1);
  });
  await check('media route redirects canonical key with zero image body and hides configuration errors', async () => {
    let seen; let failure = false; const route = load('templates/media/[key]/route.ts', { '../../../runtime/storage': { getBucket: () => ({ presignGet: async key => { seen = key; if (failure) throw Error('secret=private'); return key.startsWith('dead') ? null : 'https://private.test/signed-image'; } }) } });
    const key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'; const response = await route.GET(new Request('https://store.test/media/' + key), { params: Promise.resolve({ key }) }); assert.equal(response.status, 307); assert.equal(response.headers.get('location'), 'https://private.test/signed-image'); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(await response.text(), ''); assert.equal(seen, key);
    assert.equal((await route.GET(null, { params: Promise.resolve({ key: '_uploads/aaaa' }) })).status, 404); assert.equal((await route.GET(null, { params: Promise.resolve({ key: 'dead.jpg' }) })).status, 404);
    failure = true; const unavailable = await route.GET(null, { params: Promise.resolve({ key }) }); assert.equal(unavailable.status, 503); assert.ok(!(await unavailable.text()).includes('private'));
  });
  await check('browser helper sends only small JSON and direct PUT omits credentials', async () => {
    const calls = [], sandbox = { window: {}, fetch: async (url, options) => { calls.push({ url, options }); return calls.length === 1 ? Response.json({ uploadUrl: 'https://private.test/object', token: 'signed', contentType: 'image/jpeg' }) : calls.length === 2 ? new Response('', { status: 200 }) : Response.json({ url: '/media/aaaa.jpg' }); } }; vm.runInNewContext(fs.readFileSync(path.join(root, 'templates/public/admin-upload.js'), 'utf8'), sandbox); const file = new Blob([JPEG], { type: 'image/jpeg' }); const output = await sandbox.window.StoreUpload(file); assert.equal(output.url, '/media/aaaa.jpg'); assert.equal(calls.length, 3); assert.deepEqual(JSON.parse(calls[0].options.body), { action: 'init', contentType: 'image/jpeg', size: 4 }); assert.equal(calls[1].options.body, file); assert.equal(calls[1].options.credentials, 'omit'); assert.equal(calls[2].options.credentials, 'same-origin'); assert.equal(JSON.parse(calls[2].options.body).action, 'finalize');
  });
  await check('real AWS SDK signs exact length and MIME without network or checksum headers', async () => {
    const aws = require('@aws-sdk/client-s3'); const presigner = require('@aws-sdk/s3-request-presigner');
    const actual = load('runtime/storage.ts', { '@aws-sdk/client-s3': aws, '@aws-sdk/s3-request-presigner': presigner });
    const client = new aws.S3Client({ region: 'auto', endpoint: 'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com', forcePathStyle: true, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED', credentials: { accessKeyId: 'isolated-test-key', secretAccessKey: 'isolated-test-secret-not-a-live-credential' } });
    let headCalls = 0; client.send = async command => { assert.ok(command instanceof aws.HeadObjectCommand); headCalls++; return { ContentLength: MAX }; };
    const bucket = actual.createR2Bucket(client, 'isolated-test-bucket');
    const url = new URL(await bucket.presignPut('_uploads/aaaaaaaaaaaaaaaaaaaaaaaa/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'image/jpeg', MAX));
    const signed = new Set(url.searchParams.get('X-Amz-SignedHeaders').split(';'));
    assert.equal(signed.has('content-length'), true); assert.equal(signed.has('content-type'), true); assert.equal(signed.has('host'), true); assert.equal(url.searchParams.get('X-Amz-Expires'), '600');
    for (const key of url.searchParams.keys()) assert.ok(!key.toLowerCase().startsWith('x-amz-checksum'), 'Browser must not supply an unexpected empty-body checksum.');
    const getUrl = new URL(await bucket.presignGet('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg')); assert.equal(getUrl.searchParams.get('X-Amz-Expires'), '60'); assert.equal(headCalls, 1); client.destroy();
  });
  console.log(`${count} isolated upload/storage scenarios passed. No remote data was accessed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });

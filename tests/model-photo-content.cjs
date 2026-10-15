// Synthetic in-memory content/upload storage and local Chromium only. This
// exercises the real shared validation/routes/editor without provider secrets,
// operating data, R2 access, or external requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const ownerId = 'synthetic-owner';
let identity = { userId: ownerId, email: 'owner@example.test' };
let row = null, failUpload = false, uploadCount = 0, saveCount = 0;
const media = new Map(), modules = new Map();
const env = {
  DB: { prepare(sql) {
    let values;
    return {
      bind(...input) { values = input; return this; },
      async first() {
        if (sql.startsWith('SELECT user_id')) return { user_id: ownerId };
        if (sql.startsWith('SELECT data')) return row;
        if (sql.startsWith('UPDATE store_content')) {
          if (!row || row.revision !== values[3]) return null;
          row = { data: values[0], revision: row.revision + 1, updated_at: values[1] };
          saveCount++;
          return { revision: row.revision };
        }
        throw Error('Unexpected synthetic SQL operation');
      },
      async run() {
        assert(sql.startsWith('INSERT OR IGNORE INTO store_content'));
        row ??= { data: values[1], revision: 0, updated_at: values[2] };
      },
    };
  } },
  BUCKET: { async put(key, bytes, metadata) {
    if (failUpload) throw Error('Synthetic upload failure — retry this image');
    uploadCount++;
    media.set('/media/' + key, { bytes, type: metadata.httpMetadata.contentType });
  } },
};
function load(relative) {
  const filename = path.resolve(root, relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  const module = { exports: {} };
  modules.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const requireLocal = name => name === 'cloudflare:workers' ? { env }
    : name.includes('chatgpt-auth') ? { getChatGPTUser: async () => identity }
    : name.startsWith('.') ? load(path.resolve(path.dirname(filename), name + '.ts')) : require(name);
  vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename })(requireLocal, module, module.exports);
  return module.exports;
}
const { defaults, contentSchema } = load('lib/content.ts');
const contentRoute = load('app/api/admin/content/route.ts');
const uploadRoute = load('app/api/admin/upload/route.ts');
const publicRoute = load('app/api/content/route.ts');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
// Explicitly removed pictures isolate upload/editor checks from bundled defaults.
const fixture = () => ({ ...structuredClone(defaults), products: defaults.products.map(product => ({ ...structuredClone(product), modelImage: null })) });
const putRequest = (content, revision, origin = 'https://shop.test') => new Request('https://shop.test/api/admin/content', {
  method: 'PUT', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ content, revision }),
});
const uploadRequest = (origin = 'https://shop.test') => new Request('https://shop.test/api/admin/upload', {
  method: 'POST', headers: { origin, 'Content-Type': 'image/png' }, body: png,
});
let browser, server, origin;
const errors = [], externalRequests = [], unexpectedRequests = [], results = [];
async function check(label, work) { await work(); results.push(label); console.log('PASS: ' + label); }
function stored() { return JSON.parse(row.data); }

(async () => {
  await check('older content remains unchanged; model image and all focus values validate without invented defaults', async () => {
    assert.deepEqual(contentSchema.parse(defaults), defaults);
    assert(defaults.products.every(product => !Object.hasOwn(product, 'modelImage') && !Object.hasOwn(product, 'modelFocus')));
    for (const focus of ['upper', 'lower', 'center', undefined]) {
      const content = fixture();
      Object.assign(content.products[0], { modelImage: '/assets/campaign.png' });
      if (focus) content.products[0].modelFocus = focus;
      assert.deepEqual(contentSchema.parse(content), content);
    }
    const content = fixture();
    content.products[0].modelImage = '/media/6b42d509-1cad-41f2-844f-412c24beffec.webp';
    assert.equal(contentSchema.safeParse(content).success, true);
  });
  await check('server rejects remote, script, malformed and traversal model images and unknown focus values', async () => {
    for (const modelImage of ['https://example.test/model.png', '//example.test/model.png', 'javascript:alert(1)', 'data:image/png;base64,test', '/assets/../model.png', '/media/../../x.jpg', '/assets/model.png?x=1', '/media/model.svg', '/assets/model.png\" onload=\"x', '']) {
      const content = fixture(); content.products[0].modelImage = modelImage;
      assert.equal(contentSchema.safeParse(content).success, false, modelImage);
      assert.equal((await contentRoute.PUT(putRequest(content, 0))).status, 400, modelImage);
    }
    for (const modelFocus of ['sideways', '', null, 0]) {
      const content = fixture(); Object.assign(content.products[0], { modelImage: '/assets/campaign.png', modelFocus });
      assert.equal(contentSchema.safeParse(content).success, false);
    }
    assert.equal(row, null, 'Invalid saves must not initialize or overwrite content');
  });
  await check('model photos persist through save/read/public API with revision checks and hidden-product filtering', async () => {
    const content = fixture();
    Object.assign(content.products[0], { modelImage: '/assets/campaign.png', modelFocus: 'upper' });
    Object.assign(content.products[1], { modelImage: '/assets/campaign.png', modelFocus: 'lower', visible: false });
    assert.equal((await contentRoute.PUT(putRequest(content, 0))).status, 200);
    assert.deepEqual((await (await contentRoute.GET()).json()).content, content);
    const publicContent = (await (await publicRoute.GET()).json()).content;
    assert.deepEqual(publicContent.products, content.products.filter(product => product.visible));
    const saved = row;
    assert.equal((await contentRoute.PUT(putRequest(defaults, 0))).status, 409);
    assert.equal(row, saved);
  });
  await check('existing owner and origin guards still protect content and image upload APIs', async () => {
    for (const visitor of [null, { userId: 'synthetic-stranger', email: 'other@example.test' }]) {
      identity = visitor;
      assert.equal((await contentRoute.GET()).status, 403);
      assert.equal((await contentRoute.PUT(putRequest(defaults, 1))).status, 403);
      assert.equal((await uploadRoute.POST(uploadRequest())).status, 403);
    }
    identity = { userId: ownerId, email: 'owner@example.test' };
    assert.equal((await contentRoute.PUT(putRequest(defaults, 1, 'https://other.test'))).status, 403);
    assert.equal((await uploadRoute.POST(uploadRequest('https://other.test'))).status, 403);
    assert.equal(uploadCount, 0);
  });

  row = { data: JSON.stringify(fixture()), revision: 0, updated_at: '2026-10-15T00:00:00Z' };
  saveCount = 0;
  server = http.createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, origin).pathname;
      response.setHeader('Cache-Control', 'no-store');
      if (pathname === '/api/admin/content' || pathname === '/api/admin/upload') {
        const parts = []; for await (const part of request) parts.push(part);
        const options = { method: request.method, headers: request.headers };
        if (!['GET', 'HEAD'].includes(request.method)) options.body = Buffer.concat(parts);
        const req = new Request(origin + request.url, options);
        const result = pathname.endsWith('/upload') ? await uploadRoute.POST(req)
          : request.method === 'GET' ? await contentRoute.GET() : await contentRoute.PUT(req);
        response.writeHead(result.status, Object.fromEntries(result.headers));
        response.end(Buffer.from(await result.arrayBuffer())); return;
      }
      if (request.method === 'GET' && media.has(pathname)) {
        const file = media.get(pathname); response.writeHead(200, { 'Content-Type': file.type }); response.end(file.bytes); return;
      }
      const files = { '/admin': ['legacy/admin.html', 'text/html'], '/admin.js': ['public/admin.js', 'text/javascript'], '/admin.css': ['public/admin.css', 'text/css'], '/assets/products.png': ['public/assets/products.png', 'image/png'], '/assets/campaign.png': ['public/assets/campaign.png', 'image/png'], '/assets/campaign-wide.png': ['public/assets/campaign-wide.png', 'image/png'] };
      if (request.method === 'GET' && files[pathname]) {
        const [filename, type] = files[pathname]; response.writeHead(200, { 'Content-Type': type }); response.end(fs.readFileSync(path.join(root, filename))); return;
      }
      if (pathname !== '/favicon.ico') unexpectedRequests.push(request.method + ' ' + pathname);
      response.writeHead(404); response.end();
    } catch (error) { errors.push(error.message); response.writeHead(500); response.end('Synthetic handler failed'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'], headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin === origin) await route.continue();
    else { externalRequests.push(route.request().url()); await route.abort(); }
  });
  await page.goto(origin + '/admin');
  await page.locator('#editor').waitFor({ state: 'visible' });
  const photo = { name: 'synthetic-model.png', mimeType: 'image/png', buffer: png };
  await check('editor starts without model images; optional controls are labelled, disabled until upload and have no URL entry', async () => {
    assert.equal(await page.locator('[data-upload="model"]').count(), 4);
    assert.equal(await page.locator('.model-photo-preview').count(), 0);
    assert.equal(await page.locator('[data-key="modelFocus"]:disabled').count(), 4);
    assert.equal(await page.locator('.model-photo-editor input:not([type="file"])').count(), 0);
    assert.equal(await page.locator('[data-upload="model"]').first().evaluate(input => input.closest('label').textContent.trim()), '착용 사진 등록');
  });
  await check('failed upload allows the same file to be retried; model upload keeps the original image and crop', async () => {
    failUpload = true;
    await page.locator('[data-upload="model"][data-index="0"]').setInputFiles(photo);
    await page.locator('#status.error').filter({ hasText: 'Synthetic upload failure' }).waitFor();
    assert.equal(await page.locator('[data-upload="model"][data-index="0"]').inputValue(), '');
    assert.equal(await page.locator('.model-photo-preview').count(), 0);
    assert.equal(await page.locator('#save').isDisabled(), true);
    failUpload = false;
    await page.locator('[data-upload="model"][data-index="0"]').setInputFiles(photo);
    await page.locator('.model-photo-preview').waitFor();
    assert.equal(await page.locator('[data-key="modelFocus"][data-product="0"]').isEnabled(), true);
    assert.equal(await page.locator('[data-key="modelFocus"][data-product="0"]').inputValue(), 'center');
    assert.equal(uploadCount, 1);
    await page.locator('[data-key="modelFocus"][data-product="0"]').selectOption('upper');
    assert.equal(await page.locator('.model-photo-preview').getAttribute('data-focus'), 'upper');
    await page.locator('#save').click();
    await page.locator('#save-state').filter({ hasText: '저장 완료' }).waitFor();
    assert.equal(stored().products[0].image, defaults.products[0].image);
    assert.equal(stored().products[0].crop, defaults.products[0].crop);
    assert.equal(stored().products[0].modelFocus, 'upper');
    assert.match(stored().products[0].modelImage, /^\/media\/[a-f0-9-]+\.png$/);
  });
  await check('saved model photo survives reload and follows the product when reordered; replacement retains focus', async () => {
    const modelImage = stored().products[0].modelImage;
    await page.reload(); await page.locator('#editor').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.model-photo-preview').getAttribute('src'), modelImage);
    assert.equal(await page.locator('[data-key="modelFocus"][data-product="0"]').inputValue(), 'upper');
    await page.locator('[data-action="down"][data-index="0"]').click();
    assert.equal(await page.locator('.product-card').nth(1).locator('.model-photo-preview').getAttribute('src'), modelImage);
    await page.locator('[data-upload="model"][data-index="1"]').setInputFiles(photo);
    await page.waitForFunction(old => document.querySelector('.model-photo-preview')?.getAttribute('src') !== old, modelImage);
    assert.equal(await page.locator('[data-key="modelFocus"][data-product="1"]').inputValue(), 'upper');
    await page.locator('#save').click(); await page.locator('#save-state').filter({ hasText: '저장 완료' }).waitFor();
    assert.equal(stored().products[1].id, defaults.products[0].id);
    assert.notEqual(stored().products[1].modelImage, modelImage);
    assert.equal(stored().products[1].modelFocus, 'upper');
  });
  await check('removing a model photo stores explicit suppression, preserves the product and persists across reload', async () => {
    await page.locator('[data-action="model-remove"][data-index="1"]').click();
    assert.equal(await page.locator('.model-photo-preview').count(), 0);
    assert.equal(await page.locator('[data-key="modelFocus"][data-product="1"]').isDisabled(), true);
    await page.locator('#save').click(); await page.locator('#save-state').filter({ hasText: '저장 완료' }).waitFor();
    assert.equal(stored().products[1].modelImage, null, 'Removal must suppress bundled defaults on the next read.');
    assert.equal(Object.hasOwn(stored().products[1], 'modelFocus'), false);
    assert.equal(stored().products[1].image, defaults.products[0].image);
    await page.reload(); await page.locator('#editor').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.model-photo-preview').count(), 0);
    assert.equal(saveCount, 3);
  });
  await check('editor remains within desktop and 320px mobile viewports without external requests or browser errors', async () => {
    for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      const sizes = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
      assert(sizes.content <= sizes.viewport + 1, JSON.stringify(sizes));
    }
    assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []); assert.deepEqual(unexpectedRequests, []);
  });
  await context.close();
  console.log(`PASS: ${results.length} model-photo validation, persistence, authorization and local editor scenarios.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

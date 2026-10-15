#!/usr/bin/env node
'use strict';

// Export a file that can be opened directly, without changing the storefront.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const assetNames = ['campaign-wide.png', 'campaign.png', 'products.png', 'jacket-model-01.png', 'shell-model-01.png', 'denim-model-01.png', 'trousers-model-01.png'];
const sourceNames = [
  'legacy/store.html', 'public/style.css', 'public/i18n.js', 'public/app.js', 'lib/content.ts',
  ...assetNames.map(name => 'public/assets/' + name),
];

function fail(message) {
  throw new Error(message);
}

function outputArgument() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    return path.resolve(root, '..', 'outputs', 'street-label-homepage.html');
  }
  if (args.length === 2 && args[0] === '--output' && args[1]) {
    return path.resolve(args[1]);
  }
  fail('Usage: node scripts/export-preview.cjs [--output path/to/preview.html]');
}

function insideCheckout(file) {
  const relative = path.relative(fs.realpathSync(root), file);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function jsonForHtml(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function inlineScript(source) {
  return source.replace(/<\/script/gi, '<\\/script');
}

function inlineStyle(source) {
  return source.replace(/<\/style/gi, '<\\/style');
}

function parseJavaScript(source) {
  const parsed = ts.createSourceFile('preview.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (parsed.parseDiagnostics.length) fail('The preview JavaScript does not parse.');
  return parsed;
}

function readDefaults(source) {
  // Evaluate only the existing catalog/schema module. No DB, environment or
  // authentication module is imported or bundled into the preview.
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: 'content.ts',
  }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({
    module,
    exports: module.exports,
    URL,
    require(name) {
      if (name !== 'zod') fail('The catalog module imports an unexpected dependency.');
      return require('zod');
    },
  });
  new vm.Script(compiled, { filename: 'content.ts' }).runInContext(context, { timeout: 1000 });
  if (!module.exports.contentSchema || !module.exports.defaults) fail('The initial catalog/schema is missing.');
  return JSON.parse(JSON.stringify(module.exports.withBundledModelPhotos(module.exports.contentSchema.parse(module.exports.defaults))));
}

function checkedInlineScript(source, name) {
  parseJavaScript(source);
  const escaped = inlineScript(source);
  new vm.Script(escaped, { filename: name });
  return '<script>' + escaped + '</script>';
}

function main() {
  const requestedOutput = outputArgument();
  if (insideCheckout(requestedOutput)) fail('Choose an output path outside the source checkout.');
  const sources = new Map(sourceNames.map(name => [name, fs.readFileSync(path.join(root, name))]));
  const fingerprints = new Map([...sources].map(([name, bytes]) => [name, crypto.createHash('sha256').update(bytes).digest('hex')]));
  const content = readDefaults(sources.get('lib/content.ts').toString('utf8'));
  const assets = {};
  for (const name of assetNames) {
    const bytes = sources.get('public/assets/' + name);
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) fail('An initial asset is not a PNG.');
    assets['/assets/' + name] = 'data:image/png;base64,' + bytes.toString('base64');
  }
  for (const source of [...content.heroImages, content.journalImage, ...content.products.flatMap(product => [product.image, ...(product.modelImage ? [product.modelImage] : [])])]) {
    if (!Object.hasOwn(assets, source)) fail('An initial catalog image is not bundled. Uploaded R2 images are not exported.');
  }

  let css = sources.get('public/style.css').toString('utf8');
  css = css.replace(/url\(\s*['"]?\/?assets\/([a-zA-Z0-9._-]+)['"]?\s*\)/g, (_reference, name) => {
    if (!Object.hasOwn(assets, '/assets/' + name)) fail('A stylesheet image is not bundled.');
    // The app assigns the embedded image after initialization. Keep the
    // source product image identities/crop classes and embed PNG bytes once.
    return 'none';
  });
  if (/url\s*\(/i.test(css) || /@import\b/i.test(css)) fail('An external stylesheet resource remains.');
  const app = sources.get('public/app.js').toString('utf8');
  const i18n = sources.get('public/i18n.js').toString('utf8');
  if (!app.includes('StorePreviewData')) fail('The storefront does not support the explicit offline-preview contract.');
  let html = sources.get('legacy/store.html').toString('utf8');
  const stylesheet = '<link rel="stylesheet" href="/style.css">';
  if (html.split(stylesheet).length !== 2) fail('The storefront stylesheet tag changed.');
  html = html.replace(stylesheet, '<style>' + inlineStyle(css) + '</style>');
  const sourceScripts = [];
  html = html.replace(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (_tag, source) => {
    sourceScripts.push(source);
    return '';
  });
  if (sourceScripts.length !== 2 || sourceScripts[0] !== '/i18n.js' || sourceScripts[1] !== '/app.js') {
    fail('The storefront must load i18n.js before app.js.');
  }
  const transparentPixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';
  let placeholders = 0;
  html = html.replace(/\bsrc="(\/assets\/[^"\s]+)"/g, (_tag, source) => {
    if (!Object.hasOwn(assets, source)) fail('An HTML image is not bundled.');
    placeholders++;
    return 'src="' + transparentPixel + '"';
  });
  if (placeholders === 0) fail('No initial storefront images were found.');
  const note = '<small id="preview-disclaimer" data-i18n="preview.disclaimer">디자인 미리보기 · 초기 예시 상품만 포함하며 실제 회원·주문·운영 데이터와 업로드 이미지는 포함하지 않습니다.</small>';
  const footerEnd = html.lastIndexOf('</footer>');
  if (footerEnd < 0) fail('The storefront footer was not found.');
  html = html.slice(0, footerEnd) + note + html.slice(footerEnd);
  // Even a new-tab click or JavaScript-disabled browser stays in this file.
  let serviceLinks = 0;
  html = html.replace(/\bhref="(\/(?:signup|account|admin|mypage|policies)(?:[/?#][^"]*)?)"/g, (_attribute, service) => {
    serviceLinks++;
    return 'href="#preview-disclaimer" data-preview-service="' + service + '"';
  });
  if (serviceLinks === 0) fail('No storefront service links were found.');
  if (/\bhref=["']\/(?:signup|account|admin|mypage)(?:[/?#]|["'])/i.test(html)) fail('A service link still leaves the preview.');
  // Audit HTML before adding JavaScript, whose escaped template strings also
  // contain the text src= but are not HTML resource attributes.
  if (/<(?:script|link)\b[^>]*(?:src|href)\s*=/i.test(html)
    || /\bsrc\s*=\s*["'](?!data:)/i.test(html)) fail('An HTML resource is not embedded.');
  const payload = '<script id="street-label-preview-data" type="application/json">' + jsonForHtml({ content, assets }) + '</script>';
  const bootstrap = "window.StorePreviewData=JSON.parse(document.getElementById('street-label-preview-data').textContent);";
  const scripts = checkedInlineScript(bootstrap, 'preview-data.js')
    + checkedInlineScript(i18n, 'i18n.js') + checkedInlineScript(app, 'app.js');
  html = html.replace('</body>', payload + scripts + '</body>');

  fs.mkdirSync(path.dirname(requestedOutput), { recursive: true });
  const output = path.join(fs.realpathSync(path.dirname(requestedOutput)), path.basename(requestedOutput));
  if (insideCheckout(output)) fail('The output directory points into the source checkout.');
  for (const [name, expected] of fingerprints) {
    const current = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex');
    if (current !== expected) fail('A storefront source file changed during export: ' + name);
  }
  const temporary = output + '.tmp-' + process.pid;
  try {
    fs.writeFileSync(temporary, html, { flag: 'wx' });
    fs.renameSync(temporary, output);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  console.log('Preview written: ' + output);
  console.log('Embedded: ' + content.products.filter(product => product.visible).length + ' initial sample products, ' + assetNames.length + ' PNG images and both original storefront scripts.');
  console.log('Offline preview mode enabled; verify zero runtime network/API calls with tests/storefront-preview.cjs.');
  console.log('Storefront source fingerprints unchanged. Actual membership, orders, stored catalog and uploaded R2 images are not included.');
}

try {
  main();
} catch (error) {
  console.error('Preview export failed: ' + error.message);
  process.exitCode = 1;
}

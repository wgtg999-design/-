#!/usr/bin/env node
'use strict';

// Export a file that can be opened directly, without changing the storefront.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const assetNames = ['campaign-v2.png', 'campaign.png', 'products.png'];
const sourceNames = [
  'legacy/store.html', 'public/style.css', 'public/app.js', 'lib/content.ts',
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

function edit(source, edits) {
  const sorted = edits.slice().sort((a, b) => b.start - a.start);
  let boundary = source.length;
  for (const change of sorted) {
    if (change.end > boundary) fail('Overlapping preview transformations.');
    source = source.slice(0, change.start) + change.text + source.slice(change.end);
    boundary = change.start;
  }
  return source;
}

function containsFetch(node, request) {
  let found = false;
  function visit(child) {
    if (ts.isCallExpression(child) && ts.isIdentifier(child.expression)
      && child.expression.text === 'fetch' && child.arguments.length
      && ts.isStringLiteral(child.arguments[0]) && child.arguments[0].text === request) found = true;
    ts.forEachChild(child, visit);
  }
  visit(node);
  return found;
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
    require(name) {
      if (name !== 'zod') fail('The catalog module imports an unexpected dependency.');
      return require('zod');
    },
  });
  new vm.Script(compiled, { filename: 'content.ts' }).runInContext(context, { timeout: 1000 });
  if (!module.exports.contentSchema || !module.exports.defaults) fail('The initial catalog/schema is missing.');
  return JSON.parse(JSON.stringify(module.exports.contentSchema.parse(module.exports.defaults)));
}

function previewApp(source) {
  let parsed = parseJavaScript(source);
  const init = parsed.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'init');
  const attempt = init?.body?.statements.find(ts.isTryStatement);
  if (!init || !attempt || !attempt.catchClause) fail('The storefront initialization shape changed.');
  const hydrate = attempt.tryBlock.statements.find(statement => {
    if (!ts.isExpressionStatement(statement) || !ts.isBinaryExpression(statement.expression)) return false;
    const expression = statement.expression;
    return expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(expression.left)
      && ts.isIdentifier(expression.left.expression)
      && expression.left.expression.text === 'document' && expression.left.name.text === 'title';
  });
  if (!hydrate) fail('The existing storefront hydration code was not found.');
  const session = parsed.statements.filter(statement => ts.isExpressionStatement(statement) && containsFetch(statement, '/api/session'));
  if (session.length !== 1) fail('The storefront session initialization shape changed.');
  const hydration = source.slice(hydrate.getStart(parsed), attempt.tryBlock.end - 1);
  source = edit(source, [
    {
      start: init.getStart(parsed), end: init.end,
      text: 'function init(){try{content=previewDefaults;products=content.products.filter(p=>p.visible);inventory=[];'
        + hydration + '}catch' + attempt.catchClause.block.getText(parsed) + '}',
    },
    { start: session[0].getStart(parsed), end: session[0].end, text: '' },
  ]);

  // Keep image path identities intact: the original contact-sheet path is
  // also the sentinel that chooses the correct product quadrant/crop class.
  parsed = parseJavaScript(source);
  const changes = [];
  let imageEscapes = 0, imageAssignments = 0, storageKeys = 0;
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'esc'
      && node.arguments.length === 1 && ts.isPropertyAccessExpression(node.arguments[0])) {
      const argument = node.arguments[0];
      const productImage = ts.isIdentifier(argument.expression) && argument.expression.text === 'p' && argument.name.text === 'image';
      const journalImage = ts.isIdentifier(argument.expression) && argument.expression.text === 'content' && argument.name.text === 'journalImage';
      if (productImage || journalImage) {
        changes.push({ start: argument.getStart(parsed), end: argument.end, text: 'previewAsset(' + argument.getText(parsed) + ')' });
        imageEscapes++;
      }
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(node.left) && node.left.name.text === 'src') {
      changes.push({ start: node.right.getStart(parsed), end: node.right.end, text: 'previewAsset(' + node.right.getText(parsed) + ')' });
      imageAssignments++;
    }
    if (ts.isStringLiteral(node) && node.text === 'your-label-cart') {
      changes.push({ start: node.getStart(parsed), end: node.end, text: "'your-label-preview-cart'" });
      storageKeys++;
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  if (imageEscapes !== 2 || imageAssignments !== 3 || storageKeys !== 2) fail('The storefront image/cart shape changed.');
  source = edit(source, changes);

  const setup = `const previewData=JSON.parse(document.getElementById('street-label-preview-data').textContent);
const previewDefaults=previewData.content,previewAssets=previewData.assets;
function previewAsset(source){if(!Object.hasOwn(previewAssets,source))throw Error('미리보기 이미지가 없습니다.');return previewAssets[source];}
`;
  const serviceNotice = `
document.addEventListener('click',event=>{
  const link=event.target.closest('a[data-preview-service]');
  if(!link)return;
  event.preventDefault();
  $('#info-content').innerHTML='<h2>디자인 미리보기</h2><p>로그인·회원가입·주문·관리자 기능은 연결된 실제 사이트에서 이용해야 합니다. 이 파일에서는 개인정보를 입력하거나 회원가입·주문을 접수하지 않습니다.</p><p>소스의 초기 예시 상품과 기본 이미지만 포함합니다. 실제 회원·주문·운영 상품 데이터 및 업로드 이미지는 포함하지 않습니다.</p>';
  if(!$('#info-dialog').open)$('#info-dialog').showModal();
});
`;
  const script = setup + source + serviceNotice;
  const result = parseJavaScript(script);
  function audit(node) {
    if (ts.isIdentifier(node) && node.text === 'fetch') fail('A network dependency remains in the preview.');
    ts.forEachChild(node, audit);
  }
  audit(result);
  // Also check the exact source that will execute after HTML-safe escaping.
  new vm.Script(inlineScript(script), { filename: 'street-label-preview.js' });
  return script;
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
  for (const source of [...content.heroImages, content.journalImage, ...content.products.map(product => product.image)]) {
    if (!Object.hasOwn(assets, source)) fail('An initial catalog image is not bundled. Uploaded R2 images are not exported.');
  }

  let css = sources.get('public/style.css').toString('utf8');
  const imageReferences = css.match(/url\(\s*['"]?assets\/products\.png['"]?\s*\)/g) || [];
  if (imageReferences.length !== 1) fail('The product stylesheet image shape changed.');
  css = css.replace(/url\(\s*['"]?assets\/products\.png['"]?\s*\)/g, 'none');
  if (/url\s*\(/i.test(css) || /@import\b/i.test(css)) fail('An external stylesheet resource remains.');
  const script = previewApp(sources.get('public/app.js').toString('utf8'));
  let html = sources.get('legacy/store.html').toString('utf8');
  const stylesheet = '<link rel="stylesheet" href="/style.css">';
  const appScript = '<script src="/app.js" defer></script>';
  if (html.split(stylesheet).length !== 2 || html.split(appScript).length !== 2) fail('The storefront resource tags changed.');
  html = html.replace(stylesheet, '<style>' + inlineStyle(css) + '</style>').replace(appScript, '');
  const transparentPixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';
  let placeholders = 0;
  html = html.replace(/\bsrc="(\/assets\/[^"\s]+)"/g, (_tag, source) => {
    if (!Object.hasOwn(assets, source)) fail('An HTML image is not bundled.');
    placeholders++;
    return 'src="' + transparentPixel + '"';
  });
  if (placeholders !== 2) fail('The initial storefront image shape changed.');
  const note = '<small id="preview-disclaimer">디자인 미리보기 · 초기 예시 상품만 포함하며 실제 회원·주문·운영 데이터와 업로드 이미지는 포함하지 않습니다.</small>';
  html = html.replace('</footer>', note + '</footer>');
  // Even a new-tab click or JavaScript-disabled browser stays in this file.
  let serviceLinks = 0;
  html = html.replace(/\bhref="(\/(?:signup|account|admin)(?:[/?#][^"]*)?)"/g, (_attribute, service) => {
    serviceLinks++;
    return 'href="#preview-disclaimer" data-preview-service="' + service + '"';
  });
  if (serviceLinks !== 6) fail('The storefront service-link shape changed.');
  // Audit HTML before adding JavaScript, whose escaped template strings also
  // contain the text src= but are not HTML resource attributes.
  if (/<(?:script|link)\b[^>]*(?:src|href)\s*=/i.test(html)
    || /\bsrc\s*=\s*["'](?!data:)/i.test(html)) fail('An HTML resource is not embedded.');
  const payload = '<script id="street-label-preview-data" type="application/json">' + jsonForHtml({ content, assets }) + '</script>';
  html = html.replace('</body>', payload + '<script>' + inlineScript(script) + '</script></body>');

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
  console.log('Embedded: ' + content.products.filter(product => product.visible).length + ' initial sample products, ' + assetNames.length + ' PNG images; external resources/API calls: 0.');
  console.log('Storefront source fingerprints unchanged. Actual membership, orders, stored catalog and uploaded R2 images are not included.');
}

try {
  main();
} catch (error) {
  console.error('Preview export failed: ' + error.message);
  process.exitCode = 1;
}

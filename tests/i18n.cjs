const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('public/i18n.js', 'utf8');
class Element {
  constructor(attributes = {}, value = '') {
    this.attributes = {...attributes}; this.value = value; this.dataset = {}; this.children = []; this.events = {}; this.disabled = false; this.checked = false;
    for (const [key, data] of Object.entries(attributes)) if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, character) => character.toUpperCase())] = data;
  }
  matches(selector) { return Object.hasOwn(this.attributes, selector.slice(1, -1)); }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, callback) { (this.events[name] ||= []).push(callback); }
  dispatch(name) { for (const callback of this.events[name] || []) callback({target: this}); }
}
function browser({stored, url = 'https://shop.test/', storageError = false} = {}) {
  const storage = stored || new Map();
  const elements = [];
  const document = {readyState: 'complete', documentElement: {lang: ''}, querySelectorAll(selector) { return elements.flatMap(element => [...(element.matches(selector) ? [element] : []), ...element.querySelectorAll(selector)]); }};
  const events = [];
  const window = {document, location: {href: url}, localStorage: {getItem(key) { if (storageError) throw Error('blocked'); return storage.get(key) || null; }, setItem(key, value) { if (storageError) throw Error('blocked'); storage.set(key, value); }}, dispatchEvent(event) { events.push(event); }};
  const context = vm.createContext({window, URL, Intl, CustomEvent: class {constructor(type, options) {this.type = type; this.detail = options.detail;}}});
  vm.runInContext(source, context, {filename: 'public/i18n.js'});
  return {I: window.StoreI18n, window, document, elements, events, storage, context};
}

const b = browser();
assert.equal(b.I.getLanguage(), 'ko');
assert.deepEqual(Array.from(b.I.languages), ['ko', 'zh-CN', 'zh-TW', 'ja']);
const keys = b.I.keys();
assert.ok(keys.length > 250, 'All customer surfaces need translations');
const placeholders = value => Array.from(value.matchAll(/\{([a-zA-Z0-9_]+)\}/g), match => match[1]).sort();
for (const key of keys) {
  b.I.setLanguage('ko'); const expected = placeholders(b.I.t(key));
  for (const language of b.I.languages) {
    b.I.setLanguage(language); const value = b.I.t(key);
    assert.equal(typeof value, 'string', key + ': ' + language);
    assert.ok(value.trim() && value !== key, key + ': missing ' + language);
    assert.deepEqual(placeholders(value), expected, key + ': translation changed interpolation contract');
  }
}

const usedKeys = new Set();
for (const file of ['legacy/store.html', 'legacy/signup.html', 'legacy/account.html', 'public/app.js', 'public/account.js', 'public/commerce-common.js']) {
  for (const match of fs.readFileSync(file, 'utf8').matchAll(/["']((?:nav|home|category|shop|product|cart|community|guide|social|preview|common|general|account|auth|order|status)\.[A-Za-z_][\w]*)["']/g)) usedKeys.add(match[1]);
}
for (const key of usedKeys) assert.ok(keys.includes(key), 'Missing customer translation key: ' + key);

// Whitelist enforcement must also reject Object-prototype property names.
b.I.setLanguage('ko'); const eventCount = b.events.length;
for (const invalid of ['en', 'zh', '__proto__', 'constructor', '<img src=x>', {}, null, 0]) {
  assert.equal(b.I.setLanguage(invalid), false); assert.equal(b.I.getLanguage(), 'ko');
}
assert.equal(b.events.length, eventCount);
assert.equal(b.I.t('__proto__'), '__proto__');
assert.equal(b.I.t('toString'), 'toString');
assert.equal(b.I.setLanguage('ZH-cn'), true);
assert.equal(b.I.getLanguage(), 'zh-CN');
assert.equal(b.events.length, eventCount + 1);
assert.equal(b.events.at(-1).type, 'street-label:languagechange');
assert.equal(b.events.at(-1).detail.language, 'zh-CN');
b.I.setLanguage('zh-CN'); assert.equal(b.events.length, eventCount + 1, 'Repeating a language must not duplicate change events');

// Apply uses text and attribute APIs: customer-supplied interpolations remain inert.
const payload = '<img src=x onerror=alert(1)>';
const greeting = new Element({'data-i18n': 'auth.welcome', 'data-i18n-params': JSON.stringify({name: payload})});
const input = new Element({'data-i18n-placeholder': 'home.searchPlaceholder', 'data-i18n-aria-label': 'home.searchLabel'}, 'typed search');
const consent = new Element(); consent.checked = true; consent.disabled = true;
const select = new Element({'data-language-select': ''});
const button = new Element({'data-set-language': 'ja'});
const malformed = new Element({'data-i18n': 'common.close', 'data-i18n-params': '{invalid'});
const label = new Element({'data-language-label': ''});
b.elements.push(greeting, input, consent, select, button, malformed, label);
b.I.setLanguage('ja'); b.I.apply(); b.I.apply();
assert.ok(greeting.textContent.includes(payload));
assert.equal(greeting.children.length, 0, 'Interpolated HTML must not create DOM nodes');
assert.equal(input.value, 'typed search'); assert.equal(consent.checked, true); assert.equal(consent.disabled, true);
assert.equal(input.getAttribute('placeholder'), '商品名または色を検索');
assert.equal(input.getAttribute('aria-label'), '商品検索');
assert.equal(select.value, 'ja'); assert.equal(select.events.change.length, 1);
assert.equal(button.getAttribute('aria-pressed'), 'true');
assert.equal(malformed.textContent, '閉じる');
assert.equal(label.textContent, '日本語');
assert.equal(b.document.documentElement.lang, 'ja');
select.value = 'zh-TW'; select.dispatch('change'); assert.equal(b.I.getLanguage(), 'zh-TW');

// Preferences survive a fresh page, while invalid URL values never become language state.
assert.equal(browser({stored: b.storage}).I.getLanguage(), 'zh-TW');
const fromUrl = browser({stored: b.storage, url: 'https://shop.test/signup?next=checkout&lang=ja'});
assert.equal(fromUrl.I.getLanguage(), 'ja');
assert.equal(browser({stored: fromUrl.storage}).I.getLanguage(), 'ja');
assert.equal(browser({stored: fromUrl.storage, url: 'https://shop.test/?lang=__proto__'}).I.getLanguage(), 'ja');
const blockedStorage = browser({storageError: true});
assert.equal(blockedStorage.I.getLanguage(), 'ko');
assert.equal(blockedStorage.I.setLanguage('zh-CN'), true); assert.equal(blockedStorage.I.getLanguage(), 'zh-CN');

assert.equal(b.I.formatCurrency(128000), '₩128,000', 'Language selection must not invent currency conversion');
assert.equal(b.I.catalogValue({name: 'Original', translations: {'zh-TW': {name: '原始'}}}, 'name'), '原始');
assert.equal(b.I.catalogValue({name: 'Original', translations: {'zh-TW': {name: ' '}}}, 'name'), 'Original');
assert.equal(b.I.catalogValue({terms: 'Operator legal text'}, 'terms'), 'Operator legal text');
assert.equal(b.I.translateError('로그인이 필요합니다.'), '請先登入。');
assert.equal(b.I.translateError('Unknown server detail'), b.I.t('common.requestError'));
b.I.setLanguage('ko'); assert.equal(b.I.translateError('Useful Korean server detail'), 'Useful Korean server detail');

const before = b.window.StoreI18n; const initialEvents = b.events.length;
vm.runInContext(source, b.context, {filename: 'public/i18n.js'});
assert.equal(b.window.StoreI18n, before, 'Classic and module imports must reuse one translation instance');
assert.equal(b.events.length, initialEvents);
console.log('PASS: ' + keys.length + ' translation keys across four languages; customer key coverage, safe DOM interpolation, strict language whitelist, single events, form preservation, locale persistence, blocked storage fallback, KRW and operator text retention.');

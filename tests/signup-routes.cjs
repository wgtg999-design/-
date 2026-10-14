const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const ts=require('typescript');

let identity=null;
const auth={
  getChatGPTUser:async()=>identity,
  chatGPTSignInPath:returnTo=>'/signin-with-chatgpt?return_to='+encodeURIComponent(returnTo),
};
const noCache={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
function load(file){
  file=path.resolve(file);
  const m={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText;
  const req=id=>{
    if(id.endsWith('?raw'))return fs.readFileSync(path.resolve(path.dirname(file),id.slice(0,-4)),'utf8');
    if(id.includes('chatgpt-auth'))return auth;
    if(id.endsWith('lib/admin'))return {noCache};
    throw Error('Unexpected route dependency: '+id);
  };
  vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(req,m,m.exports);
  return m.exports;
}
function uncached(r){
  assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal(r.headers.get('x-content-type-options'),'nosniff');
}
function signinTarget(html){
  const href=html.match(/href="(\/signin-with-chatgpt\?return_to=[^"]+)"/);
  assert.ok(href,'The public entry must provide an explicit ChatGPT sign-in link');
  return new URL(href[1],'https://shop.test').searchParams.get('return_to');
}
function languageSelector(html){
  assert.match(html,/select data-language-select/,'Customer pages must expose a native language selector');
  for(const locale of ['ko','zh-CN','zh-TW','ja'])assert.ok(html.includes('<option value="'+locale+'">'),'Missing supported locale: '+locale);
}

(async()=>{
  const signup=load('app/signup/route.ts'),account=load('app/account/route.ts');
  const request=url=>new Request('https://shop.test'+url);
  for(const [query,target] of [
    ['', '/signup'],
    ['?next=checkout','/signup?next=checkout'],
    ['?next=https%3A%2F%2Fevil.test','/signup'],
    ['?next=%2F%2Fevil.test','/signup'],
    ['?next=checkout%22%3E%3Cscript%3E','/signup'],
  ]){
    const r=await signup.GET(request('/signup'+query));
    assert.equal(r.status,200);uncached(r);
    assert.equal(r.headers.get('content-type'),'text/html; charset=utf-8');
    const html=await r.text();
    assert.match(html,/class="signup-page"/);
    languageSelector(html);
    assert.match(html,/script defer src="\/i18n.js"/);
    assert.match(html,/ChatGPT로 로그인 \/ 회원가입/);
    assert.equal(signinTarget(html),target);
    assert.doesNotMatch(html,/__SIGN_IN_URL__|src="\/account.js"/);
  }
  for(const [query,target] of [
    ['', '/signup'],
    ['?next=checkout','/signup?next=checkout'],
    ['?next=%2F%2Fevil.test','/signup'],
  ]){
    const r=await account.GET(request('/account'+query));
    assert.equal(r.status,302);uncached(r);
    assert.equal(r.headers.get('location'),'https://shop.test'+target);
  }
  identity={userId:'test-customer',email:'customer@example.test'};
  for(const [route,url] of [[signup,'/signup?next=checkout'],[account,'/account?next=checkout']]){
    const r=await route.GET(request(url));
    assert.equal(r.status,200);uncached(r);
    const html=await r.text();
    assert.match(html,/class="account-page"/);
    languageSelector(html);
    assert.match(html,/src="\/account.js"/);
    assert.doesNotMatch(html,/customer@example\.test|test-customer|__SIGN_IN_URL__/);
  }
  console.log('PASS: public signup entry, explicit ChatGPT login, authenticated account shell, checkout intent preservation, external next rejection, uncached routes.');
})().catch(e=>{console.error(e);process.exitCode=1});

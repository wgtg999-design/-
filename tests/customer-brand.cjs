const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync('public/customer-brand.js','utf8');

function page(fetch){
  const brandNode={textContent:'YOUR LABEL',set innerHTML(_){throw Error('Brand must use textContent')}};
  const title={dataset:{storeTitle:'auth.entryDocumentTitle'},textContent:'',set innerHTML(_){throw Error('Title must use textContent')}};
  const events={};
  const window={
    document:{querySelector:()=>title,querySelectorAll:()=>[brandNode]},
    StoreI18n:{t:(key,{brand}={})=>brand?'Login / Join · '+brand:key},
    addEventListener:(name,listener)=>{events[name]=listener},fetch,
  };
  vm.runInNewContext(source,{window});
  return {window,brandNode,title,events};
}
(async()=>{
  let requests=0,resolve;
  const fixture=page(async(url,options)=>{
    requests++;assert.equal(url,'/api/content');assert.equal(options.cache,'no-store');
    return new Promise(r=>{resolve=r});
  });
  assert.equal(fixture.brandNode.textContent,'YOUR LABEL');
  assert.equal(fixture.title.textContent,'Login / Join · YOUR LABEL');
  const one=fixture.window.StoreBrand.load(),two=fixture.window.StoreBrand.load();
  assert.equal(one,two);assert.equal(requests,1,'Brand and catalog must share a public content request');
  const content={brand:'<img src=x onerror=alert(1)>',products:[]};
  resolve({ok:true,json:async()=>({content})});
  assert.equal(await one,content);
  assert.equal(fixture.brandNode.textContent,content.brand);
  assert.equal(fixture.title.textContent,'Login / Join · '+content.brand);
  fixture.events['street-label:languagechange']();
  assert.equal(fixture.title.textContent,'Login / Join · '+content.brand);
  assert.equal(requests,1);

  let failures=0;
  const offline=page(async()=>{failures++;throw Error('offline')});
  await assert.rejects(offline.window.StoreBrand.load(),e=>e.messageKey==='status.network');
  assert.equal(offline.brandNode.textContent,'YOUR LABEL');
  assert.equal(offline.title.textContent,'Login / Join · YOUR LABEL');
  await assert.rejects(offline.window.StoreBrand.load());assert.equal(failures,2,'A failed lookup must allow a later retry');
  console.log('PASS: public brand lookup, shared content request, text-only brand/title rendering, locale title update, placeholder fallback and retry.');
})().catch(e=>{console.error(e);process.exitCode=1});

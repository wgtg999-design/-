// Synthetic catalog metadata and an in-memory D1 substitute; no production access.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync(':memory:');
for(const file of fs.readdirSync('drizzle').filter(file=>file.endsWith('.sql')).sort())db.exec(fs.readFileSync(path.join('drizzle',file),'utf8'));
let identity=null;
const owner={userId:'catalog-test-owner',email:'owner@example.test'};
const env={OWNER_BOOTSTRAP_EMAIL:owner.email,DB:{prepare(sql){let values=[];return {
  bind(...next){values=next;return this},
  async first(){return db.prepare(sql).get(...values)||null},
  async all(){return {results:db.prepare(sql).all(...values)}},
  async run(){return db.prepare(sql).run(...values)},
}}}};
const cache=new Map();
function load(file){
  file=path.resolve(file);if(cache.has(file))return cache.get(file);
  const module={exports:{}};cache.set(file,module.exports);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const localRequire=id=>id==='cloudflare:workers'?{env}:id.includes('chatgpt-auth')?{getChatGPTUser:async()=>identity}:id.startsWith('.')?load(path.resolve(path.dirname(file),id+'.ts')):require(id);
  vm.runInThisContext('(function(require,module,exports){'+code+'})',{filename:file})(localRequire,module,module.exports);
  cache.set(file,module.exports);return module.exports;
}
const {contentSchema,defaults,withBundledModelPhotos}=load('lib/content.ts');
const api=load('app/api/admin/content/route.ts'),publicApi=load('app/api/content/route.ts');
const clone=()=>structuredClone(defaults);
const put=(content,revision,origin='https://shop.test')=>new Request('https://shop.test/api/admin/content',{method:'PUT',headers:{'content-type':'application/json',...(origin===null?{}:{origin})},body:JSON.stringify({content,revision})});
const invalid=(content,label)=>assert.equal(contentSchema.safeParse(content).success,false,label);
const locales=['ko','zh-CN','zh-TW','ja'];

(async()=>{
  // Old saved catalogs remain exactly the same, with no injected empty metadata.
  const legacy=clone();legacy.brand='Legacy synthetic brand';
  assert.deepEqual(contentSchema.parse(legacy),legacy);
  assert.equal(defaults.brand,'YOUR LABEL');
  assert.equal(defaults.products.length,4);
  assert(defaults.products.every(product=>!Object.hasOwn(product,'featured')&&!Object.hasOwn(product,'sizeGuide')&&!Object.hasOwn(product,'translations')));
  assert(!Object.hasOwn(contentSchema.parse(legacy),'socialLinks'));
  assert(!Object.hasOwn(contentSchema.parse(legacy),'translations'));
  assert.deepEqual(defaults.products.map(product=>[product.price,product.image,product.crop]),[
    [129000,'/assets/products.png',''],[149000,'/assets/products.png','right'],[89000,'/assets/products.png','bottom'],[79000,'/assets/products.png','bottom right'],
  ]);

  // SNS fields allow only an actual HTTPS authority on the listed official hosts.
  for(const host of ['instagram.com','www.instagram.com']){
    const candidate=clone();candidate.socialLinks={instagram:`https://${host}/synthetic-test`,kakao:''};
    assert(contentSchema.safeParse(candidate).success);
  }
  for(const host of ['pf.kakao.com','open.kakao.com','kakao.com','www.kakao.com']){
    const candidate=clone();candidate.socialLinks={instagram:'',kakao:`https://${host}/synthetic-test`};
    assert(contentSchema.safeParse(candidate).success);
  }
  const blank=clone();blank.socialLinks={instagram:'  ',kakao:''};
  assert.deepEqual(contentSchema.parse(blank).socialLinks,{instagram:'',kakao:''});
  const padded=clone();padded.socialLinks={instagram:' https://www.instagram.com/synthetic-test ',kakao:' https://pf.kakao.com/synthetic-test '};
  assert.deepEqual(contentSchema.parse(padded).socialLinks,{instagram:'https://www.instagram.com/synthetic-test',kakao:'https://pf.kakao.com/synthetic-test'});
  const unsafe=[
    'javascript:alert(1)','http://instagram.com/test','//instagram.com/test','https://evil.example.test/test',
    'https://instagram.com.evil.example.test/test','https://instagram.com@evil.example.test/test',
    'https://name@instagram.com/test','https://name:pass@instagram.com/test','https://@instagram.com/test',
    'https://instagram.com:443/test','https://instagram.com:444/test','https://instagram.com:/test',
    'https://instagram.com./test','https://%69nstagram.com/test','https://instagram.com\\@evil.example.test/test',
    'https://open.kakao.com/test','https://www.instagram.com/'+ 'x'.repeat(501),
  ];
  for(const instagram of unsafe){const candidate=clone();candidate.socialLinks={instagram,kakao:''};invalid(candidate,`Reject unsafe Instagram address: ${instagram}`)}
  for(const kakao of ['http://pf.kakao.com/test','https://evil.example.test/test','https://pf.kakao.com.evil.test/test','https://name@open.kakao.com/test','https://pf.kakao.com:443/test','https://www.instagram.com/test']){
    const candidate=clone();candidate.socialLinks={instagram:'',kakao};invalid(candidate,'Reject unsafe or wrong-service Kakao address');
  }

  // Locale keys and metadata are bounded and never silently discarded.
  for(const locale of locales){
    const boundary=clone();boundary.translations={[locale]:{notice:'n'.repeat(120),aboutTitle:'t'.repeat(100),aboutText:'a'.repeat(500)}};
    boundary.products[0].translations={[locale]:{name:'n'.repeat(100),color:'c'.repeat(50),description:'d'.repeat(2000),sizeGuide:'g'.repeat(4000)}};
    boundary.products[0].sizeGuide='g'.repeat(4000);boundary.products[0].featured=false;
    assert.deepEqual(contentSchema.parse(boundary),boundary);
  }
  for(const [field,max] of [['notice',120],['aboutTitle',100],['aboutText',500]]){
    const candidate=clone();candidate.translations={ja:{[field]:'x'.repeat(max+1)}};invalid(candidate,`Brand translation length: ${field}`);
  }
  for(const [field,max] of [['name',100],['color',50],['description',2000],['sizeGuide',4000]]){
    const candidate=clone();candidate.products[0].translations={'zh-CN':{[field]:'x'.repeat(max+1)}};invalid(candidate,`Product translation length: ${field}`);
  }
  for(const field of ['featured','sizeGuide']){const candidate=clone();candidate.products[0][field]=field==='featured'?'yes':'x'.repeat(4001);invalid(candidate,`Invalid product metadata: ${field}`)}
  for(const translations of [{en:{notice:'Unsupported'}},JSON.parse('{"__proto__":{"notice":"Unexpected"}}'),{constructor:{notice:'Unexpected'}}]){
    const candidate=clone();candidate.translations=translations;invalid(candidate,'Unsupported/prototype brand locale');
  }
  for(const translations of [{en:{name:'Unsupported'}},JSON.parse('{"__proto__":{"name":"Unexpected"}}'),{constructor:{name:'Unexpected'}}]){
    const candidate=clone();candidate.products[0].translations=translations;invalid(candidate,'Unsupported/prototype product locale');
  }
  const extraBrand=clone();extraBrand.translations={ja:{unexpected:'Must not vanish silently'}};invalid(extraBrand,'Unknown translated field');
  const extraProduct=clone();extraProduct.products[0].translations={ja:{price:1}};invalid(extraProduct,'Translated price cannot override server price');
  const prototypeField=clone();prototypeField.products[0].translations={ja:JSON.parse('{"__proto__":{"polluted":true}}')};invalid(prototypeField,'Prototype translation field');
  const prototypeSocial=clone();prototypeSocial.socialLinks=JSON.parse('{"instagram":"","kakao":"","__proto__":{"polluted":true}}');invalid(prototypeSocial,'Prototype SNS field');
  assert.equal({}.polluted,undefined);

  // Real SQL-backed API save/read protects admin identity and revision while retaining metadata.
  assert.equal((await api.GET()).status,403);
  identity={userId:'catalog-test-stranger',email:'other@example.test'};
  assert.equal((await api.PUT(put(legacy,0))).status,403);
  assert.equal(db.prepare('SELECT count(*) AS n FROM store_owner').get().n,0);
  identity=owner;
  let response=await api.PUT(put(legacy,0));assert.equal(response.status,200,await response.text());
  assert.deepEqual((await (await api.GET()).json()).content,withBundledModelPhotos(legacy));
  const catalog=clone();catalog.socialLinks={instagram:'https://www.instagram.com/synthetic-test',kakao:'https://pf.kakao.com/synthetic-test'};
  catalog.translations={};
  for(const locale of locales)catalog.translations[locale]={notice:`Synthetic ${locale} notice`,aboutTitle:`Synthetic ${locale} title`,aboutText:`Synthetic ${locale} introduction`};
  catalog.products[0].featured=true;catalog.products[0].sizeGuide='Synthetic measurement-guide fixture only.';
  catalog.products[0].translations={};
  for(const locale of locales)catalog.products[0].translations[locale]={name:`Synthetic ${locale} name`,color:`Synthetic ${locale} color`,description:`Synthetic ${locale} description`,sizeGuide:`Synthetic ${locale} guide`};
  catalog.products[1].featured=true;catalog.products[1].visible=false;
  response=await api.PUT(put(catalog,1));assert.equal(response.status,200,await response.text());
  const readback=(await (await api.GET()).json()).content;assert.deepEqual(readback,withBundledModelPhotos(catalog));
  const published=(await (await publicApi.GET()).json()).content;
  assert.deepEqual(published.products,withBundledModelPhotos(catalog).products.filter(product=>product.visible));
  assert.equal(published.products.filter(product=>product.featured===true).length,1,'Hidden recommendations never reach public content');
  assert.deepEqual(published.socialLinks,catalog.socialLinks);assert.deepEqual(published.translations,catalog.translations);
  const metadata=structuredClone(readback.products[0].translations);
  readback.brand='Changed base brand';readback.products[0].name='Changed base product';readback.products.reverse();
  response=await api.PUT(put(readback,2));assert.equal(response.status,200,await response.text());
  const updated=(await (await api.GET()).json()).content;assert.deepEqual(updated,readback);
  assert.deepEqual(updated.products.find(product=>product.id==='jacket').translations,metadata);
  assert.equal((await api.PUT(put(catalog,2))).status,409,'Old revision must not overwrite newer metadata');
  for(const origin of ['https://other.example.test',null])assert.equal((await api.PUT(put(catalog,3,origin))).status,403);
  for(const visitor of [null,{userId:'catalog-test-stranger',email:'other@example.test'},{userId:'different-owner-id',email:owner.email}]){
    identity=visitor;assert.equal((await api.GET()).status,403);assert.equal((await api.PUT(put(catalog,3))).status,403);
  }
  identity=owner;
  const unsafeCatalog=structuredClone(readback);unsafeCatalog.socialLinks.instagram='javascript:alert(1)';
  assert.equal((await api.PUT(put(unsafeCatalog,3))).status,400);
  assert.deepEqual((await (await api.GET()).json()).content,readback,'Denied and invalid saves leave the saved catalog unchanged');
  assert.equal((await (await api.GET()).json()).revision,3);
  console.log('PASS: legacy catalog compatibility, safe official SNS URLs, four bounded locale records, prototype rejection, optional recommendations/size guide, SQL save/read preservation, hidden-product exclusion, owner/origin guards and stale revision denial.');
  db.close();
})().catch(error=>{console.error(error);db.close();process.exitCode=1});

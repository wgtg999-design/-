// Real shared read/validation routes, with isolated immutable catalog storage.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),modules=new Map();
let row=null,reads=0;
const env={DB:{prepare(sql){assert.equal(sql,'SELECT data,revision,updated_at FROM store_content WHERE key = ?');return{bind(key){assert.equal(key,'main');return this},async first(){reads++;return row}}}}};
function load(file){
 const filename=path.resolve(root,file);if(modules.has(filename))return modules.get(filename).exports;
 const module={exports:{}};modules.set(filename,module);
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const localRequire=name=>name==='cloudflare:workers'?{env}:name.includes('chatgpt-auth')?{getChatGPTUser:async()=>null}:name.startsWith('.')?load(path.resolve(path.dirname(filename),name+'.ts')):require(name);
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename})(localRequire,module,module.exports);return module.exports;
}
const {defaults,contentSchema,withBundledModelPhotos}=load('lib/content.ts'),{readStore}=load('lib/store.ts'),publicRoute=load('app/api/content/route.ts');
const clone=()=>structuredClone(defaults);
(async()=>{
 const raw=JSON.stringify(defaults),derived=withBundledModelPhotos(defaults);
 assert.equal(JSON.stringify(defaults),raw,'Rendering presets must not mutate source objects');
 const ids=['jacket','shell','denim','trousers'];
 for(const [index,product] of derived.products.entries()){
  assert.equal(product.id,ids[index]);assert.equal(product.modelImage,`/assets/${ids[index]}-model-01.png`);
  const bytes=fs.readFileSync(path.join(root,'public',product.modelImage));
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16),1122);assert.equal(bytes.readUInt32BE(20),1402);
 }
 assert.deepEqual(withBundledModelPhotos(derived),derived,'Repeated reads are idempotent');
 const reversed=clone();reversed.products.reverse();
 for(const product of withBundledModelPhotos(reversed).products)assert.equal(product.modelImage,`/assets/${product.id}-model-01.png`);
 const custom=clone();custom.products[0].modelImage='/media/abcdef01-2345-6789-abcd-ef0123456789.webp';custom.products[0].modelFocus='center';
 assert.deepEqual(withBundledModelPhotos(custom).products[0],custom.products[0],'Administrator photo wins');
 const removed=clone();removed.products[0].modelImage=null;
 assert.equal(contentSchema.safeParse(removed).success,true);assert.equal(withBundledModelPhotos(removed).products[0].modelImage,null,'Explicit removal must survive reads');
 for(const replacement of [{id:'unrelated'},{image:'/assets/campaign.png'},{crop:'right'}]){
  const changed=clone();Object.assign(changed.products[0],replacement);
  assert.equal(withBundledModelPhotos(changed).products[0].modelImage,undefined,'Never apply a model to a changed product packshot/ID');
 }
 const initial=await readStore();assert.deepEqual(initial.content,derived);assert.equal(initial.revision,0);assert.equal(row,null,'An empty read never seeds storage');
 row={data:raw,revision:17,updated_at:'2026-10-15T00:00:00Z'};
 const snapshot=structuredClone(row);
 const result=await readStore();assert.equal(result.revision,17);assert.equal(result.updatedAt,row.updated_at);assert.deepEqual(result.content,derived);assert.deepEqual(row,snapshot,'Read must not overwrite stored JSON/revision');
 row={...row,data:JSON.stringify(removed)};
 assert.equal((await readStore()).content.products[0].modelImage,null);assert.equal((await readStore()).content.products[0].modelImage,null);
 const hidden=clone();hidden.products[1].visible=false;row={...row,data:JSON.stringify(hidden)};
 const response=await publicRoute.GET();assert.equal(response.status,200);
 const published=await response.json();assert.equal(published.revision,17);assert.equal(published.content.products.length,3);assert(!published.content.products.some(product=>product.id==='shell'));
 assert.equal(row.data,JSON.stringify(hidden));assert(reads>=5);
 console.log('PASS: four original PNGs, exact ID mapping, reorder stability, administrator overrides/removal, image guard, idempotent read-only storage, unchanged revision and public hidden-product filtering.');
})().catch(error=>{console.error(error);process.exitCode=1});

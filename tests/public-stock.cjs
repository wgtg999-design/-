// Real SQL-backed public inventory privacy checks with isolated synthetic data.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync(':memory:');
for(const file of fs.readdirSync('drizzle').filter(file=>file.endsWith('.sql')).sort())db.exec(fs.readFileSync(path.join('drizzle',file),'utf8'));
let identity=null;
const owner={userId:'stock-test-owner',email:'owner@example.test'};
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
const commerce=load('lib/commerce.ts'),contentApi=load('app/api/admin/content/route.ts'),{defaults}=load('lib/content.ts');
const get=new Request('https://shop.test/api/shop?view=stock');
const post=body=>new Request('https://shop.test/api/admin/commerce',{method:'POST',headers:{origin:'https://shop.test','content-type':'application/json'},body:JSON.stringify(body)});
const put=(content,revision)=>new Request('https://shop.test/api/admin/content',{method:'PUT',headers:{origin:'https://shop.test','content-type':'application/json'},body:JSON.stringify({content,revision})});

(async()=>{
  identity=owner;
  const catalog=structuredClone(defaults);
  catalog.products[0].sizes.push('REMOVED');
  catalog.products[1].visible=false;
  catalog.products.push({...structuredClone(catalog.products[0]),id:'stock-deleted-product',name:'Synthetic deleted product',sizes:['M'],visible:true});
  assert.equal((await contentApi.PUT(put(catalog,0))).status,200);
  const fixtures=[
    {id:'jacket',size:'M',stock:7,maxOrder:2,enabled:true},
    {id:'jacket',size:'S',stock:0,maxOrder:3,enabled:false},
    {id:'jacket',size:'REMOVED',stock:11,maxOrder:3,enabled:true},
    {id:'shell',size:'M',stock:13,maxOrder:3,enabled:true},
    {id:'stock-deleted-product',size:'M',stock:17,maxOrder:3,enabled:true},
  ];
  for(const fixture of fixtures){
    const response=await commerce.adminPost(post({action:'stock',revision:0,...fixture}));
    assert.equal(response.status,200,await response.text());
  }
  catalog.products[0].sizes=catalog.products[0].sizes.filter(size=>size!=='REMOVED');
  catalog.products=catalog.products.filter(product=>product.id!=='stock-deleted-product');
  assert.equal((await contentApi.PUT(put(catalog,1))).status,200);
  identity=null;
  const response=await commerce.shopGet(get);assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  const inventory=(await response.json()).inventory.sort((a,b)=>a.sku.localeCompare(b.sku));
  assert.deepEqual(inventory,[
    {sku:'jacket:M',stock:7,maxOrder:2,enabled:true},
    {sku:'jacket:S',stock:0,maxOrder:3,enabled:false},
  ]);
  assert.equal((await commerce.adminGet(get)).status,403);
  identity=owner;
  const administrator=(await (await commerce.adminGet(get)).json()).inventory;
  assert.equal(administrator.length,5,'Admin retains hidden and historical stock rows');
  assert(administrator.some(row=>row.sku==='shell:M'));
  assert(administrator.some(row=>row.sku==='jacket:REMOVED'));
  assert(administrator.some(row=>row.sku==='stock-deleted-product:M'));
  assert.equal(db.prepare('SELECT count(*) AS n FROM shop_inventory').get().n,5,'Filtering must not delete inventory');
  console.log('PASS: anonymous stock lists only visible products/current sizes, excludes hidden/deleted products and removed sizes, retains disabled visible sizes and all administrative inventory without deleting rows.');
  db.close();
})().catch(error=>{console.error(error);db.close();process.exitCode=1});

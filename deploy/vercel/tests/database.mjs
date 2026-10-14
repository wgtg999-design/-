import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import ts from 'typescript';
import { initializeDatabase } from '../scripts/migrate.mjs';
import { columns, tables, format, assertInitialized } from '../scripts/database-tools.mjs';
import { validateSnapshot, importSnapshot } from '../scripts/import-data.mjs';
import { validateMappings, verifiedProviderEmail, linkIdentities } from '../scripts/link-identities.mjs';
import { exportSnapshot, cloudflareQuery } from '../scripts/export-data.mjs';

const runtimeFile = fileURLToPath(new URL('../runtime/database.ts',import.meta.url));
const require = createRequire(runtimeFile);
function compile(source,file) {
  const module = new Module(file);
  module.paths = Module._nodeModulePaths(path.dirname(file));
  module._compile(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
  return module.exports;
}
const { createDatabase,validateDatabaseUrl,getDatabase } = compile(await fs.readFile(runtimeFile,'utf8'),runtimeFile);
const root = fileURLToPath(new URL('../../../',import.meta.url));
const { createPlan,updatePlan } = compile(await fs.readFile(path.join(root,'lib/order-sql.ts'),'utf8'),path.join(root,'lib/order-sql.ts'));
const { defaults } = compile(await fs.readFile(path.join(root,'lib/content.ts'),'utf8'),path.join(root,'lib/content.ts'));
const folder = await fs.mkdtemp(path.join(os.tmpdir(),'street-label-db-tests-'));
let cases=0;
async function check(label,fn) { await fn(); cases++; console.log('PASS '+label); }
function local(name) { return createClient({url:'file:'+path.join(folder,name+'.db'),intMode:'number'}); }
const client = local('main'), db = createDatabase(client);

const fixture = {
  format,
  tables:{
    store_content:[{key:'main',data:JSON.stringify(defaults),revision:1,updated_at:'2026-10-14T00:00:00.000Z'}],
    store_owner:[{key:'owner',user_id:'old-owner'}],
    shop_customers:[{user_id:'old-member',email:'member@example.test',name:'테스트 회원',phone:'01012345678',consent_version:1,created_at:'2026-10-14T00:00:00.000Z'}],
    shop_inventory:[{sku:'jacket:S',product_id:'jacket',size:'S',stock:1,max_order:3,enabled:1,revision:1}],
    shop_settings:[{key:'main',data:JSON.stringify({accepting:true,shippingFee:0,bankInfo:'TEST ONLY',support:'TEST ONLY',terms:'TEST ONLY',privacy:'TEST ONLY',returnGuide:'TEST ONLY'}),revision:1}],
    shop_orders:[],shop_events:[],
  },
};

try {
  await check('hosted URL validation rejects local/http/credentials/query and missing secrets',async()=>{
    for (const url of ['file:/tmp/db','http://db.example.test','libsql://secret@db.example.test','https://db.example.test?authToken=secret','https://db.example.test/#x',undefined]) assert.throws(()=>validateDatabaseUrl(url));
    assert.equal(validateDatabaseUrl('libsql://db.example.test'),'libsql://db.example.test');
    const oldURL=process.env.TURSO_DATABASE_URL, oldToken=process.env.TURSO_AUTH_TOKEN;
    delete process.env.TURSO_DATABASE_URL; delete process.env.TURSO_AUTH_TOKEN;
    assert.throws(()=>getDatabase(),/TURSO_DATABASE_URL/);
    if(oldURL!==undefined)process.env.TURSO_DATABASE_URL=oldURL;
    if(oldToken!==undefined)process.env.TURSO_AUTH_TOKEN=oldToken;
  });

  await check('new-only initialization and unchanged migration repeat',async()=>{
    assert.deepEqual(await initializeDatabase(client),{initialized:true,migrations:4});
    assert.deepEqual(await initializeDatabase(client),{initialized:false,migrations:4});
    await assertInitialized(client);
    const foreign=local('foreign');
    try{await foreign.execute('CREATE TABLE existing(value TEXT)');await assert.rejects(()=>initializeDatabase(foreign),/empty/);assert.equal((await foreign.execute('SELECT count(*) AS n FROM existing')).rows[0].n,0);}finally{foreign.close();}
  });

  await check('snapshot allowlist, exact columns and references reject malformed exports',async()=>{
    assert.equal(validateSnapshot(fixture).shop_inventory[0].stock,1);
    for(const mutate of [x=>x.tables.unknown=[],x=>delete x.tables.shop_orders,x=>x.tables.shop_customers[0].extra='x',x=>x.tables.shop_inventory[0].stock=-1,x=>x.tables.shop_events.push({id:1,order_id:'missing',actor:'x',action:'x',note:'x',created_at:'x'})]){const x=structuredClone(fixture);mutate(x);assert.throws(()=>validateSnapshot(x));}
  });

  await check('transactional import preserves original IDs and refuses all overwrites',async()=>{
    const counts=await importSnapshot(client,fixture);
    assert.equal(counts.shop_customers,1);
    assert.equal((await db.prepare('SELECT * FROM shop_customers WHERE user_id=?').bind('old-member').first()).name,'테스트 회원');
    await assert.rejects(()=>importSnapshot(client,fixture),/zero shop rows/);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM shop_customers').first()).n,1);
  });

  await check('failed import rolls back previously inserted table rows',async()=>{
    const broken=local('broken');
    try{await initializeDatabase(broken);const invalid=structuredClone(fixture);invalid.tables.shop_customers.push({...invalid.tables.shop_customers[0]});await assert.rejects(()=>importSnapshot(broken,invalid));for(const table of tables)assert.equal((await broken.execute(`SELECT count(*) AS n FROM "${table}"`)).rows[0].n,0);}finally{broken.close();}
  });

  await check('D1-shaped bound first/all/run meta and parameter injection safety',async()=>{
    assert.equal(await db.prepare('SELECT user_id FROM shop_customers WHERE user_id=?').bind("' OR 1=1 --").first(),null);
    assert.equal(await db.prepare('SELECT user_id FROM shop_customers').first('user_id'),'old-member');
    const all=await db.prepare('SELECT * FROM shop_customers').all();assert.equal(all.results.length,1);assert.equal(all.success,true);
    const run=await db.prepare('UPDATE shop_customers SET phone=? WHERE user_id=?').bind('01000000000','old-member').run();assert.equal(run.meta.changes,1);
    assert.throws(()=>db.prepare('SELECT ?').bind(undefined),/Unsupported/);
    assert.deepEqual(await db.batch([]),[]);
  });

  await check('remote SDK failures never expose service URL, token or diagnostic detail',async()=>{
    const privateError=new Error('failed https://database.example.test/private?token=secret SDK private diagnostic');
    const fake={execute:async()=>{throw privateError;},batch:async()=>{throw privateError;}};
    const guarded=createDatabase(fake);
    for(const run of [()=>guarded.prepare('SELECT 1').first(),()=>guarded.prepare('SELECT 1').all(),()=>guarded.prepare('SELECT 1').run(),()=>guarded.batch([guarded.prepare('SELECT 1')])]) {
      await assert.rejects(run,error=>{assert.equal(error.message,'SQLITE database operation failed.');assert.equal(error.cause,undefined);return true;});
    }
    const marked=createDatabase({execute:async()=>{throw Error('SQL failed: OUT_OF_STOCK secret=https://private');},batch:async()=>{throw Error('PENDING_LIMIT internal diagnostic');}});
    await assert.rejects(()=>marked.prepare('SELECT 1').first(),error=>error.message==='OUT_OF_STOCK');
    await assert.rejects(()=>marked.batch([marked.prepare('SELECT 1')]),error=>error.message==='PENDING_LIMIT');
  });

  await check('upload ticket SQLite constraints and owner/expiry/status CAS are enforced',async()=>{
    const now=Date.now(),sql='INSERT INTO store_upload_tickets(id,user_id,object_key,content_type,byte_length,expires_at,status) VALUES(?,?,?,?,?,?,?)';
    const inserted=await db.prepare(sql).bind('ticket-1','old-owner','_uploads/test/ticket-1','image/png',8,now+60000,'pending').run();assert.equal(inserted.meta.changes,1);
    const cas="UPDATE store_upload_tickets SET status='processing' WHERE id=? AND user_id=? AND status='pending' AND expires_at>?";
    assert.equal((await db.prepare(cas).bind('ticket-1','other-owner',now).run()).meta.changes,0);
    assert.equal((await db.prepare(cas).bind('ticket-1','old-owner',now+120000).run()).meta.changes,0);
    assert.equal((await db.prepare(cas).bind('ticket-1','old-owner',now).run()).meta.changes,1);
    assert.equal((await db.prepare(cas).bind('ticket-1','old-owner',now).run()).meta.changes,0);
    assert.equal((await db.prepare("UPDATE store_upload_tickets SET status='complete',final_key=? WHERE id=? AND status='processing'").bind('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png','ticket-1').run()).meta.changes,1);
    for(const args of [['bad-size','old-owner','_uploads/bad1','image/png',8388609,now,'pending'],['bad-type','old-owner','_uploads/bad2','image/svg+xml',8,now,'pending'],['bad-status','old-owner','_uploads/bad3','image/png',8,now,'fake']])await assert.rejects(()=>db.prepare(sql).bind(...args).run());
  });

  const lines=JSON.stringify([{sku:'jacket:S',id:'jacket',name:'TEST',size:'S',qty:1,price:129000}]);
  function plan(id,key){return createPlan({id,userId:'old-member',key,lines,address:'{}',total:129000,shippingFee:0,catalogRevision:1,settingsRevision:1,now:'2026-10-14T00:00:00.000Z'});}
  const statements=items=>items.map(item=>db.prepare(item.sql).bind(...item.args));

  await check('actual SQLite JSON order batch atomically records order, stock and audit',async()=>{
    const result=await db.batch(statements(plan('order-1','request-1')));assert.equal(result[0].meta.changes,1);
    assert.equal((await db.prepare('SELECT stock FROM shop_inventory').first()).stock,0);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM shop_events').first()).n,1);
  });

  await check('last-unit simultaneous orders accept one and never make negative stock',async()=>{
    await db.prepare('UPDATE shop_inventory SET stock=1,revision=revision+1').run();
    const two=await Promise.all([db.batch(statements(plan('order-2','request-2'))),db.batch(statements(plan('order-3','request-3')))]);
    assert.equal(two.filter(rows=>rows[0].meta.changes===1).length,1);
    assert.equal((await db.prepare('SELECT stock FROM shop_inventory').first()).stock,0);
  });

  await check('failed write batch rolls back stock and earlier statements',async()=>{
    await assert.rejects(()=>db.batch([db.prepare('UPDATE shop_inventory SET stock=5'),db.prepare("INSERT INTO shop_inventory(sku,product_id,size,stock,max_order,enabled,revision) VALUES('jacket:S','jacket','S',1,3,1,0)")]));
    assert.equal((await db.prepare('SELECT stock FROM shop_inventory').first()).stock,0);
  });

  await check('operation-token CAS restores once; stale transitions cannot audit or restore',async()=>{
    const order=await db.prepare('SELECT * FROM shop_orders WHERE id=?').bind('order-1').first();
    const next={...order,status:'cancelled',payment:'awaiting_payment',restock:0};
    const cancel=updatePlan(order,next,'old-member','TEST CANCEL','token-1','2026-10-14T01:00:00.000Z');
    assert.equal((await db.batch(statements(cancel)))[0].meta.changes,1);
    const before=await db.prepare('SELECT count(*) AS n FROM shop_events').first();
    const stale=updatePlan(order,next,'old-member','STALE','token-2','2026-10-14T01:00:01.000Z');
    assert.equal((await db.batch(statements(stale)))[0].meta.changes,0);
    assert.equal((await db.prepare('SELECT stock FROM shop_inventory').first()).stock,1);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM shop_events').first()).n,before.n);
  });

  await check('verified primary Clerk email is mandatory; forged identity email fails',async()=>{
    process.env.CLERK_SECRET_KEY='sk_test_unit_only';
    const provider={id:'user_member',primary_email_address_id:'primary',email_addresses:[{id:'primary',email_address:'member@example.test',verification:{status:'verified'}}]};
    const good=async(_url,options)=>{assert.equal(options.headers.Authorization,'Bearer sk_test_unit_only');return {ok:true,json:async()=>provider};};
    assert.equal(await verifiedProviderEmail('user_member',good),'member@example.test');
    await assert.rejects(()=>verifiedProviderEmail('user_member',async()=>({ok:true,json:async()=>({...provider,email_addresses:[{...provider.email_addresses[0],verification:{status:'unverified'}}]})})),/verified/);
    await assert.rejects(()=>verifiedProviderEmail('user_other',good),/verified/);
    delete process.env.CLERK_SECRET_KEY;
  });

  await check('explicit links verify legacy email, preserve IDs and forbid reassignment',async()=>{
    const mapping=[{providerUserId:'user_member',legacyUserId:'old-member'}];
    const verifyEmail=async()=> 'member@example.test';
    await assert.rejects(()=>linkIdentities(client,mapping,{apply:true,verifyEmail:async()=> 'foreign@example.test'}),/does not match/);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM auth_identity_links').first()).n,0);
    assert.deepEqual(await linkIdentities(client,mapping,{apply:false,verifyEmail}),{checked:1,linked:0});
    await linkIdentities(client,mapping,{apply:true,verifyEmail});
    await linkIdentities(client,mapping,{apply:true,verifyEmail});
    assert.equal((await db.prepare('SELECT legacy_user_id FROM auth_identity_links WHERE provider_user_id=?').bind('user_member').first()).legacy_user_id,'old-member');
    await assert.rejects(()=>linkIdentities(client,[{providerUserId:'user_other',legacyUserId:'old-member'}],{apply:true,verifyEmail}),/reassigned/);
    assert.throws(()=>validateMappings([...mapping,...mapping]),/Duplicate/);
    await assert.rejects(()=>linkIdentities(client,[{providerUserId:'user_missing',legacyUserId:'missing'}],{verifyEmail}),/does not exist/);
  });

  await check('concurrent reassignment constraint rolls back the complete link batch',async()=>{
    await assert.rejects(()=>client.batch([
      {sql:"INSERT INTO auth_identity_links(provider_user_id,legacy_user_id,verified_at) VALUES('user_owner','old-owner','TEST')",args:[]},
      {sql:"INSERT INTO auth_identity_links(provider_user_id,legacy_user_id,verified_at) VALUES('user_member','old-owner','TEST') ON CONFLICT(provider_user_id) DO UPDATE SET legacy_user_id=CASE WHEN auth_identity_links.legacy_user_id=excluded.legacy_user_id THEN auth_identity_links.legacy_user_id ELSE NULL END",args:[]},
    ],'write'));
    assert.equal(await db.prepare("SELECT * FROM auth_identity_links WHERE provider_user_id='user_owner'").first(),null);
  });

  await check('read-only export queries only fixed tables and detects changing revision',async()=>{
    const calls=[];
    const query=async(sql,args=[])=>{assert.match(sql,/^SELECT /);calls.push(sql);return (await client.execute({sql,args})).rows.map(row=>({...row}));};
    const snapshot=await exportSnapshot(query);
    assert.equal(snapshot.tables.shop_customers[0].user_id,'old-member');
    assert.equal(snapshot.tables.shop_orders.length,2);
    assert.equal(snapshot.tables.shop_events.length,3);
    assert.ok(calls.every(sql=>!sql.includes('auth_identity_links')));
    let changed=false;
    await assert.rejects(()=>exportSnapshot(async(sql,args=[])=>{const rows=await query(sql,args);if(!changed && /FROM "shop_events" ORDER BY/.test(sql)){changed=true;await db.prepare('UPDATE store_content SET revision=revision+1').run();}return rows;}),/changed/);
  });

  await check('Cloudflare export transport uses fixed API endpoint and bound read queries',async()=>{
    process.env.CLOUDFLARE_ACCOUNT_ID='a'.repeat(32);process.env.CLOUDFLARE_D1_DATABASE_ID='11111111-1111-1111-1111-111111111111';process.env.CLOUDFLARE_API_TOKEN='test-read-only';
    const query=cloudflareQuery(async(url,options)=>{assert.match(url,/^https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/a{32}\/d1\/database\/11111111-1111-1111-1111-111111111111\/query$/);assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),{sql:'SELECT count(*) AS n FROM "shop_customers"',params:[]});return {ok:true,json:async()=>({success:true,result:[{success:true,results:[{n:1}]}]})};});
    assert.deepEqual(await query('SELECT count(*) AS n FROM "shop_customers"'),[{n:1}]);
    await assert.rejects(()=>query('DELETE FROM shop_customers'),/SELECT only/);
    await assert.rejects(()=>query('SELECT 1; DELETE FROM shop_customers'),/SELECT only/);
    delete process.env.CLOUDFLARE_ACCOUNT_ID;delete process.env.CLOUDFLARE_D1_DATABASE_ID;delete process.env.CLOUDFLARE_API_TOKEN;
  });

  console.log(`Database migration and adapter: ${cases} scenarios passed. Isolated local SQLite only; no live credentials or data were used.`);
} finally {
  client.close();
  await fs.rm(folder,{recursive:true,force:true});
}

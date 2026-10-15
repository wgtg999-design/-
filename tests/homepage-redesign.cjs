const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),vm=require('node:vm'),ts=require('typescript');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),mod={exports:{}};
vm.runInThisContext('(function(require,module,exports){'+ts.transpileModule(fs.readFileSync(path.join(root,'lib/content.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText+'})')(require,mod,mod.exports);
const {defaults,contentSchema}=mod.exports;
let content=structuredClone(defaults),revision=1;
content.products=Array.from({length:12},(_,i)=>({...defaults.products[i%4],id:'item'+i}));
content.homepage={banners:content.heroImages.map((_,i)=>({href:'/?category='+['OUTER','BOTTOMS'][i]+'#shop',mobileImage:null})),slider01:content.products.slice(0,10).map(p=>p.id),slider02:content.products.slice(2,12).map(p=>p.id),campaign:{image:null,mobileImage:null},journals:['OUTER','TOPS','BOTTOMS'].map(category=>({category,image:null,mobileImage:null}))};
assert(contentSchema.safeParse(defaults).success);assert(contentSchema.safeParse(content).success);
assert(!contentSchema.safeParse({...content,homepage:{...content.homepage,slider01:Array(11).fill('item0')}}).success);
assert(!contentSchema.safeParse({...content,homepage:{...content.homepage,slider01:['item0','item0']}}).success);
assert(!contentSchema.safeParse({...content,homepage:{...content.homepage,banners:[{href:'//evil.test'}]}}).success);
const errors=[];
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');
 const send=(value,type='application/json')=>{res.setHeader('Content-Type',type);res.end(type==='application/json'?JSON.stringify(value):value)};
 if(url.pathname==='/api/content')return send({content:{...content,products:content.products.filter(p=>p.visible)},revision});
 if(url.pathname==='/api/admin/content'){
  if(req.method==='PUT'){let body='';for await(const chunk of req)body+=chunk;const data=JSON.parse(body);content=contentSchema.parse(data.content);revision++;}
  return send({content,revision,updatedAt:new Date().toISOString()});
 }
 if(url.pathname==='/api/admin/upload')return send({url:'/assets/campaign.png'});
 if(url.pathname==='/api/session')return send({isAdmin:true});
 if(url.pathname==='/api/policies')return send({});
 if(url.pathname==='/api/shop')return send(url.searchParams.get('view')==='stock'?{inventory:content.products.flatMap(p=>p.sizes.map(size=>({sku:p.id+':'+encodeURIComponent(size),enabled:true,stock:5,maxOrder:3})))}:{settings:{}});
 if(url.pathname==='/'||url.pathname==='/admin')return send(fs.readFileSync(path.join(root,'legacy',url.pathname==='/'?'store.html':'admin.html')),'text/html');
 const file=path.join(root,'public',url.pathname);if(file.startsWith(path.join(root,'public')+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return send(fs.readFileSync(file),file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'image/png');res.statusCode=404;res.end();
});
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox'],headless:true});try{
const origin='http://127.0.0.1:'+server.address().port;
const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.waitForSelector('#products .product-card');
assert.equal(await page.locator('#products .product-card').count(),10);assert.equal(await page.locator('#products-secondary .product-card').count(),10);
const dimensions=await page.locator('#products').evaluate(el=>({width:el.clientWidth,card:el.firstElementChild.getBoundingClientRect().width,gap:getComputedStyle(el).gap,padding:getComputedStyle(el).padding}));assert(Math.abs(dimensions.card*3-dimensions.width)<2);assert.equal(dimensions.gap,'0px');assert.equal(dimensions.padding,'0px');
assert(await page.locator('#editorial-campaign').isHidden());assert.equal(await page.locator('#journal-categories a').count(),3);
const before=await page.locator('#hero-photo').getAttribute('src');await page.hover('#site-sidebar .logo');await page.waitForTimeout(4600);assert.notEqual(await page.locator('#hero-photo').getAttribute('src'),before);assert((await page.locator('#hero-link').getAttribute('href')).includes('BOTTOMS'));
await page.hover('.hero');const held=await page.locator('#hero-photo').getAttribute('src');await page.waitForTimeout(4400);assert.equal(await page.locator('#hero-photo').getAttribute('src'),held);
await page.locator('#products').scrollIntoViewIfNeeded();await page.hover('#products .product-card:first-child');assert.equal(await page.locator('#products .quick-panel').first().evaluate(el=>getComputedStyle(el).pointerEvents),'auto');
await page.locator('#products .quick-panel button').first().click();await page.selectOption('#size','S');await page.click('#add');assert(await page.locator('#bag-dialog').isVisible());assert.equal(await page.locator('#bag-count').textContent(),'1');await page.click('#continue');
await page.locator('#products').scrollIntoViewIfNeeded();const bounds=await page.locator('#products').boundingBox();await page.mouse.move(bounds.x+bounds.width*.8,bounds.y+80);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width*.3,bounds.y+80,{steps:15});await page.mouse.up();assert(await page.locator('#products').evaluate(el=>el.scrollLeft>50));assert.equal(await page.locator('#products-secondary').evaluate(el=>el.scrollLeft),0);
await page.locator('[data-journal-category="BOTTOMS"]').click();assert((await page.locator('#products .product-card').count())>0);assert((await page.url()).includes('category=BOTTOMS'));
await page.goto(origin+'/admin');await page.waitForSelector('#homepage-editor h2');await page.locator('[data-home-field="banners"][data-home-index="0"]').fill('/?category=TOPS#shop');await page.locator('[data-home-slider="slider02"]').fill('item3, item2');await page.locator('[data-home-upload="campaign"][data-home-key="image"]').setInputFiles({name:'isolated-fixture.png',mimeType:'image/png',buffer:fs.readFileSync(path.join(root,'public/assets/campaign.png'))});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('업로드 완료'));await page.click('#save');await page.waitForFunction(()=>document.querySelector('#save-state').textContent.includes('저장 완료'));await page.reload();await page.waitForSelector('#homepage-editor h2');assert.equal(await page.locator('[data-home-slider="slider02"]').inputValue(),'item3, item2');assert.equal(content.homepage.banners[0].href,'/?category=TOPS#shop');assert.equal(content.homepage.campaign.image,'/assets/campaign.png');
await page.locator('[data-action="hero-down"][data-index="0"]').click();await page.click('#save');await page.waitForFunction(()=>document.querySelector('#save-state').textContent.includes('저장 완료'));assert.equal(content.homepage.banners[1].href,'/?category=TOPS#shop');
content.homepage.campaign={image:'/assets/campaign.png',mobileImage:'/assets/campaign-wide.png'}; // Synthetic layout fixture only: never a production campaign substitute.
const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(origin);await mobile.waitForSelector('#products .product-card');await mobile.locator('#editorial-campaign img').evaluate(img=>img.decode());
assert(await mobile.locator('#editorial-campaign').isVisible());assert((await mobile.locator('#editorial-campaign img').evaluate(el=>el.currentSrc)).includes('campaign-wide.png'));
const sizes=await mobile.locator('#products').evaluate(el=>({width:el.clientWidth,card:el.firstElementChild.getBoundingClientRect().width}));assert(Math.abs(sizes.card*2-sizes.width)<2);assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await mobile.locator('#products .quick-panel').first().evaluate(el=>getComputedStyle(el).opacity),'1');
await mobile.locator('#products').scrollIntoViewIfNeeded();await mobile.locator('#products').evaluate(el=>el.scrollLeft=0);const touchBounds=await mobile.locator('#products').boundingBox(),cdp=await mobile.context().newCDPSession(mobile);const touchY=Math.max(80,touchBounds.y+80);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:340,y:touchY}]});for(let x=320;x>=70;x-=25)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:touchY}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await mobile.waitForTimeout(400);assert(await mobile.locator('#products').evaluate(el=>el.scrollLeft>0));assert.equal(await mobile.locator('#products-secondary').evaluate(el=>el.scrollLeft),0);
assert.deepEqual(errors,[]);console.log('PASS: schema compatibility/rejections; 10-item independent rails; desktop thirds/zero gap; four-second rotation and hover pause; per-banner link; QUICK ADD option/stock/cart; real mouse drag; category routing; synthetic admin upload/save/reload and banner reorder; mobile halves/overflow/native scroll; campaign desktop/mobile fixture; zero browser errors.');
}finally{await browser.close();server.close();}})().catch(error=>{console.error(error);server.close();process.exitCode=1});

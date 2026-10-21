import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { DatabaseAdapter } from './database';
import type { Content } from '../lib/content';
import { MAX_INPUT, TryOnError, readBounded, normalizeImage, imageData } from './tryon-images';
import type { TryOnProvider } from './tryon-provider';
import { tryOnSchema, POLICY_VERSION, JOB_TTL, CREDIT_MICRO_USD, defaultTryOnSettings, privateHeaders, type TryOnSettings } from './tryon-schema';
const settingsSchema=z.object({enabled:z.boolean(),allowGuests:z.boolean(),perUserDaily:z.number().int().min(1).max(20),guestDaily:z.number().int().min(1).max(3),dailyLimit:z.number().int().min(1).max(1000),dailyBudgetCents:z.number().int().min(8).max(10000)}).strict();
type Job={id:string;day:string;subject:string|null;request_key:string|null;provider_id:string|null;status:string;cancelled:number;created_at:number;expires_at:number;last_poll:number;credits:number|null};
type Actor={id:string;guest:boolean;cookie?:string};
type Deps={database:()=>DatabaseAdapter;account:()=>Promise<{userId:string}|null>;owner:()=>Promise<boolean>;trusted:(origin:string|null)=>boolean;configuration:()=>{key?:string;secret?:string};provider:()=>TryOnProvider;catalog:()=>Promise<{content:Content}>;stocks:()=>Promise<Array<{sku:string;enabled:unknown;stock:unknown;max_order?:unknown;maxOrder?:unknown}>>;garment:(product:Content['products'][number])=>Promise<Uint8Array>;now?:()=>number};
function fail(status:number,message:string):never{throw new TryOnError(status,message);}
export function categoryOf(product:Content['products'][number]):'tops'|'bottoms'|null{
 if(product.tryOnEnabled===false)return null;
 if(product.tryOnCategory)return product.tryOnCategory;
 return ['BOTTOMS','SKIRTS'].includes(product.category)?'bottoms':['OUTER','TOPS','TSHIRT','KNITWEAR','HOODIES'].includes(product.category)?'tops':null;
}
export function createTryOnService(deps:Deps){
 const now=()=>deps.now?.()??Date.now();
 const db=()=>deps.database();
 const day=()=>new Date(now()).toISOString().slice(0,10); // UTC billing day, shown explicitly in admin.
 const json=(data:unknown,status=200,cookie?:string)=>Response.json(data,{status,headers:{...privateHeaders,...(cookie?{'Set-Cookie':cookie}:{})}});
 function configuration(){const c=deps.configuration();return {ready:!!c.key?.trim()&&!!c.secret&&Buffer.byteLength(c.secret)>=32,...c};}
 function digest(value:string){const secret=configuration().secret;if(!secret||Buffer.byteLength(secret)<32)fail(503,'가상 피팅 연결을 준비 중입니다.');return createHmac('sha256',secret!).update(value).digest('hex');}
 function origin(req:Request){if(!deps.trusted(req.headers.get('origin'))||req.headers.get('origin')!==new URL(req.url).origin)fail(403,'쇼핑몰 화면에서 다시 시도해 주세요.');}
 async function actor(req:Request,allowGuests:boolean,issue=false):Promise<Actor>{
  const user=await deps.account();if(user)return {id:'member:'+user.userId,guest:false};
  if(!allowGuests)fail(401,'로그인 후 가상 피팅을 이용해 주세요.');
  const value=req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('store_tryon_guest='))?.split('=')[1]??'';
  const parts=value.split('.');
  if(parts.length===3&&/^[a-f0-9]{48}$/.test(parts[0])&&/^\d{13}$/.test(parts[1])&&/^[a-f0-9]{64}$/.test(parts[2])&&Number(parts[1])>now()&&Number(parts[1])<=now()+86400000){
   const expected=Buffer.from(digest('guest:'+parts[0]+'.'+parts[1]));if(timingSafeEqual(expected,Buffer.from(parts[2])))return {id:'guest:'+parts[0],guest:true};
  }
  if(!issue)fail(401,'가상 피팅 창을 다시 열어 주세요.');
  const token=randomBytes(24).toString('hex'),expiry=now()+86400000,signed=token+'.'+expiry+'.'+digest('guest:'+token+'.'+expiry);
  return {id:'guest:'+token,guest:true,cookie:`store_tryon_guest=${signed}; Path=/api/try-on; HttpOnly; SameSite=Strict; Max-Age=86400${new URL(req.url).protocol==='https:'?'; Secure':''}`};
 }
 const subject=(a:Actor,d:string)=>digest('subject:'+d+':'+a.id);
 async function settings(){const r=await db().prepare("SELECT data,revision FROM store_tryon_settings WHERE key='main'").first<{data:string;revision:number}>();if(!r)fail(503,'관리자에서 가상 피팅 저장소를 먼저 준비해 주세요.');return {settings:settingsSchema.parse(JSON.parse(r!.data)),revision:r!.revision};}
 async function available(){const s=await settings();if(!configuration().ready||!s.settings.enabled)fail(503,'가상 피팅 서비스를 준비 중입니다. 지금은 사진이 전송되지 않습니다.');return s;}
 async function cleanup(){
  const today=day();
  // Image bytes are never stored. Expired prediction IDs are scrubbed on all
  // feature/admin activity and a protected cron; ownership hashes rotate daily.
  // Yesterday's attempts move atomically into non-identifying aggregates.
  await db().batch([
   db().prepare("UPDATE store_tryon_jobs SET provider_id=NULL,request_key=NULL,status=CASE WHEN status IN ('starting','in_queue','processing','submitting') THEN 'unknown' ELSE status END WHERE expires_at<=?").bind(now()),
   db().prepare("INSERT INTO store_tryon_daily(day,attempts,completed,failed,unknown,credits) SELECT day,COUNT(*),SUM(status='completed'),SUM(status='failed'),SUM(status NOT IN ('completed','failed')),COALESCE(SUM(credits),0) FROM store_tryon_jobs WHERE day<? AND expires_at<=? GROUP BY day ON CONFLICT(day) DO UPDATE SET attempts=store_tryon_daily.attempts+excluded.attempts,completed=store_tryon_daily.completed+excluded.completed,failed=store_tryon_daily.failed+excluded.failed,unknown=store_tryon_daily.unknown+excluded.unknown,credits=store_tryon_daily.credits+excluded.credits").bind(today,now()),
   db().prepare('DELETE FROM store_tryon_jobs WHERE day<? AND expires_at<=?').bind(today,now()),
   db().prepare('DELETE FROM store_tryon_daily WHERE day<?').bind(new Date(now()-30*86400000).toISOString().slice(0,10))
  ]);
 }
 async function ownJob(req:Request,id:string){
  if(!/^[a-f0-9-]{36}$/.test(id))fail(404,'피팅 요청을 찾을 수 없습니다.');
  const {settings:s}=await settings(),a=await actor(req,s.allowGuests);
  const j=await db().prepare('SELECT * FROM store_tryon_jobs WHERE id=?').bind(id).first<Job>();
  if(!j||j.subject!==subject(a,j.day))fail(404,'피팅 요청을 찾을 수 없습니다.');return j!;
 }
 async function safe(operation:()=>Promise<Response>){try{return await operation();}catch(e){return json({error:e instanceof TryOnError?e.message:'가상 피팅 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'},e instanceof TryOnError?e.status:503);}}
 return {
  config:(req:Request)=>safe(async()=>{
   if(req.headers.get('sec-fetch-site')==='cross-site')fail(403,'쇼핑몰에서 다시 열어 주세요.');
   let s:{settings:TryOnSettings;revision:number};try{s=await settings();}catch{return json({ready:false,reason:'가상 피팅 연결을 준비 중입니다.',policyVersion:POLICY_VERSION,products:[]});}
   if(!configuration().ready||!s.settings.enabled)return json({ready:false,reason:'가상 피팅 연결을 준비 중입니다. 현재 사진을 전송하지 않습니다.',policyVersion:POLICY_VERSION,products:[]});
   await cleanup();let a:Actor;try{a=await actor(req,s.settings.allowGuests,true);}catch(e){if(e instanceof TryOnError&&e.status===401)return json({ready:true,loginRequired:true,policyVersion:POLICY_VERSION,products:[]});throw e;}
   const catalog=await deps.catalog(),inventory=await deps.stocks();const products=catalog.content.products.filter(p=>p.visible&&categoryOf(p)).map(p=>({id:p.id,name:p.name,image:p.tryOnImage||p.image,color:p.color,category:p.category,sizeOptions:p.sizes,stockStatus:p.sizes.some(size=>inventory.some(row=>row.sku===p.id+':'+encodeURIComponent(size)&&!!row.enabled&&Number(row.stock)>0))?'available':'unavailable'}));
   const count=await db().prepare('SELECT COUNT(*) AS n FROM store_tryon_jobs WHERE day=? AND subject=?').bind(day(),subject(a,day())).first<{n:number}>();
   return json({ready:true,loginRequired:false,guest:a.guest,remaining:Math.max(0,(a.guest?s.settings.guestDaily:s.settings.perUserDaily)-(count?.n??0)),policyVersion:POLICY_VERSION,products,maxBytes:MAX_INPUT},200,a.cookie);
  }),
  start:(req:Request)=>safe(async()=>{
   origin(req);const {settings:s}=await available();const a=await actor(req,s.allowGuests);await cleanup();
   if(req.headers.get('x-tryon-consent')!==POLICY_VERSION)fail(400,'외부 AI 사진 처리 안내에 동의해 주세요.');
   const requestKey=req.headers.get('x-request-key')??'';if(!z.string().uuid().safeParse(requestKey).success)fail(400,'요청 식별자가 올바르지 않습니다.');
   const requestHash=digest('request:'+a.id+':'+requestKey);
   const old=await db().prepare('SELECT id,status,cancelled,expires_at FROM store_tryon_jobs WHERE request_key=?').bind(requestHash).first<Job>();
   if(old)return json({id:old.id,status:old.cancelled||old.expires_at<=now()?'expired':old.status},202);
   const id=req.headers.get('x-product-id')??'';const product=(await deps.catalog()).content.products.find(p=>p.id===id&&p.visible);
   const category=product&&categoryOf(product);if(!product||!category)fail(400,'가상 피팅을 지원하는 판매 상품을 선택해 주세요.');
   const mime=req.headers.get('content-type')?.split(';')[0];if(!['image/jpeg','image/png','image/webp'].includes(mime??''))fail(415,'JPG·PNG·WebP 사진만 사용할 수 있습니다.');
   if(Number(req.headers.get('content-length'))>MAX_INPUT)fail(413,'사진은 2.5MB 이하로 선택해 주세요.');
   const incoming=await readBounded(req,MAX_INPUT);let photo:Buffer|null=null;
   try{photo=await normalizeImage(incoming,mime);}finally{incoming.fill(0);}
   let garment:Buffer|null=null;
   try{
    garment=await normalizeImage(await deps.garment(product!),undefined,!product!.tryOnImage&&product!.image==='/assets/products.png'?product!.crop:undefined);
    // Atomic reservation: concurrent requests, settings changes, global/user
    // daily limits, budget and concurrency checked by one SQLite statement.
    const job=randomUUID(),time=now(),attemptDay=new Date(time).toISOString().slice(0,10),subjectHash=subject(a,attemptDay);
    const reserved=await db().prepare(`INSERT INTO store_tryon_jobs(id,day,subject,request_key,status,created_at,expires_at) SELECT ?,?,?,?,'submitting',?,? WHERE
     EXISTS(SELECT 1 FROM store_tryon_settings WHERE key='main' AND json_extract(data,'$.enabled')=1 AND (?=0 OR json_extract(data,'$.allowGuests')=1)
      AND (SELECT COUNT(*) FROM store_tryon_jobs WHERE day=?) < json_extract(data,'$.dailyLimit')
      AND ((SELECT COUNT(*) FROM store_tryon_jobs WHERE day=?)+1)*? <= json_extract(data,'$.dailyBudgetCents')*10000
      AND (SELECT COUNT(*) FROM store_tryon_jobs WHERE day=? AND subject=?) < CASE WHEN ?=1 THEN json_extract(data,'$.guestDaily') ELSE json_extract(data,'$.perUserDaily') END)
     AND NOT EXISTS(SELECT 1 FROM store_tryon_jobs WHERE subject=? AND expires_at>? AND status IN ('submitting','starting','in_queue','processing','unknown'))
     AND (SELECT COUNT(*) FROM store_tryon_jobs WHERE expires_at>? AND status IN ('submitting','starting','in_queue','processing','unknown'))<4
     ON CONFLICT DO NOTHING RETURNING id`).bind(job,attemptDay,subjectHash,requestHash,time,time+JOB_TTL,a.guest?1:0,attemptDay,attemptDay,CREDIT_MICRO_USD,attemptDay,subjectHash,a.guest?1:0,subjectHash,time,time).first<{id:string}>();
    if(!reserved){const replay=await db().prepare('SELECT id,status FROM store_tryon_jobs WHERE request_key=?').bind(requestHash).first<Job>();if(replay)return json({id:replay.id,status:replay.status},202);fail(429,'일일 사용량·예산 한도에 도달했거나 이미 진행 중인 피팅이 있습니다. 잠시 후 또는 내일 다시 시도해 주세요.');}
    try{
     if(req.signal.aborted){await db().prepare("UPDATE store_tryon_jobs SET cancelled=1,status='failed',credits=0 WHERE id=?").bind(job).run();fail(499,'요청이 취소되었습니다.');}
     const prediction=await deps.provider().start(imageData(photo!),imageData(garment!),category!);
     await db().prepare("UPDATE store_tryon_jobs SET provider_id=?,status='starting' WHERE id=? AND cancelled=0").bind(prediction,job).run();
     return json({id:job,status:'starting',expiresAt:time+JOB_TTL},202);
    }catch(error){if(error instanceof TryOnError&&error.status===499)throw error;await db().prepare("UPDATE store_tryon_jobs SET status='unknown' WHERE id=?").bind(job).run();fail(502,'AI 생성 접수를 확인하지 못했습니다. 자동 재전송하지 않았습니다. 요청이 접수된 경우 비용이 발생할 수 있습니다.');}
   }finally{photo?.fill(0);garment?.fill(0);photo=null;garment=null;}
  }),
  poll:(req:Request,id:string)=>safe(async()=>{
   if(!configuration().ready)fail(503,'가상 피팅 연결을 확인해 주세요.');
   const job=await ownJob(req,id);if(job.cancelled||job.expires_at<=now()||!job.provider_id)fail(410,'피팅 요청이 취소되었거나 만료되었습니다.');
   if(job.status==='failed')return json({id,status:'failed',error:'사진에서 착용 대상을 인식하지 못했거나 AI 처리가 실패했습니다. 다른 사진으로 다시 시도해 주세요.'});
   const lock=await db().prepare('UPDATE store_tryon_jobs SET last_poll=? WHERE id=? AND last_poll<=? AND cancelled=0 RETURNING id').bind(now(),id,now()-2000).first();if(!lock) return json({id,status:'processing'},202);
   const allowance=await db().prepare("INSERT INTO store_tryon_throttle(key,window,n) VALUES('poll',?,1) ON CONFLICT(key) DO UPDATE SET window=excluded.window,n=CASE WHEN store_tryon_throttle.window=excluded.window THEN store_tryon_throttle.n+1 ELSE 1 END WHERE store_tryon_throttle.window<>excluded.window OR store_tryon_throttle.n<40 RETURNING n").bind(Math.floor(now()/10000)).first();
   if(!allowance)fail(429,'AI 상태 조회가 잠시 몰리고 있습니다. 잠시 후 다시 확인해 주세요.');
   const result=await deps.provider().status(job.provider_id);
   await db().prepare('UPDATE store_tryon_jobs SET status=?,credits=COALESCE(?,credits) WHERE id=? AND cancelled=0').bind(result.status,result.credits??(result.status==='failed'?0:result.status==='completed'?1:null),id).run();
   const fresh=await db().prepare('SELECT cancelled,expires_at FROM store_tryon_jobs WHERE id=?').bind(id).first<Job>();if(!fresh||fresh.cancelled||fresh.expires_at<=now())fail(410,'피팅 요청이 취소되었거나 만료되었습니다.');
   if(result.status==='completed'){
    let output:Buffer|null=null;
    try{const encoded=result.output!.split(',')[1];output=await normalizeImage(Buffer.from(encoded,'base64'));
     if(output.length>2500000)fail(502,'AI 결과 파일이 너무 큽니다.');
     return json({id,status:'completed',image:imageData(output),policyVersion:POLICY_VERSION});
    }finally{output?.fill(0);output=null;}
   }
   return json({id,status:result.status,...(result.status==='failed'?{error:'AI 피팅에 실패했습니다. 인물이 잘 보이는 다른 사진으로 다시 시도해 주세요.'}:{})});
  }),
  cancel:(req:Request,id:string)=>safe(async()=>{origin(req);await ownJob(req,id);await db().prepare('UPDATE store_tryon_jobs SET cancelled=1,provider_id=NULL WHERE id=?').bind(id).run();return json({ok:true,message:'결과 조회를 중단했습니다. 이미 접수된 AI 처리는 제공업체에서 계속 진행될 수 있습니다.'});}),
  adminGet:()=>safe(async()=>{
   if(!await deps.owner())fail(403,'관리자 계정만 접근할 수 있습니다.');
   let s;try{s=await settings();}catch{return json({initialized:false,configured:configuration().ready,settings:defaultTryOnSettings,revision:0});}
   await cleanup();const usage=await db().prepare("SELECT COUNT(*) AS attempts,COALESCE(SUM(status='completed'),0) AS completed,COALESCE(SUM(status='failed'),0) AS failed,COALESCE(SUM(status NOT IN ('completed','failed')),0) AS unknown,COALESCE(SUM(credits),0) AS credits FROM store_tryon_jobs WHERE day=?").bind(day()).first();
   const history=await db().prepare('SELECT * FROM store_tryon_daily ORDER BY day DESC LIMIT 30').all();
   return json({initialized:true,configured:configuration().ready,...s,day:day(),usage,history:history.results,creditMicroUsd:CREDIT_MICRO_USD});
  }),
  adminSave:(req:Request)=>safe(async()=>{
   if(!await deps.owner())fail(403,'관리자 계정만 접근할 수 있습니다.');origin(req);
   const body=JSON.parse((await readBounded(req,4096)).toString('utf8'));
   if(body.action==='initialize'){
    await db().batch(tryOnSchema.map(sql=>db().prepare(sql)));
    await db().prepare("INSERT OR IGNORE INTO store_tryon_settings(key,data,revision) VALUES('main',?,0)").bind(JSON.stringify(defaultTryOnSettings)).run();return json({ok:true});
   }
   const input=z.object({revision:z.number().int().min(0),settings:settingsSchema}).strict().safeParse(body);if(!input.success)fail(400,'사용량·예산 설정값을 확인해 주세요.');
   if(input.data!.settings.enabled&&!configuration().ready)fail(503,'FASHN_API_KEY와 TRYON_SIGNING_SECRET 서버 환경변수를 먼저 연결해 주세요.');
   const changed=await db().prepare("UPDATE store_tryon_settings SET data=?,revision=revision+1 WHERE key='main' AND revision=? RETURNING revision").bind(JSON.stringify(input.data!.settings),input.data!.revision).first();if(!changed)fail(409,'설정이 변경되었습니다. 다시 불러온 뒤 저장해 주세요.');return json({ok:true});
  }),
  cleanup:()=>safe(async()=>{await cleanup();return json({ok:true});})
 };
}

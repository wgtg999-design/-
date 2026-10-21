'use client';
import { useEffect, useRef, useState } from 'react';
import BeforeAfterSlider from './BeforeAfterSlider';
import './try-on.css';
type Product={id:string;name:string;image:string;color:string;category:string;sizeOptions:string[];stockStatus?:string};
type Config={ready:boolean;reason?:string;loginRequired?:boolean;remaining?:number;products:Product[];policyVersion:string;guest?:boolean};
async function payload(response:Response){const data=await response.json();if(!response.ok)throw Error(data.error||'요청에 실패했습니다.');return data;}
function sleep(ms:number,signal:AbortSignal){return new Promise<void>((resolve,reject)=>{if(signal.aborted)return reject(new DOMException('Aborted','AbortError'));const abort=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);signal.addEventListener('abort',abort,{once:true});});}
export default function TryOnClient(){
 const [config,setConfig]=useState<Config|null>(null),[product,setProduct]=useState(''),[source,setSource]=useState(''),[result,setResult]=useState(''),[ratio,setRatio]=useState(2/3),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[preparing,setPreparing]=useState(false),[message,setMessage]=useState('연결 상태를 확인하고 있습니다.'),[error,setError]=useState('');
 const photo=useRef<Blob|null>(null),urls=useRef(new Set<string>()),job=useRef<string|null>(null),request=useRef<AbortController|null>(null),fileWork=useRef(0),alive=useRef(true),input=useRef<HTMLInputElement>(null),runKey=useRef<string|null>(null);
 const linkedProduct=config?.products.find(p=>p.id===product);
 const urlFor=(blob:Blob)=>{const url=URL.createObjectURL(blob);urls.current.add(url);return url;};
 const release=(url:string)=>{if(url){URL.revokeObjectURL(url);urls.current.delete(url);}};
 const stop=()=>{request.current?.abort();runKey.current=null;request.current=null;if(job.current){void fetch('/api/try-on/'+job.current,{method:'DELETE',cache:'no-store',keepalive:true}).catch(()=>{});job.current=null;}setBusy(false);};
 const clearResult=()=>{setResult(value=>{release(value);return '';});};
 useEffect(()=>{
  alive.current=true;const controller=new AbortController();
  void fetch('/api/try-on',{cache:'no-store',signal:controller.signal}).then(payload).then((data:Config)=>{if(!alive.current)return;setConfig(data);const selected=new URL(window.location.href).searchParams.get('product');setProduct(data.products.some(p=>p.id===selected)?selected!:data.products[0]?.id??'');setMessage(data.ready?(data.loginRequired?'로그인 후 이용할 수 있습니다.':'입어 보고 싶은 상품과 본인 사진을 선택해 주세요.'):data.reason||'서비스를 준비 중입니다.');}).catch(e=>{if(e.name!=='AbortError'&&alive.current)setError('연결 상태를 확인하지 못했습니다. 창을 다시 열어 주세요.');});
  const dispose=()=>{document.querySelectorAll<HTMLImageElement>('img[src^="blob:"]').forEach(image=>image.removeAttribute('src'));alive.current=false;controller.abort();request.current?.abort();fileWork.current++;photo.current=null;for(const url of urls.current)URL.revokeObjectURL(url);urls.current.clear();if(job.current)void fetch('/api/try-on/'+job.current,{method:'DELETE',cache:'no-store',keepalive:true}).catch(()=>{});job.current=null;};
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();if(window.parent!==window)window.parent.postMessage({type:'store:tryon:close'},window.location.origin);}};
  const restore=(event:PageTransitionEvent)=>{if(event.persisted)window.location.reload();};
  window.addEventListener('pageshow',restore);window.addEventListener('keydown',escape);window.addEventListener('pagehide',dispose);return ()=>{window.removeEventListener('pageshow',restore);window.removeEventListener('keydown',escape);window.removeEventListener('pagehide',dispose);dispose();};
 },[]);
 async function selectPhoto(file?:File){
  if(!file)return;const version=++fileWork.current;stop();clearResult();setConsent(false);runKey.current=null;setError('');setPreparing(true);
  if(input.current)input.current.value='';
  release(source);setSource('');photo.current=null;
  try{
   if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2500000||file.size===0)throw Error('JPG·PNG·WebP 사진을 2.5MB 이하로 선택해 주세요.');
   const bitmap=await createImageBitmap(file);
   try{
    if(bitmap.width*bitmap.height>24000000||Math.min(bitmap.width,bitmap.height)<128)throw Error('사진은 최소 128px, 최대 2,400만 화소로 준비해 주세요.');
    // Strip metadata before preview/transmission; keep orientation and ratio.
    const scale=Math.min(1,1296/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d');if(!ctx)throw Error('사진을 준비하지 못했습니다.');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('사진을 준비하지 못했습니다.')),'image/jpeg',0.88));canvas.width=0;canvas.height=0;
    if(!alive.current||version!==fileWork.current)return;photo.current=blob;setRatio(bitmap.width/bitmap.height);setSource(urlFor(blob));setMessage('사진이 준비되었습니다. 처리 안내에 동의한 후 시작해 주세요.');
   }finally{bitmap.close();}
  }catch(e){if(alive.current&&version===fileWork.current)setError(e instanceof Error?e.message:'사진을 읽지 못했습니다.');}finally{if(alive.current&&version===fileWork.current)setPreparing(false);}
 }
 async function generate(){
  if(request.current||busy||!photo.current||!config?.ready||!consent||!product)return;
  clearResult();setBusy(true);setError('');setMessage('사진을 전송하고 AI 피팅을 시작합니다. 보통 12~17초가 걸리며 대기 시간은 달라질 수 있습니다.');
  const controller=new AbortController();request.current=controller;
  const watchdog=setTimeout(()=>{if(request.current===controller){controller.abort();setMessage('AI 처리 시간이 초과되어 조회를 중단했습니다. 접수된 처리에는 비용이 발생할 수 있습니다.');}},180000);
  // Never auto-retry a generation POST after an uncertain network response.
  // The same explicit retry reuses its idempotency key until a terminal result.
  const key=runKey.current??crypto.randomUUID();runKey.current=key;let failures=0;
  try{
   const started=await payload(await fetch('/api/try-on',{method:'POST',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'image/jpeg','X-Product-Id':product,'X-Request-Key':key,'X-Tryon-Consent':config.policyVersion},body:photo.current}));
   if(started.status==='expired'){runKey.current=null;throw Error('이전 피팅 요청이 만료되었습니다. 다시 시작해 주세요.');}
   job.current=started.id;if(controller.signal.aborted){stop();return;}
   const deadline=Date.now()+180000;
   while(Date.now()<deadline){
    await sleep(failures?Math.min(12000,3000*2**failures):3000,controller.signal);
    let response:Response;
    try{response=await fetch('/api/try-on/'+started.id,{cache:'no-store',signal:controller.signal});}catch(e){if(controller.signal.aborted)throw e;if(++failures<=3){setMessage('연결이 지연되어 처리 상태만 다시 확인하고 있습니다.');continue;}throw Error('결과 연결이 지연되었습니다. 사진은 저장되지 않으며 자동으로 새 피팅을 생성하지 않습니다.');}
    if((response.status>=500||response.status===429)&&++failures<=3){await response.body?.cancel();continue;}
    const status=await payload(response);failures=0;
    if(status.status==='failed'){runKey.current=null;throw Error(status.error||'AI 피팅에 실패했습니다. 다른 사진으로 다시 시도해 주세요.');}
    if(status.status==='completed'){
     if(typeof status.image!=='string'||!status.image.startsWith('data:image/jpeg;base64,'))throw Error('결과 이미지를 읽지 못했습니다.');
     const binary=atob(status.image.split(',')[1]),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));const url=urlFor(new Blob([bytes],{type:'image/jpeg'}));
     if(controller.signal.aborted||!alive.current){release(url);return;}
     setResult(url);setMessage('AI 착용 이미지입니다. 구분선을 움직여 원본과 비교해 보세요.');setConfig(c=>c?{...c,remaining:Math.max(0,(c.remaining??1)-1)}:c);runKey.current=null;return;
    }
    setMessage(status.status==='in_queue'?'생성 순서를 기다리고 있습니다.':'의류를 적용하고 있습니다. 창을 닫으면 결과 조회가 중단됩니다.');
   }
   throw Error('AI 처리 시간이 길어지고 있습니다. 조회를 중단했습니다. 접수된 처리에는 비용이 발생할 수 있습니다.');
  }catch(e){if(e instanceof Error&&e.name!=='AbortError'&&alive.current)setError(e.message);}finally{clearTimeout(watchdog);if(alive.current&&request.current===controller){setBusy(false);if(job.current){void fetch('/api/try-on/'+job.current,{method:'DELETE',cache:'no-store',keepalive:true}).catch(()=>{});job.current=null;runKey.current=null;}request.current=null;}}
 }
 function close(){stop();photo.current=null;for(const url of urls.current)URL.revokeObjectURL(url);urls.current.clear();setSource('');setResult('');setConsent(false);if(window.parent!==window)window.parent.postMessage({type:'store:tryon:close'},window.location.origin);else window.location.assign('/shop');}
 function cart(){if(!linkedProduct)return;if(window.parent!==window){window.parent.postMessage({type:'store:tryon:cart',productId:linkedProduct.id},window.location.origin);}else window.location.assign('/products/'+encodeURIComponent(linkedProduct.id));}
 return <main className="tryon-shell">
  <header className="tryon-header"><div><p>STREET LABEL / FITTING ROOM</p><h1>AI VIRTUAL TRY-ON</h1></div><button className="close-tryon" onClick={close} aria-label="가상 피팅 닫기">✕</button></header>
  <p className="tryon-status" role="status" aria-live="polite">{message}</p>
  {error&&<p className="tryon-error" role="alert">{error}</p>}
  {config?.loginRequired?<a className="tryon-primary" href={'/auth/sign-in?next='+encodeURIComponent('/try-on')} target="_top">로그인하기</a>:null}
  {config?.ready&&!config.loginRequired?<div className="tryon-layout"><section className="tryon-preview" aria-label="가상 피팅 미리보기">
   {result&&source?<BeforeAfterSlider before={source} after={result} ratio={ratio}/>:source?<div className="source-frame" style={{aspectRatio:String(ratio)}}><img src={source} alt="선택한 본인 사진"/></div>:<div className="photo-empty"><span>YOUR PHOTO</span><p>몸과 의류가 잘 보이는<br/>전신 또는 상반신 사진을 선택해 주세요.</p></div>}
   {busy?<div className="generation-state" aria-live="polite"><span className="loading-mark"/>AI FITTING IN PROGRESS</div>:null}
  </section><section className="tryon-options" aria-label="피팅 설정">
   <label>SELECT GARMENT / 상품 선택<select aria-label="가상 착용할 상품" value={product} disabled={busy} onChange={e=>{stop();clearResult();runKey.current=null;setProduct(e.target.value);setError('');}}>{config.products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   {linkedProduct?<div className="selected-garment"><p>{linkedProduct.name}</p><small>{linkedProduct.color} · {linkedProduct.category}</small><p className="stock-note">{linkedProduct.stockStatus==='available'?'구매 시 사이즈별 재고를 확인해 주세요.':'구매 가능 여부는 상품의 사이즈·재고 설정에 따릅니다.'}</p><a href={'/products/'+encodeURIComponent(linkedProduct.id)} target="_top">상품 상세 보기 ↗</a></div>:<p>가상 피팅 가능한 상품이 없습니다.</p>}
   <label className="photo-input">{source?'사진 교체':'사진 선택'}<input ref={input} aria-label="본인 사진 선택" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||preparing} onChange={event=>void selectPhoto(event.target.files?.[0])}/></label>
   <small>JPG · PNG · WebP / 최대 2.5MB<br/>본인의 사진 또는 사용 허락을 받은 사진만 올려 주세요.</small>
   <details className="privacy-details" open><summary>사진 처리 및 보관 안내</summary><p>동의하고 시작할 때 사진과 선택한 의류 이미지를 쇼핑몰 서버를 통해 FASHN AI에 일시 전송합니다. 쇼핑몰 DB·회원 프로필·R2에는 고객 사진과 결과를 저장하지 않습니다.</p><p>FASHN 문서상 Base64 입력 사진은 처리 완료 후 삭제되며 자동 정리의 최장 기준은 1일입니다. Base64 결과는 완료 후 최대 60분간 제공됩니다. 요청 메타데이터는 자동 삭제되지 않으며, 별도 동의 없이 AI 학습에 사용하지 않는다고 명시합니다.</p><p>해외 서비스와 하위 처리업체가 처리할 수 있습니다. 창을 닫아도 이미 접수된 외부 AI 처리·비용까지 취소되는 것은 아닙니다.</p><a href="https://docs.fashn.ai/api-overview/data-retention-privacy" target="_blank" rel="noreferrer">FASHN 보관 정책</a> · <a href="https://fashn.ai/legal/subprocessors" target="_blank" rel="noreferrer">처리업체·지역</a></details>
   <label className="photo-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/><span>사진 사용 권한이 있으며, 위 외부 AI 전송·일시 보관 안내를 읽고 가상 피팅 처리에 동의합니다.</span></label>
   <div className="tryon-actions"><button className="tryon-primary" disabled={busy||preparing||!source||!consent||!linkedProduct||(config.remaining??0)<=0} onClick={()=>void generate()}>{result?'RETRY / 다시 피팅':'TRY ON / 가상 피팅 시작'}</button>{busy?<button onClick={()=>{stop();setMessage('결과 조회를 중단했습니다. 접수된 외부 AI 처리는 계속 진행될 수 있습니다.');}}>조회 취소</button>:null}{result?<button onClick={cart}>ADD TO CART / 옵션 선택</button>:null}</div>
   <small>오늘 남은 사용 횟수: {config.remaining??0}회 (UTC 기준)<br/>AI 결과는 실제 사이즈·핏·색상·착용감을 보장하지 않습니다.</small>
  </section></div>:null}
  <footer className="tryon-footer">사진은 이 창에서만 사용합니다. 창을 닫거나 새로고침하면 복원되지 않습니다.</footer>
 </main>;
}

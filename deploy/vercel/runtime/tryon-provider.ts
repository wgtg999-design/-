import { readBounded, TryOnError } from './tryon-images';
export type ProviderStatus = { status: 'starting'|'in_queue'|'processing'|'completed'|'failed'; output?: string; credits?: number };
export type TryOnProvider = { start(person:string,garment:string,category:'tops'|'bottoms'):Promise<string>; status(id:string):Promise<ProviderStatus> };
// Official documentation checked 2026-10-21. Deliberately no configurable URL,
// browser credentials, webhook callback or CDN output fallback (SSRF/privacy).
export function createFashnProvider(key:string, fetcher:typeof fetch=fetch):TryOnProvider {
 async function request(path:string,body?:unknown){
  let response:Response;
  try{response=await fetcher('https://api.fashn.ai/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(body?20000:15000)});}catch{throw new TryOnError(502,'AI 서비스 응답을 확인하지 못했습니다. 중복 생성을 막기 위해 자동으로 다시 요청하지 않습니다.');}
  if(!response.ok){await response.body?.cancel();throw new TryOnError(502,response.status===429?'AI 서비스 사용량 또는 잔액 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.':'AI 서비스 연결에 실패했습니다. 운영자가 연결 상태를 확인해야 합니다.');}
  let data:any;try{data=JSON.parse((await readBounded(response,4200000)).toString('utf8'));}catch{throw new TryOnError(502,'AI 서비스 응답 형식이 올바르지 않습니다.');}
  const used=Number(response.headers.get('x-fashn-credits-used'));return {data,credits:response.headers.has('x-fashn-credits-used')&&Number.isFinite(used)&&used>=0?used:undefined};
 }
 return {
  async start(person,garment,category){
   const {data}=await request('run',{model_name:'tryon-v1.6',inputs:{model_image:person,garment_image:garment,category,garment_photo_type:'auto',mode:'quality',num_samples:1,output_format:'jpeg',return_base64:true,moderation_level:'conservative',segmentation_free:true}});
   if(typeof data.id!=='string'||! /^[A-Za-z0-9_-]{1,120}$/.test(data.id)||data.error)throw new TryOnError(502,'AI 생성 접수를 확인하지 못했습니다.');return data.id;
  },
  async status(id){
   if(!/^[A-Za-z0-9_-]{1,120}$/.test(id))throw new TryOnError(502,'AI 요청을 확인하지 못했습니다.');
   const {data,credits}=await request('status/'+encodeURIComponent(id));
   if(!['starting','in_queue','processing','completed','failed'].includes(data.status))throw new TryOnError(502,'AI 처리 상태를 확인하지 못했습니다.');
   const output=data.status==='completed'?data.output?.[0]:undefined;
   if(data.status==='completed'&&(typeof output!=='string'||!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(output)||output.length>4000000))throw new TryOnError(502,'AI 결과가 만료되었거나 지원하지 않는 형식입니다.');
   // Provider errors can contain input data/URLs. Never pass them to clients.
   return {status:data.status,output,credits};
  }
 };
}

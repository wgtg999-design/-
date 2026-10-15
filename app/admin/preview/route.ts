import html from '../../../legacy/store.html?raw';
import {guard,noCache,limitedBody} from '../../../lib/admin';
import {contentSchema} from '../../../lib/content';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 const denied=await guard(req);if(denied)return denied;
 try{
  if(req.headers.get('content-type')?.split(';')[0]!=='application/x-www-form-urlencoded')throw Error();
  const fields=new URLSearchParams(new TextDecoder().decode(await limitedBody(req,1500000)));
  if(fields.getAll('content').length!==1||[...fields.keys()].some(key=>key!=='content'))throw Error();
  const content=contentSchema.parse(JSON.parse(fields.get('content')!));
  const data=JSON.stringify({content,assets:{}}).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
  const page=html.replace('<script src="/i18n.js"',`<script>window.StorePreviewData=${data};</script><script src="/i18n.js"`);
  return new Response(page,{headers:{...noCache,'Content-Type':'text/html; charset=utf-8','X-Robots-Tag':'noindex, nofollow'}});
 }catch{return new Response('미리보기 내용을 확인하지 못했습니다. 관리자에서 다시 시도하세요.',{status:400,headers:{...noCache,'Content-Type':'text/plain; charset=utf-8'}});}
}

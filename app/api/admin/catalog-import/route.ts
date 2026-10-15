import {env} from 'cloudflare:workers';
import {guard,noCache,limitedBody} from '../../../../lib/admin';
import {readStore} from '../../../../lib/store';
import {mergeBottomsProducts} from '../../../../lib/bottoms-import';
import {defaults} from '../../../../lib/content';
import {mergeSuppliedProducts} from '../../../../lib/catalog-import';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 const denied=await guard(req);if(denied)return denied;
 try{
  const input=JSON.parse(new TextDecoder().decode(await limitedBody(req,2048)));
  if(!Number.isInteger(input.revision)||input.revision<0)return Response.json({error:'저장 버전을 확인하세요.'},{status:400,headers:noCache});
  const current=await readStore();
  if(current.revision!==input.revision)return Response.json({error:'상품 목록이 변경되었습니다. 새로 불러온 뒤 다시 시도하세요.'},{status:409,headers:noCache});
  if(input.batch!==undefined&&input.batch!=='bottoms-12')return Response.json({error:'잘못된 가져오기 항목입니다.'},{status:400,headers:noCache});
  const result=input.batch==='bottoms-12'?mergeBottomsProducts(current.content):mergeSuppliedProducts(current.content);
  if(!result.added.length)return Response.json({added:[],skipped:result.skipped,revision:current.revision},{headers:noCache});
  const now=new Date().toISOString();
  await env.DB.prepare('INSERT OR IGNORE INTO store_content (key,data,revision,updated_at) VALUES (?,?,0,?)').bind('main',JSON.stringify(defaults),now).run();
  const saved=await env.DB.prepare('UPDATE store_content SET data=?, revision=revision+1, updated_at=? WHERE key=? AND revision=? RETURNING revision').bind(JSON.stringify(result.content),now,'main',input.revision).first<{revision:number}>();
  if(!saved)return Response.json({error:'동시에 변경되었습니다. 새로 불러온 뒤 다시 시도하세요.'},{status:409,headers:noCache});
  return Response.json({added:result.added,skipped:result.skipped,revision:saved.revision},{headers:noCache});
 }catch{return Response.json({error:'상품을 가져오지 못했습니다. 상품 수와 저장 상태를 확인하세요.'},{status:400,headers:noCache});}
}

import {env} from 'cloudflare:workers';
import {guard,noCache,limitedBody} from '../../../../lib/admin';
export const dynamic='force-dynamic';
export async function POST(req:Request){const d=await guard(req);if(d)return d;try{
 const bytes=await limitedBody(req,8*1024*1024);const b=bytes;let ext='',type='';
 if(b.length>8&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v)){ext='png';type='image/png';}
 else if(b.length>3&&b[0]===255&&b[1]===216&&b[2]===255){ext='jpg';type='image/jpeg';}
 else if(b.length>12&&new TextDecoder().decode(b.slice(0,4))==='RIFF'&&new TextDecoder().decode(b.slice(8,12))==='WEBP'){ext='webp';type='image/webp';}
 else return Response.json({error:'JPG, PNG, WebP 이미지 파일만 업로드할 수 있습니다.'},{status:400,headers:noCache});
 const key=crypto.randomUUID()+'.'+ext;await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:type}});return Response.json({url:'/media/'+key},{headers:noCache});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'업로드 실패'},{status:400,headers:noCache});}}

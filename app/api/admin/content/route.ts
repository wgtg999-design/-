import {env} from 'cloudflare:workers';
import {guard,noCache,limitedBody} from '../../../../lib/admin';
import {readStore} from '../../../../lib/store';
import {contentSchema,defaults} from '../../../../lib/content';
export const dynamic='force-dynamic';
export async function GET(){const d=await guard();if(d)return d;return Response.json(await readStore(),{headers:noCache});}
export async function PUT(req:Request){const d=await guard(req);if(d)return d;
 try{const body=JSON.parse(new TextDecoder().decode(await limitedBody(req,400000)));if(!Number.isInteger(body.revision)||body.revision<0)throw Error('잘못된 저장 버전입니다.');const content=contentSchema.parse(body.content);const now=new Date().toISOString();
 await env.DB.prepare('INSERT OR IGNORE INTO store_content (key,data,revision,updated_at) VALUES (?,?,0,?)').bind('main',JSON.stringify(defaults),now).run();
 const row=await env.DB.prepare('UPDATE store_content SET data=?, revision=revision+1, updated_at=? WHERE key=? AND revision=? RETURNING revision').bind(JSON.stringify(content),now,'main',body.revision).first<{revision:number}>();
 if(!row)return Response.json({error:'다른 창에서 수정되었습니다. 편집 내용을 복사해 두고 새로고침한 뒤 다시 저장해 주세요.'},{status:409,headers:noCache});
 return Response.json({revision:row.revision,updatedAt:now},{headers:noCache});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'저장에 실패했습니다.'},{status:400,headers:noCache});}}

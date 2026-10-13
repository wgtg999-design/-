import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../app/chatgpt-auth';
export const noCache={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function isOwner(){
 const user=await getChatGPTUser();if(!user)return false;
 const owner=await env.DB.prepare('SELECT user_id FROM store_owner WHERE key = ?').bind('owner').first<{user_id:string}>();
 if(owner)return owner.user_id===user.userId;
 // Bootstrap only from the owner identity confirmed by Sites. Afterwards use the site-scoped ID.
 const email=env.OWNER_BOOTSTRAP_EMAIL;if(!email||user.email.toLowerCase()!==email.toLowerCase())return false;
 await env.DB.prepare('INSERT OR IGNORE INTO store_owner (key,user_id) VALUES (?,?)').bind('owner',user.userId).run();
 const pinned=await env.DB.prepare('SELECT user_id FROM store_owner WHERE key = ?').bind('owner').first<{user_id:string}>();
 return pinned?.user_id===user.userId;
}
export function sameOrigin(req:Request){return req.headers.get('origin')===new URL(req.url).origin;}
export async function guard(req?:Request){if(!await isOwner())return Response.json({error:'관리자 계정만 접근할 수 있습니다.'},{status:403,headers:noCache});if(req&&!sameOrigin(req))return Response.json({error:'잘못된 요청 출처입니다.'},{status:403,headers:noCache});return null;}
export async function limitedBody(req:Request,max:number){const reader=req.body?.getReader();if(!reader)throw Error('본문이 없습니다.');let total=0;const chunks:Uint8Array[]=[];for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>max){await reader.cancel();throw Error('파일 또는 데이터가 너무 큽니다.');}chunks.push(value);}const output=new Uint8Array(total);let n=0;for(const c of chunks){output.set(c,n);n+=c.length;}return output;}

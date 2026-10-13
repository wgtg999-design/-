import html from '../../legacy/account.html?raw';
import {getChatGPTUser} from '../chatgpt-auth';
import {noCache} from '../../lib/admin';
export const dynamic='force-dynamic';
export async function GET(req:Request){
  const next=new URL(req.url).searchParams.get('next')==='checkout'?'?next=checkout':'';
  if(!await getChatGPTUser())return new Response(null,{status:302,headers:{...noCache,Location:new URL('/signup'+next,req.url).href}});
  return new Response(html,{headers:{...noCache,'Content-Type':'text/html; charset=utf-8'}});
}

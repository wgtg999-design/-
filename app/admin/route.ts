import html from '../../legacy/admin.html?raw';
import {getChatGPTUser,chatGPTSignInPath} from '../chatgpt-auth';
import {guard,noCache} from '../../lib/admin';
export const dynamic='force-dynamic';
export async function GET(req:Request){if(!await getChatGPTUser())return Response.redirect(new URL(chatGPTSignInPath('/admin'),req.url),302);const denied=await guard();if(denied)return denied;return new Response(html,{headers:{...noCache,'Content-Type':'text/html; charset=utf-8'}});}

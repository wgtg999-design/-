import html from '../../legacy/account.html?raw';
import {getChatGPTUser,chatGPTSignInPath} from '../chatgpt-auth';
import {noCache} from '../../lib/admin';
export const dynamic='force-dynamic';export async function GET(req:Request){if(!await getChatGPTUser())return Response.redirect(new URL(chatGPTSignInPath('/account'),req.url),302);return new Response(html,{headers:{...noCache,'Content-Type':'text/html; charset=utf-8'}})}

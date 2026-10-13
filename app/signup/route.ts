import accountHtml from '../../legacy/account.html?raw';
import signupHtml from '../../legacy/signup.html?raw';
import {getChatGPTUser,chatGPTSignInPath} from '../chatgpt-auth';
import {noCache} from '../../lib/admin';

export const dynamic='force-dynamic';

export async function GET(req:Request){
  const next=new URL(req.url).searchParams.get('next')==='checkout'?'?next=checkout':'';
  const user=await getChatGPTUser();
  const html=user?accountHtml:signupHtml.replace('__SIGN_IN_URL__',chatGPTSignInPath('/signup'+next));
  return new Response(html,{headers:{...noCache,'Content-Type':'text/html; charset=utf-8'}});
}

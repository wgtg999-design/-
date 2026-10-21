import { timingSafeEqual } from 'node:crypto';
import { tryOn } from '../../../../runtime/tryon';
import { privateHeaders } from '../../../../runtime/tryon-schema';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET,received=request.headers.get('authorization')??'';
 const expected='Bearer '+(secret??'');
 if(!secret||Buffer.byteLength(secret)<32||Buffer.byteLength(received)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(received),Buffer.from(expected)))return Response.json({error:'인증이 필요합니다.'},{status:403,headers:privateHeaders});
 return tryOn.cleanup();
}

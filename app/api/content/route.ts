import {readStore} from '../../../lib/store';
import {noCache} from '../../../lib/admin';
export const dynamic='force-dynamic';
export async function GET(){
 try{
  const s=await readStore();
  return Response.json({...s,content:{...s.content,products:s.content.products.filter(p=>p.visible)}},{headers:noCache});
 }catch{
  return Response.json({error:'상품 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'},{status:503,headers:noCache});
 }
}

import {readStore} from '../../../lib/store';
import {noCache} from '../../../lib/admin';
export const dynamic='force-dynamic';
export async function GET(){const s=await readStore();return Response.json({...s,content:{...s.content,products:s.content.products.filter(p=>p.visible)}},{headers:noCache});}

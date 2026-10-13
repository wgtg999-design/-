import {isOwner,noCache} from '../../../lib/admin';
export const dynamic='force-dynamic';
export async function GET(){return Response.json({isAdmin:await isOwner()},{headers:noCache});}

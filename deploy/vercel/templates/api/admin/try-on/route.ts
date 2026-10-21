import { tryOn } from '../../../../runtime/tryon';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=()=>tryOn.adminGet();
export const PUT=(request:Request)=>tryOn.adminSave(request);

import { tryOn } from '../../../runtime/tryon';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export const GET=(request:Request)=>tryOn.config(request);
export const POST=(request:Request)=>tryOn.start(request);

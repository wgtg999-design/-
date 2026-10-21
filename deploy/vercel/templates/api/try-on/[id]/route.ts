import { tryOn } from '../../../../runtime/tryon';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){return tryOn.poll(request,(await context.params).id);}
export async function DELETE(request:Request,context:Context){return tryOn.cancel(request,(await context.params).id);}

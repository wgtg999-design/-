import html from '../legacy/store.html?raw';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 if(req){
  const url=new URL(req.url),query=new URLSearchParams();
  for(const key of ['category','view','q'])if(url.searchParams.has(key))query.set(key,url.searchParams.get(key)!);
  if(query.size){if(query.get('category')==='TOPS')query.set('category','TSHIRT');return new Response(null,{status:302,headers:{Location:'/shop?'+query,'Cache-Control':'no-store'}});}
  const product=url.searchParams.get('product');
  if(product&&/^[a-zA-Z0-9_-]{1,60}$/.test(product))return new Response(null,{status:302,headers:{Location:'/products/'+product,'Cache-Control':'no-store'}});
 }
 return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}

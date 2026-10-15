import html from '../../../legacy/store.html?raw';
import {readStore} from '../../../lib/store';
export const dynamic='force-dynamic';
export async function GET(_request:Request,context:{params:Promise<{slug:string}>}){
 try{
  const {slug}=await context.params;
  const store=await readStore(),product=store.content.products.find(p=>p.id===slug&&p.visible);
  if(!product)return new Response('상품을 찾을 수 없습니다.',{status:404,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
  const page=html.replace('class="store-page" data-page="home"',`class="store-page catalog-page product-page" data-page="product" data-product-id="${product.id}"`).replace('class="products product-slider"','class="products shop-grid"');
  return new Response(page,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return new Response('상품을 불러오지 못했습니다.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});}
}

import html from '../../legacy/store.html?raw';
export const dynamic='force-dynamic';
export async function GET(){
 const page=html.replace('class="store-page" data-page="home"','class="store-page catalog-page" data-page="shop"').replace('class="products product-slider"','class="products shop-grid"').replace('<title>YOUR LABEL — Independent Uniform</title>','<title>SHOP ALL — Street Label</title>');
 return new Response(page,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}

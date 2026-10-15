import type {Content} from './content';
import {imageVariants} from './image-variants';
function variant(value:string){return imageVariants[value as keyof typeof imageVariants]}
export function deliveryImage(value:string,width=1600){const items=variant(value)?.items;return items?(items.find(item=>item.width>=width)||items[items.length-1]).url:value;}
export function imageSet(value:string){return variant(value)?.items.map(item=>item.url+' '+item.width+'w').join(', ')||'';}
function escape(value:string){return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));}
export function firstBanner(content:Content){
 const first=content.heroImages[0],saved=content.homepage?.campaign;
 return content.homepage?.mediaLayout!=='swapped-v1'&&first==='/assets/campaign-wide.png'&&(saved?.image||(saved?.enabled===false?null:'/assets/editorial-brutalist-monochrome.png'))==='/assets/editorial-brutalist-monochrome.png'?'/assets/editorial-brutalist-monochrome.png':first;
}
export function renderInitialStorefront(html:string,store:{content:Content;revision:number;updatedAt:unknown}){
 const content={...store.content,products:store.content.products.filter(product=>product.visible)},source=firstBanner(content),src=deliveryImage(source),set=imageSet(source),meta=variant(source),mobile=source!==content.heroImages[0]?content.homepage?.campaign.mobileImage||source:content.homepage?.banners[0]?.mobileImage||source;
 const picture=`<picture><source media="(max-width:800px)" srcset="${escape(imageSet(mobile)||deliveryImage(mobile,960))}" sizes="100vw"><img id="hero-photo" src="${escape(src)}"${set?` srcset="${escape(set)}" sizes="100vw"`:''}${meta?` width="${meta.width}" height="${meta.height}"`:''} alt="${escape(content.brand)} — Collection" fetchpriority="high" decoding="async"></picture>`;
 const serialized=JSON.stringify({...store,content}).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
 return html.replace(/<img id="hero-photo"[^>]*>/,picture).replace('<script src="/i18n.js"',`<script>window.StoreInitialContent=${serialized};</script><script src="/i18n.js"`);
}

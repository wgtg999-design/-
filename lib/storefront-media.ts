import type {Content} from './content';
import {imageVariants} from './image-variants';
function variant(value:string){return imageVariants[value as keyof typeof imageVariants]}
export function deliveryImage(value:string,width=1600){const items=variant(value)?.items;return items?(items.find(item=>item.width>=width)||items[items.length-1]).url:value;}
export function imageSet(value:string){return variant(value)?.items.map(item=>item.url+' '+item.width+'w').join(', ')||'';}
function escape(value:string){return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));}
export function refinedStorefront(content:Content):Content {
    if(content.homepage?.mediaLayout==='refined-v2')return content;
    const heroes=content.heroImages,home=content.homepage;
    const legacy=heroes.length===2&&heroes[0]==='/assets/campaign-wide.png'&&heroes[1]==='/assets/campaign.png';
    const swapped=heroes.length===2&&heroes[0]==='/assets/editorial-brutalist-monochrome.png'&&heroes[1]==='/assets/campaign.png'&&home?.campaign?.image==='/assets/campaign-wide.png';
    if((!legacy&&!swapped)||home?.banners.some(item=>item.mobileImage||!['','/shop'].includes(item.href)))return content;
    const original=['jacket','shell','denim','trousers','destroyed-knit-sweater-black','distressed-off-shoulder-knit-olive-grey','heavyweight-oversized-zip-hoodie-black','slim-cropped-zip-hoodie-heather-grey','star-stitch-ribbed-tank-top-black','ice-washed-graphic-layered-tee-blue'];
    const priority=['jacket','eyelet-strap-panel-wide-denim-pants-indigo','destroyed-knit-sweater-black','buckle-panel-cargo-wide-pants-washed-black','heavyweight-oversized-zip-hoodie-black','faded-blue-wide-denim-pants-light-blue','star-stitch-ribbed-tank-top-black','chain-detail-layered-mini-skirt-washed-black','shell','trousers'];
    const available=content.products.filter(product=>product.visible).map(product=>product.id);
    const unchanged=!home||home.slider01.length===original.length&&home.slider01.every((id,index)=>id===original[index]);
    const chosen=[...priority,...available].filter((id,index,all)=>available.includes(id)&&all.indexOf(id)===index).slice(0,10);
    const previous={image:home?.campaign.image||(home?.campaign.enabled===false?null:'/assets/editorial-brutalist-monochrome.png'),mobileImage:home?.campaign.mobileImage??null,enabled:home?.campaign.enabled!==false};
    const nextCampaign=previous.enabled===false?previous:{...previous,image:swapped?'/assets/editorial-brutalist-monochrome.png':previous.image||'/assets/editorial-brutalist-monochrome.png'};
    const fallback=[{category:'OUTER' as const,image:'/assets/jacket-model-01.png'},{category:'TSHIRT' as const,image:'/assets/clothes-ice-washed-graphic-layered-tee-blue.png'},{category:'BOTTOMS' as const,image:'/assets/denim-model-01.png'}];
    const journals=fallback.map((preset,index)=>{const entry=home?.journals[index];return {...preset,...entry,category:index===1&&entry?.category==='TOPS'?'TSHIRT' as const:entry?.category||preset.category,image:entry?.image||preset.image};}).map(entry=>entry.category==='TSHIRT'&&entry.image==='/assets/clothes-ice-washed-graphic-layered-tee-blue.png'?{...entry,image:'/assets/journal-layered-tee-model.png'}:entry);
    return {...content,heroImages:['/assets/editorial-silent-structure.png'],homepage:{...home,mediaLayout:'refined-v2',banners:[{href:'/shop',mobileImage:null}],slider01:unchanged?chosen:home!.slider01,campaign:nextCampaign,journals}};
  }

export function firstBanner(content:Content){
 content=refinedStorefront(content);
 const first=content.heroImages[0],saved=content.homepage?.campaign;
 if(content.homepage?.banners.some(item=>item.mobileImage||!['','/shop'].includes(item.href)))return first;
 return !['swapped-v1','refined-v2'].includes(content.homepage?.mediaLayout||'')&&first==='/assets/campaign-wide.png'&&(saved?.image||(saved?.enabled===false?null:'/assets/editorial-brutalist-monochrome.png'))==='/assets/editorial-brutalist-monochrome.png'?'/assets/editorial-brutalist-monochrome.png':first;
}
export function renderInitialStorefront(html:string,store:{content:Content;revision:number;updatedAt:unknown}){
 const selected=refinedStorefront(store.content);
 const content={...selected,products:selected.products.filter(product=>product.visible)},source=firstBanner(content),src=deliveryImage(source),set=imageSet(source),meta=variant(source),mobile=source!==content.heroImages[0]?content.homepage?.campaign.mobileImage||source:content.homepage?.banners[0]?.mobileImage||source;
 // A landscape photograph covering a tall phone needs enough pixels for its
 // height as well as its width; 100vw alone selects a blurry small crop.
 const coverSizes=(value:string)=>{const info=variant(value);return info?`max(100vw, ${Math.ceil(info.width/info.height*100)}svh)`:'100vw';};
 const picture=`<picture><source media="(max-width:800px)" srcset="${escape(imageSet(mobile)||deliveryImage(mobile,960))}" sizes="${coverSizes(mobile)}"><img id="hero-photo" src="${escape(src)}"${set?` srcset="${escape(set)}" sizes="${coverSizes(source)}"`:''}${meta?` width="${meta.width}" height="${meta.height}"`:''} alt="${escape(content.brand)} — Collection" fetchpriority="high" decoding="async"></picture>`;
 const serialized=JSON.stringify({...store,content}).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
 return html.replace(/<img id="hero-photo"[^>]*>/,picture).replace('<script src="/i18n.js"',`<script>window.StoreInitialContent=${serialized};</script><script src="/i18n.js"`);
}

import { z } from 'zod';
const localImage=z.string().max(200).refine(x=>/^\/(assets\/[a-zA-Z0-9._-]+|media\/[a-f0-9-]+\.(png|jpg|webp))$/.test(x),'사진을 업로드하거나 기본 이미지를 선택하세요.');
const locale=z.enum(['ko','zh-CN','zh-TW','ja']);
const brandTranslations=z.record(locale,z.object({notice:z.string().max(120).optional(),aboutTitle:z.string().max(100).optional(),aboutText:z.string().max(500).optional()}).strict());
const productTranslations=z.record(locale,z.object({name:z.string().max(100).optional(),color:z.string().max(50).optional(),description:z.string().max(2000).optional(),sizeGuide:z.string().max(4000).optional()}).strict());
function socialLink(hosts:string[]){return z.string().trim().max(500).refine(value=>{
 if(!value)return true;
 try{const url=new URL(value),authority=value.match(/^https:\/\/([^/?#]*)/i)?.[1];return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!!authority&&/^[a-zA-Z0-9.-]+$/.test(authority)&&authority.toLowerCase()===url.hostname&&hosts.includes(url.hostname)}catch{return false}
},'공식 Instagram 또는 카카오 HTTPS 주소를 입력하세요. 계정 정보나 포트가 포함된 주소는 사용할 수 없습니다.');}
const socialLinks=z.object({instagram:socialLink(['instagram.com','www.instagram.com']),kakao:socialLink(['pf.kakao.com','open.kakao.com','kakao.com','www.kakao.com'])}).strict();
const categoryKey=z.enum(['OUTER','BOTTOMS','TOPS','ACC','KNITWEAR','HOODIES','TSHIRT','SKIRTS']);
const destination=z.string().max(300).refine(x=>x===''||/^\/(?!\/)[a-zA-Z0-9/_?=&%#.-]*$/.test(x)||/^#[a-zA-Z0-9_-]+$/.test(x),'사이트 내부 주소만 입력하세요.');
const tone=z.enum(['auto','light','dark']);
const homepage=z.object({
 mediaLayout:z.enum(['swapped-v1','refined-v2']).optional(),heroTextTone:tone.optional(),journalSeason:z.string().trim().max(40).optional(),
 banners:z.array(z.object({mobileImage:localImage.nullable().optional(),href:destination}).strict()).max(5),
 slider01:z.array(z.string().max(60)).max(10),slider02:z.array(z.string().max(60)).max(10).optional(),
 campaign:z.object({image:localImage.nullable(),mobileImage:localImage.nullable(),enabled:z.boolean().optional()}).strict(),
 journals:z.array(z.object({image:localImage.nullable(),mobileImage:localImage.nullable().optional(),category:categoryKey,title:z.string().trim().max(30).optional(),textTone:tone.optional()}).strict()).length(3)
}).strict();
export const contentSchema=z.object({
 brand:z.string().trim().min(1).max(35),notice:z.string().max(120),aboutTitle:z.string().max(100),aboutText:z.string().max(500),
 socialLinks:socialLinks.optional(),translations:brandTranslations.optional(),
 homepage:homepage.optional(),heroImages:z.array(localImage).min(1).max(5),journalImage:localImage,
 products:z.array(z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/),name:z.string().trim().min(1).max(100),color:z.string().max(50),category:z.enum(['OUTER','BOTTOMS','TOPS','ACC','KNITWEAR','HOODIES','TSHIRT','SKIRTS']),price:z.number().int().min(0).max(100000000),description:z.string().max(2000),sizes:z.array(z.string().trim().min(1).max(20)).max(12),image:localImage,crop:z.enum(['','right','bottom','bottom right']),modelImage:localImage.nullable().optional(),modelFocus:z.enum(['upper','lower','center']).optional(),visible:z.boolean(),featured:z.boolean().optional(),sizeGuide:z.string().max(4000).optional(),translations:productTranslations.optional()})).max(100)
}).refine(v=>v.products.every(p=>p.image!=='/assets/product-image-pending.svg'||!p.visible),'기본 사진이 없는 상품은 공개할 수 없습니다.').refine(v=>new Set(v.products.map(p=>p.id)).size===v.products.length,'상품 ID가 중복되었습니다.').refine(v=>!v.homepage||v.homepage.banners.length===v.heroImages.length,'배너 설정 개수를 확인하세요.').refine(v=>!v.homepage||[v.homepage.slider01,v.homepage.slider02??[]].every(ids=>new Set(ids).size===ids.length&&ids.every(id=>v.products.some(p=>p.id===id))),'슬라이더는 중복 없이 등록된 상품만 지정하세요.');
export type Content=z.infer<typeof contentSchema>;
// Numbered original photographs supplied by the operator. The ID and original
// sample packshot must both match; sorting never changes the photo assignment.
const bundledModelPhotos:Record<string,{crop:string;image:string;focus:'upper'|'lower'}>={
 jacket:{crop:'',image:'/assets/jacket-model-01.png',focus:'upper'},
 shell:{crop:'right',image:'/assets/shell-model-01.png',focus:'upper'},
 denim:{crop:'bottom',image:'/assets/denim-model-01.png',focus:'lower'},
 trousers:{crop:'bottom right',image:'/assets/trousers-model-01.png',focus:'lower'}
};
export function withBundledModelPhotos(content:Content):Content{
 return {...content,products:content.products.map(product=>{
  const preset=Object.hasOwn(bundledModelPhotos,product.id)?bundledModelPhotos[product.id]:undefined;
  // undefined inherits a supplied photo, null records an administrator's
  // explicit removal, and a saved URL always takes precedence. No DB writes.
  if(!preset||product.modelImage!==undefined||product.image!=='/assets/products.png'||product.crop!==preset.crop)return product;
  return {...product,modelImage:preset.image,modelFocus:product.modelFocus??preset.focus};
 })};
}
export const defaults:Content={brand:'YOUR LABEL',notice:'COLLECTION 001 — INDEPENDENT UNIFORM',aboutTitle:'남들과 다른 결. 방향은 분명하게.',aboutText:'일상의 실루엣을 다시 바라보는 독립 스트릿웨어.',heroImages:['/assets/campaign-wide.png','/assets/campaign.png'],journalImage:'/assets/campaign.png',products:[
{id:'jacket',name:'Washed Work Jacket',color:'CHARCOAL',category:'OUTER',price:129000,crop:'',description:'워싱 질감과 여유 있는 실루엣의 가상 워크 재킷입니다.',sizes:['S','M','L'],image:'/assets/products.png',visible:true},
{id:'shell',name:'Utility Shell Parka',color:'SLATE',category:'OUTER',price:149000,crop:'right',description:'가벼운 레이어링을 위한 셸 파카 디자인 예시입니다.',sizes:['S','M','L'],image:'/assets/products.png',visible:true},
{id:'denim',name:'Wide Leg Washed Denim',color:'WASHED BLACK',category:'BOTTOMS',price:89000,crop:'bottom',description:'와이드 실루엣의 데님 디자인 예시입니다.',sizes:['S','M','L'],image:'/assets/products.png',visible:true},
{id:'trousers',name:'Volume Easy Trousers',color:'BLACK',category:'BOTTOMS',price:79000,crop:'bottom right',description:'편안한 볼륨감을 강조한 와이드 팬츠 예시입니다.',sizes:['S','M','L'],image:'/assets/products.png',visible:true}]};

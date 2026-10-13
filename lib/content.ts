import { z } from 'zod';
const localImage=z.string().max(200).refine(x=>/^\/(assets\/[a-zA-Z0-9._-]+|media\/[a-f0-9-]+\.(png|jpg|webp))$/.test(x),'사진을 업로드하거나 기본 이미지를 선택하세요.');
export const contentSchema=z.object({
 brand:z.string().trim().min(1).max(35),notice:z.string().max(120),aboutTitle:z.string().max(100),aboutText:z.string().max(500),
 heroImages:z.array(localImage).min(1).max(5),journalImage:localImage,
 products:z.array(z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/),name:z.string().trim().min(1).max(100),color:z.string().max(50),category:z.enum(['OUTER','BOTTOMS','TOPS','ACC']),price:z.number().int().min(0).max(100000000),description:z.string().max(2000),sizes:z.array(z.string().trim().min(1).max(20)).min(1).max(12),image:localImage,crop:z.enum(['','right','bottom','bottom right']),visible:z.boolean()})).max(100)
}).refine(v=>new Set(v.products.map(p=>p.id)).size===v.products.length,'상품 ID가 중복되었습니다.');
export type Content=z.infer<typeof contentSchema>;
export const defaults:Content={brand:'YOUR LABEL',notice:'COLLECTION 001 — INDEPENDENT UNIFORM',aboutTitle:'남들과 다른 결. 방향은 분명하게.',aboutText:'일상의 실루엣을 다시 바라보는 독립 스트릿웨어.',heroImages:['/assets/campaign-v2.png','/assets/campaign.png'],journalImage:'/assets/campaign.png',products:[
{id:'jacket',name:'Washed Work Jacket',color:'CHARCOAL',category:'OUTER',price:129000,crop:'',description:'워싱 질감과 여유 있는 실루엣의 가상 워크 재킷입니다.',sizes:['S','M','L'],image:'/assets/products.png',visible:true},
{id:'shell',name:'Utility Shell Parka',color:'SLATE',category:'OUTER',price:149000,crop:'right',description:'가벼운 레이어링을 위한 셸 파카 디자인 예시입니다.',sizes:['S','M','L'],image:'/assets/products.png',visible:true},
{id:'denim',name:'Wide Leg Washed Denim',color:'WASHED BLACK',category:'BOTTOMS',price:89000,crop:'bottom',description:'와이드 실루엣의 데님 디자인 예시입니다.',sizes:['S','M','L'],image:'/assets/products.png',visible:true},
{id:'trousers',name:'Volume Easy Trousers',color:'BLACK',category:'BOTTOMS',price:79000,crop:'bottom right',description:'편안한 볼륨감을 강조한 와이드 팬츠 예시입니다.',sizes:['S','M','L'],image:'/assets/products.png',visible:true}]};

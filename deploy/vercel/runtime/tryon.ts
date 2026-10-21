import { getDatabase } from './database';
import { getBucket } from './storage';
import { getChatGPTUser, isTrustedOrigin } from './auth';
import { isOwner } from '../lib/admin';
import { stocks } from '../lib/commerce';
import { readStore } from '../lib/store';
import { createTryOnService } from './tryon-service';
import { createFashnProvider } from './tryon-provider';
import { readBounded, TryOnError } from './tryon-images';

export const tryOn = createTryOnService({
 database:getDatabase, account:getChatGPTUser, owner:isOwner, trusted:isTrustedOrigin,
 configuration:()=>({key:process.env.FASHN_API_KEY,secret:process.env.TRYON_SIGNING_SECRET}),
 provider:()=>createFashnProvider(process.env.FASHN_API_KEY??''),catalog:readStore,stocks:async()=>(await stocks()) as any[],
 async garment(product){
  const source=product.tryOnImage||product.image;
  if(/^\/media\/[a-f0-9-]+\.(jpg|png|webp)$/.test(source)){
   const object=await getBucket().get(source.slice('/media/'.length));if(!object)throw new TryOnError(400,'상품 피팅 사진을 준비 중입니다.');return object.body;
  }
  if(!/^\/assets\/[A-Za-z0-9._-]+\.(png|jpg|jpeg|webp)$/.test(source))throw new TryOnError(400,'이 상품에 피팅용 사진을 등록해야 합니다.');
  let origin:URL;try{origin=new URL(process.env.NEXT_PUBLIC_SITE_URL??'');}catch{throw new TryOnError(503,'쇼핑몰 주소 설정을 확인해 주세요.');}
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw new TryOnError(503,'쇼핑몰 주소 설정을 확인해 주세요.');
  const response=await fetch(new URL(source,origin),{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new TryOnError(400,'상품 사진을 불러오지 못했습니다.');
  return readBounded(response,12000000);
 }
});

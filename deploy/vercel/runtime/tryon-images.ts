import sharp from 'sharp';
export const MAX_INPUT = 2500000; // Below Vercel's 4.5MB request limit.
const types = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const;
export class TryOnError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function readBounded(response: { body: ReadableStream<Uint8Array> | null }, limit: number) {
 const reader=response.body?.getReader(); if(!reader)throw new TryOnError(400,'사진을 읽지 못했습니다.');
 const chunks:Uint8Array[]=[];let size=0;
 try { for(;;){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>limit)throw new TryOnError(413,'사진 또는 응답이 너무 큽니다.');chunks.push(item.value);} }
 catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
 return Buffer.concat(chunks,size);
}
// Full decode, pixel/frame bounds, EXIF stripping, orientation normalization.
// No filenames, customer image bytes or decoder diagnostics are logged/stored.
export async function normalizeImage(bytes:Uint8Array, declared?:string, crop?:string) {
 if(!bytes.length)throw new TryOnError(400,'사진 파일이 비어 있습니다.');
 try {
  const decoder=sharp(bytes,{limitInputPixels:24000000,failOn:'warning',animated:false});
  const meta=await decoder.metadata();const mime=types[meta.format as keyof typeof types];
  if(!mime||declared&&declared!==mime||(meta.pages??1)!==1)throw Error('format');
  if(!meta.width||!meta.height||Math.min(meta.width,meta.height)<128)throw Error('dimensions');
  let pipeline=decoder.rotate();
  // The four original catalogue samples share a 2x2 contact sheet. Crop the
  // selected garment, never send the whole multi-product sheet to the AI.
  if(crop!==undefined){const w=Math.floor(meta.width/2),h=Math.floor(meta.height/2);pipeline=pipeline.extract({left:crop.includes('right')?w:0,top:crop.includes('bottom')?h:0,width:w,height:h});}
  return await pipeline.resize({width:1296,height:1296,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).jpeg({quality:88}).toBuffer();
 }catch{throw new TryOnError(415,'정상적인 JPG·PNG·WebP 사진만 사용할 수 있습니다. 최소 128px, 최대 2,400만 화소의 정지 사진을 선택해 주세요.');}
}
export function imageData(bytes:Uint8Array){return 'data:image/jpeg;base64,'+Buffer.from(bytes).toString('base64');}

import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ImageType = typeof IMAGE_TYPES[number];
type ObjectBody = AsyncIterable<Uint8Array> & { destroy?: () => void };
type CommandClient = { send: (command: any) => Promise<any> };
type Presigner = (client: any, command: any, options: any) => Promise<string>;
export type StoredImage = { body: Uint8Array; httpMetadata: { contentType?: string } };
export type BucketAdapter = {
  get(key: string): Promise<StoredImage | null>;
  put(key: string, bytes: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<void>;
  delete(key: string): Promise<void>;
  presignPut(key: string, contentType: ImageType, byteLength: number): Promise<string>;
  presignGet(key: string): Promise<string | null>;
};

function allowedKey(key: string) {
  return /^[a-f0-9-]+\.(jpg|png|webp)$/.test(key) || /^_uploads\/[a-f0-9]{24}\/[a-f0-9-]{36}$/.test(key);
}
function requireKey(key: string) { if (!allowedKey(key)) throw Error('잘못된 이미지 저장 경로입니다.'); }

// This adapter keeps existing R2 object names. It never makes the bucket public.
export function createR2Bucket(client: CommandClient, bucket: string, presign: Presigner = getSignedUrl): BucketAdapter {
  return {
    async get(key) {
      requireKey(key);
      let object;
      try { object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key })); }
      catch (error: any) {
        if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) return null;
        throw error;
      }
      if (!object.Body) return null;
      const body = object.Body as ObjectBody;
      if (Number(object.ContentLength) > MAX_IMAGE_BYTES) { body.destroy?.(); throw Error('이미지는 최대 8MB까지 업로드할 수 있습니다.'); }
      let total = 0;
      const chunks: Uint8Array[] = [];
      try {
        for await (const chunk of body) {
          const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : new Uint8Array(chunk);
          total += bytes.byteLength;
          if (total > MAX_IMAGE_BYTES) throw Error('이미지는 최대 8MB까지 업로드할 수 있습니다.');
          chunks.push(bytes);
        }
      } catch (error) { body.destroy?.(); throw error; }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return { body: bytes, httpMetadata: { contentType: object.ContentType } };
    },
    async put(key, bytes, options = {}) {
      requireKey(key);
      if (bytes.byteLength > MAX_IMAGE_BYTES) throw Error('이미지는 최대 8MB까지 업로드할 수 있습니다.');
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentLength: bytes.byteLength, ContentType: options.httpMetadata?.contentType }));
    },
    async delete(key) { requireKey(key); await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); },
    async presignGet(key) {
      requireKey(key);
      if (key.startsWith('_uploads/')) throw Error('임시 이미지는 공개할 수 없습니다.');
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        if (Number(head.ContentLength) > MAX_IMAGE_BYTES) throw Error('이미지는 최대 8MB까지 업로드할 수 있습니다.');
      } catch (error: any) {
        if (error?.name === 'NoSuchKey' || error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) return null;
        throw error;
      }
      // Read only the validated, immutable final object; do not relay an 8MB
      // image through a Vercel function's 4.5MB response limit.
      return presign(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 60 });
    },
    async presignPut(key, contentType, byteLength) {
      requireKey(key);
      if (!key.startsWith('_uploads/') || !IMAGE_TYPES.includes(contentType) || !Number.isSafeInteger(byteLength) || byteLength < 1 || byteLength > MAX_IMAGE_BYTES) throw Error('잘못된 이미지 업로드 요청입니다.');
      const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentLength: byteLength, ContentType: contentType });
      // The browser supplies the exact length automatically; both headers are signed.
      return presign(client, command, { expiresIn: 600, signableHeaders: new Set(['content-type', 'content-length']) });
    }
  };
}

let configuredBucket: BucketAdapter | undefined;
export function getBucket(): BucketAdapter {
  if (configuredBucket) return configuredBucket;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!accountId || !/^[a-f0-9]{32}$/.test(accountId) || !accessKeyId || !secretAccessKey || !bucket) throw Error('이미지 저장소 연결 설정이 필요합니다.');
  const client = new S3Client({ region: 'auto', endpoint: `https://${accountId}.r2.cloudflarestorage.com`, forcePathStyle: true, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED', credentials: { accessKeyId, secretAccessKey } });
  configuredBucket = createR2Bucket(client, bucket);
  return configuredBucket;
}

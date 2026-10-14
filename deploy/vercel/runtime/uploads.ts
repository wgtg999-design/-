import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { getDatabase } from './database';
import { getBucket, IMAGE_TYPES, MAX_IMAGE_BYTES, type BucketAdapter, type ImageType } from './storage';
import { getChatGPTUser } from '../app/chatgpt-auth';
import { guard, limitedBody, noCache } from '../lib/admin';

type Ticket = { id: string; user_id: string; object_key: string; content_type: ImageType; byte_length: number; expires_at: number; status: string; final_key: string | null };
type Token = { v: 1; id: string; user: string; key: string; type: ImageType; size: number; expires: number };
type Database = ReturnType<typeof getDatabase>;
type UploadDependencies = {
  database: () => Database;
  bucket: () => BucketAdapter;
  ownerGuard: (request: Request) => Promise<Response | null>;
  user: () => Promise<{ userId: string } | null>;
  secret: () => string;
  now: () => number;
  uuid: () => string;
};
const TOKEN_LIFETIME = 10 * 60 * 1000;

function signingSecret() {
  const value = process.env.UPLOAD_SIGNING_SECRET;
  if (!value || Buffer.byteLength(value) < 32) throw Error('이미지 업로드 보안 설정이 필요합니다.');
  return value;
}
function sign(token: Token, secret: string) {
  const encoded = Buffer.from(JSON.stringify(token)).toString('base64url');
  return `${encoded}.${createHmac('sha256', secret).update(encoded).digest('base64url')}`;
}
function verify(value: unknown, secret: string): Token {
  if (typeof value !== 'string' || value.length > 2000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) throw Error('잘못된 업로드 확인 정보입니다.');
  const [encoded, signature] = value.split('.');
  const expected = createHmac('sha256', secret).update(encoded).digest();
  const supplied = Buffer.from(signature, 'base64url');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw Error('잘못된 업로드 확인 정보입니다.');
  let token;
  try { token = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch { throw Error('잘못된 업로드 확인 정보입니다.'); }
  if (token?.v !== 1 || typeof token.id !== 'string' || !/^[a-f0-9-]{36}$/.test(token.id) || typeof token.user !== 'string' || typeof token.key !== 'string' || !/^_uploads\/[a-f0-9]{24}\/[a-f0-9-]{36}$/.test(token.key) || !IMAGE_TYPES.includes(token.type) || !Number.isSafeInteger(token.size) || token.size < 1 || token.size > MAX_IMAGE_BYTES || !Number.isSafeInteger(token.expires)) throw Error('잘못된 업로드 확인 정보입니다.');
  return token;
}
function detectType(bytes: Uint8Array): { type: ImageType; extension: string } | null {
  if (bytes.length > 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)) return { type: 'image/png', extension: 'png' };
  if (bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { type: 'image/jpeg', extension: 'jpg' };
  if (bytes.length > 12 && Buffer.from(bytes.subarray(0, 4)).toString() === 'RIFF' && Buffer.from(bytes.subarray(8, 12)).toString() === 'WEBP') return { type: 'image/webp', extension: 'webp' };
  return null;
}
function json(body: unknown, status = 200) { return Response.json(body, { status, headers: noCache }); }
async function safeDelete(bucket: BucketAdapter, key: string) { try { await bucket.delete(key); } catch { /* Configure a quarantine lifecycle as a cleanup fallback. */ } }

// Only this short JSON exchange crosses Vercel's function request-size limit.
// The image goes directly to a private, temporary R2 key and is never public there.
export function createUploadHandler(dependencies: UploadDependencies) {
  return async (request: Request) => {
    const denied = await dependencies.ownerGuard(request);
    if (denied) return denied;
    try {
      const user = await dependencies.user();
      if (!user) return json({ error: '관리자 계정만 접근할 수 있습니다.' }, 403);
      const secret = dependencies.secret();
      const db = dependencies.database();
      const bucket = dependencies.bucket();
      const bytes = await limitedBody(request, 4096);
      let body;
      try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return json({ error: '잘못된 업로드 요청입니다.' }, 400); }
      if (body?.action === 'init') {
        if (!IMAGE_TYPES.includes(body.contentType) || !Number.isSafeInteger(body.size) || body.size < 1 || body.size > MAX_IMAGE_BYTES) return json({ error: 'JPG, PNG, WebP 이미지를 최대 8MB까지 업로드할 수 있습니다.' }, 400);
        const id = dependencies.uuid();
        const key = `_uploads/${createHash('sha256').update(user.userId).digest('hex').slice(0, 24)}/${id}`;
        const expires = dependencies.now() + TOKEN_LIFETIME;
        const token: Token = { v: 1, id, user: user.userId, key, type: body.contentType, size: body.size, expires };
        const uploadUrl = await bucket.presignPut(key, token.type, token.size);
        await db.prepare('INSERT INTO store_upload_tickets (id,user_id,object_key,content_type,byte_length,expires_at,status) VALUES (?,?,?,?,?,?,?)').bind(id, user.userId, key, token.type, token.size, expires, 'pending').run();
        return json({ uploadUrl, token: sign(token, secret), expiresAt: expires, contentType: token.type });
      }
      if (body?.action !== 'finalize') return json({ error: '잘못된 업로드 요청입니다.' }, 400);
      const token = verify(body.token, secret);
      if (token.user !== user.userId) return json({ error: '본인의 업로드만 확인할 수 있습니다.' }, 403);
      const ticket = await db.prepare('SELECT * FROM store_upload_tickets WHERE id = ?').bind(token.id).first<Ticket>();
      if (!ticket || ticket.user_id !== user.userId || ticket.object_key !== token.key || ticket.content_type !== token.type || ticket.byte_length !== token.size || ticket.expires_at !== token.expires) return json({ error: '업로드 확인 정보를 찾을 수 없습니다.' }, 400);
      if (token.expires <= dependencies.now()) {
        if (ticket.status === 'pending') {
          await db.prepare("UPDATE store_upload_tickets SET status = 'rejected' WHERE id = ? AND user_id = ? AND status = 'pending'").bind(ticket.id, user.userId).run();
          await safeDelete(bucket, ticket.object_key);
        }
        return json({ error: '업로드 확인 시간이 지났습니다. 파일을 다시 선택해 주세요.' }, 400);
      }
      const claim = await db.prepare("UPDATE store_upload_tickets SET status = 'processing' WHERE id = ? AND user_id = ? AND status = 'pending' AND expires_at > ?").bind(ticket.id, user.userId, dependencies.now()).run();
      if (claim.meta.changes !== 1) return json({ error: '이미 처리했거나 처리 중인 업로드입니다.' }, 409);
      let finalKey: string | null = null;
      try {
        const object = await bucket.get(ticket.object_key);
        if (!object) throw Error('업로드된 이미지를 찾을 수 없습니다. 다시 시도해 주세요.');
        const detected = detectType(object.body);
        if (object.body.byteLength !== token.size || object.body.byteLength > MAX_IMAGE_BYTES || object.httpMetadata.contentType !== token.type || !detected || detected.type !== token.type) {
          await db.prepare("UPDATE store_upload_tickets SET status = 'rejected' WHERE id = ? AND status = 'processing'").bind(ticket.id).run();
          await safeDelete(bucket, ticket.object_key);
          return json({ error: '이미지 형식 또는 파일 크기가 올바르지 않습니다. JPG, PNG, WebP 파일을 다시 선택해 주세요.' }, 400);
        }
        finalKey = `${ticket.id}.${detected.extension}`;
        // Copy the validated bytes, not CopyObject: the temporary key could be overwritten.
        await bucket.put(finalKey, object.body, { httpMetadata: { contentType: detected.type } });
        const completed = await db.prepare("UPDATE store_upload_tickets SET status = 'complete', final_key = ? WHERE id = ? AND user_id = ? AND status = 'processing'").bind(finalKey, ticket.id, user.userId).run();
        if (completed.meta.changes !== 1) throw Error('이미지 저장 확인에 실패했습니다. 다시 시도해 주세요.');
        await safeDelete(bucket, ticket.object_key);
        return json({ url: `/media/${finalKey}` });
      } catch (error) {
        if (finalKey) await safeDelete(bucket, finalKey);
        await db.prepare("UPDATE store_upload_tickets SET status = 'pending' WHERE id = ? AND user_id = ? AND status = 'processing'").bind(ticket.id, user.userId).run();
        throw error;
      }
    } catch (error) {
      // Do not expose S3/Turso credentials, endpoints, stack traces, or SDK diagnostics.
      const message = error instanceof Error && /^(잘못된|이미지 업로드 보안|이미지 저장소 연결|업로드된|이미지는 최대|본문이 없습니다|파일 또는 데이터가 너무)/.test(error.message) ? error.message : '이미지 업로드를 완료하지 못했습니다. 저장소 연결과 업로드 허용 설정을 확인한 뒤 다시 시도해 주세요.';
      return json({ error: message }, 400);
    }
  };
}

export const uploadHandler = createUploadHandler({ database: getDatabase, bucket: getBucket, ownerGuard: guard, user: getChatGPTUser, secret: signingSecret, now: Date.now, uuid: randomUUID });

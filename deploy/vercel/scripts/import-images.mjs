import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const MAX = 8 * 1024 * 1024;
const canonical = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(jpg|png|webp)$/;
function format(bytes) {
  if (bytes.length > 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)) return { extension: 'png', type: 'image/png' };
  if (bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { extension: 'jpg', type: 'image/jpeg' };
  if (bytes.length > 12 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return { extension: 'webp', type: 'image/webp' };
  return null;
}
async function readImage(filename) {
  const stat = await lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > MAX) throw Error('이미지 내보내기에 일반 파일과 8MB 이하 이미지만 사용할 수 있습니다.');
  const file = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const chunks = []; let total = 0;
    for await (const chunk of file.createReadStream({ autoClose: false })) {
      total += chunk.length;
      if (total > MAX) throw Error('이미지는 최대 8MB까지만 이전할 수 있습니다.');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, total);
  } finally { await file.close(); }
}
export async function validateImageExport(directory) {
  if (!directory) throw Error('이미지 내보내기 폴더를 --source로 지정해 주세요.');
  const dir = await realpath(directory);
  const names = (await readdir(dir)).sort();
  if (!names.length) throw Error('이미지 내보내기 폴더가 비어 있습니다.');
  const plan = [];
  for (const key of names) {
    if (!canonical.test(key)) throw Error('내보내기 폴더에는 원래 UUID 이름의 JPG, PNG, WebP 파일만 넣어 주세요.');
    const filename = path.join(dir, key);
    const bytes = await readImage(filename);
    const detected = format(bytes);
    if (!detected || !key.endsWith('.' + detected.extension)) throw Error('이미지 확장자와 실제 파일 형식이 일치하지 않습니다.');
    plan.push({ key, filename, size: bytes.length, contentType: detected.type, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  return plan;
}
function connection(env) {
  if (!/^[a-f0-9]{32}$/.test(env.R2_ACCOUNT_ID || '') || !env.R2_BUCKET_NAME || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) throw Error('새로운 대상 R2 버킷의 서버 전용 환경변수를 설정해 주세요.');
  return { bucket: env.R2_BUCKET_NAME, client: new S3Client({ region: 'auto', endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, forcePathStyle: true, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED', credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY } }) };
}
function missing(error) { return error?.name === 'NoSuchKey' || error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404; }

export async function importImages({ source, apply = false, env = process.env, client: injectedClient, bucket: injectedBucket } = {}) {
  // Validate every local file before opening an R2 connection or writing anything.
  const plan = await validateImageExport(source);
  if (!apply) return { mode: 'dry-run', images: plan.map(({ key, size, contentType }) => ({ key, size, contentType })), imported: 0 };
  const target = injectedClient ? { client: injectedClient, bucket: injectedBucket } : connection(env);
  if (!target.bucket) throw Error('새로운 대상 R2 버킷 이름이 필요합니다.');
  let imported = 0;
  try {
    // Check the complete set before writes. Conditional puts also protect
    // against an object appearing between this check and the upload.
    for (const image of plan) {
      try { await target.client.send(new HeadObjectCommand({ Bucket: target.bucket, Key: image.key })); }
      catch (error) { if (missing(error)) continue; throw Error('대상 이미지 저장소 확인에 실패했습니다. 권한과 연결을 확인해 주세요.'); }
      throw Error('대상 버킷에 같은 이름의 이미지가 있습니다. 이전을 중단했으며 기존 파일을 덮어쓰지 않습니다.');
    }
    for (const image of plan) {
      const bytes = await readImage(image.filename);
      if (bytes.length !== image.size || createHash('sha256').update(bytes).digest('hex') !== image.sha256) throw Error('검증한 뒤 원본 이미지가 변경되어 이전을 중단했습니다.');
      try {
        await target.client.send(new PutObjectCommand({ Bucket: target.bucket, Key: image.key, Body: bytes, ContentLength: bytes.length, ContentType: image.contentType, IfNoneMatch: '*' }));
      } catch {
        throw Error(`이미지 이전이 중단되었습니다. 완료한 ${imported}개 파일은 유지하며 기존 이미지를 덮어쓰거나 삭제하지 않습니다. 대상 버킷을 확인해 주세요.`);
      }
      imported++;
    }
    return { mode: 'apply', imported, images: plan.map(({ key, size, contentType }) => ({ key, size, contentType })) };
  } finally { if (!injectedClient) target.client.destroy(); }
}
function options(args) {
  let source, apply = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source' && args[i + 1]) source = args[++i];
    else if (args[i] === '--apply') apply = true;
    else throw Error('사용법: node scripts/import-images.mjs --source <내보낸-이미지-폴더> [--apply]');
  }
  return { source, apply };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await importImages(options(process.argv.slice(2)));
    console.log(JSON.stringify(result, null, 2));
    if (result.mode === 'dry-run') console.log('검증만 완료했습니다. 이미지 저장소에 쓰지 않았습니다. 실제 이전은 새 대상 버킷을 확인한 뒤 --apply를 사용하세요.');
  } catch (error) { console.error(error instanceof Error ? error.message : '이미지 이전에 실패했습니다.'); process.exitCode = 1; }
}

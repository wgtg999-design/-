import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { importImages, validateImageExport } from '../scripts/import-images.mjs';
const jpg = Buffer.from([255, 216, 255, 0]);
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const first = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
const second = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png';
const temporary = await mkdtemp(path.join(os.tmpdir(), 'street-label-image-import-'));
let count = 0;
function notFound() { const error = Error('missing'); error.name = 'NotFound'; return error; }
async function scenario(name, fn) {
  const dir = path.join(temporary, String(++count)); await mkdir(dir);
  await fn(dir); console.log(`PASS ${name}`);
}
try {
  await scenario('default dry-run validates files without credentials, requests, or writes', async dir => {
    await writeFile(path.join(dir, first), jpg); let calls = 0;
    const result = await importImages({ source: dir, env: {}, client: { send: async () => { calls++; } }, bucket: 'fake' });
    assert.equal(result.mode, 'dry-run'); assert.equal(result.imported, 0); assert.equal(calls, 0); assert.deepEqual(result.images, [{ key: first, size: 4, contentType: 'image/jpeg' }]);
  });
  await scenario('apply checks all names first then writes same UUID bytes conditionally', async dir => {
    await writeFile(path.join(dir, first), jpg); await writeFile(path.join(dir, second), png); const commands = [];
    const result = await importImages({ source: dir, apply: true, bucket: 'new-private-test', client: { send: async command => { commands.push(command); if (command instanceof HeadObjectCommand) throw notFound(); return {}; } } });
    assert.equal(result.imported, 2); assert.ok(commands[0] instanceof HeadObjectCommand); assert.ok(commands[1] instanceof HeadObjectCommand); assert.ok(commands[2] instanceof PutObjectCommand); assert.equal(commands[2].input.IfNoneMatch, '*'); assert.equal(commands[3].input.IfNoneMatch, '*'); assert.equal(commands[2].input.Key, first); assert.equal(commands[3].input.Key, second); assert.deepEqual(commands[2].input.Body, jpg); assert.equal(commands[3].input.ContentType, 'image/png');
  });
  await scenario('one invalid name prevents any target request', async dir => {
    await writeFile(path.join(dir, first), jpg); await writeFile(path.join(dir, 'bad.jpg'), jpg); let requests = 0;
    await assert.rejects(() => importImages({ source: dir, apply: true, bucket: 'fake', client: { send: async () => { requests++; } } }), /UUID/); assert.equal(requests, 0);
  });
  await scenario('extension mismatch and bad magic rejected', async dir => {
    await writeFile(path.join(dir, first), png); await assert.rejects(() => validateImageExport(dir), /형식/);
    await writeFile(path.join(dir, first), Buffer.from('<html>')); await assert.rejects(() => validateImageExport(dir), /형식/);
  });
  await scenario('oversize, symbolic links, and directories rejected', async dir => {
    const filename = path.join(dir, first); await writeFile(filename, new Uint8Array(8 * 1024 * 1024 + 1)); await assert.rejects(() => validateImageExport(dir), /8MB/); await rm(filename);
    const original = path.join(temporary, 'real-image'); await writeFile(original, jpg); await symlink(original, filename); await assert.rejects(() => validateImageExport(dir), /일반 파일/); await rm(filename);
    await mkdir(filename); await assert.rejects(() => validateImageExport(dir), /일반 파일/);
  });
  await scenario('any pre-existing destination aborts complete set before writes', async dir => {
    await writeFile(path.join(dir, first), jpg); await writeFile(path.join(dir, second), png); let heads = 0, puts = 0;
    await assert.rejects(() => importImages({ source: dir, apply: true, bucket: 'fake', client: { send: async command => { if (command instanceof HeadObjectCommand) { heads++; if (command.input.Key === first) throw notFound(); return {}; } puts++; } } }), /덮어쓰지/); assert.equal(heads, 2); assert.equal(puts, 0);
  });
  await scenario('connection failures are sanitized and do not reach write phase', async dir => {
    await writeFile(path.join(dir, first), jpg); let puts = 0;
    await assert.rejects(() => importImages({ source: dir, apply: true, bucket: 'fake', client: { send: async command => { if (command instanceof PutObjectCommand) puts++; throw Error('private-secret=do-not-expose'); } } }), error => /연결/.test(error.message) && !error.message.includes('private-secret')); assert.equal(puts, 0);
  });
  await scenario('conditional write handles concurrent collision without overwrite/delete', async dir => {
    await writeFile(path.join(dir, first), jpg); const existing = Buffer.from('existing-file'); let seenCondition;
    await assert.rejects(() => importImages({ source: dir, apply: true, bucket: 'fake', client: { send: async command => { if (command instanceof HeadObjectCommand) throw notFound(); assert.ok(command instanceof PutObjectCommand); seenCondition = command.input.IfNoneMatch; const error = Error('PreconditionFailed'); error.$metadata = { httpStatusCode: 412 }; throw error; } } }), /덮어쓰거나 삭제하지/); assert.equal(seenCondition, '*'); assert.equal(existing.toString(), 'existing-file');
  });
  await scenario('local file changed after validation prevents its upload', async dir => {
    const filename = path.join(dir, first); await writeFile(filename, jpg); let puts = 0;
    await assert.rejects(() => importImages({ source: dir, apply: true, bucket: 'fake', client: { send: async command => { if (command instanceof HeadObjectCommand) { await writeFile(filename, Buffer.from([255, 216, 255, 1])); throw notFound(); } puts++; } } }), /변경/); assert.equal(puts, 0);
  });
  await scenario('partial failure leaves completed imports and never deletes any object', async dir => {
    await writeFile(path.join(dir, first), jpg); await writeFile(path.join(dir, second), png); const completed = [];
    await assert.rejects(() => importImages({ source: dir, apply: true, bucket: 'fake', client: { send: async command => { if (command instanceof HeadObjectCommand) throw notFound(); assert.ok(command instanceof PutObjectCommand); if (command.input.Key === second) throw Error('failed'); completed.push(command.input.Key); return {}; } } }), /완료한 1개/); assert.deepEqual(completed, [first]);
  });
  await scenario('missing target environment cannot apply', async dir => {
    await writeFile(path.join(dir, first), jpg); await assert.rejects(() => importImages({ source: dir, apply: true, env: {} }), /환경변수/);
  });
  console.log(`${count} isolated image-import scenarios passed. No live R2 was accessed.`);
} finally { await rm(temporary, { recursive: true, force: true }); }

import { randomUUID } from 'node:crypto';
import { getClerkAccountState, isTrustedOrigin, type ClerkAccountState } from './auth';
import { getDatabase, type DatabaseAdapter } from './database';
import { limitedBody } from '../lib/admin';
import { initializationPlan } from '../lib/initialization-plan';

type InitializationDependencies = {
  accountState: () => Promise<ClerkAccountState>;
  ownerEmail: () => string | undefined;
  database: () => Pick<DatabaseAdapter, 'prepare' | 'batch'>;
  trustedOrigin: (origin: string | null) => boolean;
};

const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
};

function failure(status: number, message: string, signIn = false): Response {
  // Only fixed server messages are rendered. Never echo provider/DB errors,
  // configuration values, user identity, request input or stored records.
  return new Response(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>데이터베이스 준비 확인</title><style>body{margin:0;font:16px/1.7 system-ui,sans-serif;color:#111;background:#fff}main{max-width:640px;margin:64px auto;padding:0 24px}h1{font-size:24px}a{display:inline-block;margin-top:16px;color:#111}</style></head><body><main><h1>데이터베이스 준비 확인</h1><p>${message}</p>${signIn ? '<p><a href="/auth/sign-in?next=%2Fsetup">대표님 계정으로 로그인하기</a></p>' : ''}<a href="/setup">운영 연결 확인 화면으로 돌아가기</a></main></body></html>`, {
    status,
    headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', ...(status === 405 ? { Allow: 'POST' } : {}) },
  });
}

/** Explicit, owner-verified initialization of a brand-new empty DB only. */
export function createInitializationHandler(dependencies: InitializationDependencies) {
  return async function initialize(request: Request): Promise<Response> {
    if (request.method !== 'POST') return failure(405, '운영 연결 확인 화면의 준비 버튼으로 실행해 주세요.');
    const origin = request.headers.get('origin');
    if (!dependencies.trustedOrigin(origin) || origin !== new URL(request.url).origin) {
      return failure(403, '요청한 사이트 주소가 올바르지 않습니다. 운영 연결 확인 화면에서 다시 실행해 주세요.');
    }
    const ownerEmail = dependencies.ownerEmail()?.trim().toLowerCase();
    if (!ownerEmail) {
      return failure(503, '관리자 이메일 설정이 필요합니다. Vercel 설정에 OWNER_BOOTSTRAP_EMAIL을 저장한 뒤 다시 배포해 주세요.');
    }
    let account: ClerkAccountState;
    try { account = await dependencies.accountState(); }
    catch { return failure(503, '로그인 연결을 확인하지 못했습니다. 로그인 서비스 설정을 확인한 뒤 다시 시도해 주세요.'); }
    if (account.status === 'unavailable') {
      return failure(503, '로그인 연결을 확인하지 못했습니다. 로그인 서비스 설정을 확인한 뒤 다시 시도해 주세요.');
    }
    if (account.status === 'signed-out') return failure(401, '대표님 계정으로 로그인한 뒤 다시 시도해 주세요.', true);
    if (account.status !== 'verified' || account.user.email.trim().toLowerCase() !== ownerEmail) {
      return failure(403, '이메일 인증을 완료한 대표님 계정만 실행할 수 있습니다. 설정된 관리자 이메일과 로그인 계정을 확인해 주세요.');
    }
    if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/x-www-form-urlencoded') {
      return failure(415, '운영 연결 확인 화면의 준비 버튼으로 실행해 주세요.');
    }
    let body: Uint8Array;
    try { body = await limitedBody(request, 4096); }
    catch { return failure(413, '요청 내용을 읽지 못했습니다. 운영 연결 확인 화면에서 다시 실행해 주세요.'); }
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(body); }
    catch { return failure(400, '확인 내용을 읽지 못했습니다. 운영 연결 확인 화면에서 다시 실행해 주세요.'); }
    // URLSearchParams alone tolerates malformed escapes and duplicates; reject
    // both so the required confirmation is exactly one known form field.
    if (/%(?![\da-f]{2})/i.test(text)) return failure(400, '확인 내용을 읽지 못했습니다. 운영 연결 확인 화면에서 다시 실행해 주세요.');
    const fields = new URLSearchParams(text);
    if (fields.getAll('confirm_new_empty').length !== 1 || fields.get('confirm_new_empty') !== 'yes'
      || [...fields.keys()].some(key => key !== 'confirm_new_empty')) {
      return failure(400, '기존 회원·주문이 없는 새 빈 데이터베이스인지 확인한 뒤 체크해 주세요.');
    }
    try {
      const database = dependencies.database();
      const existing = await database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
      if (existing.results.length) {
        return failure(409, '이미 데이터베이스에 저장 테이블이 있습니다. 기존 데이터를 바꾸지 않았습니다. 운영 연결 확인 화면에서 상태를 확인해 주세요.');
      }
      const now = new Date().toISOString();
      // Recheck emptiness inside the same write transaction as every CREATE.
      // The random temporary table cannot collide with another initializer,
      // and CHECK failure rolls its creation and all main schema changes back.
      const guard = 'street_label_init_guard_' + randomUUID().replaceAll('-', '');
      const statements = [
        database.prepare(`CREATE TEMP TABLE ${guard}(existing_table_count INTEGER NOT NULL CHECK(existing_table_count=0))`),
        database.prepare(`INSERT INTO ${guard}(existing_table_count) SELECT count(*) FROM main.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`),
        database.prepare(`CREATE TABLE ${initializationPlan.ledger}(migration TEXT PRIMARY KEY NOT NULL,sha256 TEXT NOT NULL,applied_at TEXT NOT NULL)`),
      ];
      for (const migration of initializationPlan.migrations) {
        statements.push(...migration.statements.map(sql => database.prepare(sql)));
        statements.push(database.prepare(`INSERT INTO ${initializationPlan.ledger}(migration,sha256,applied_at) VALUES(?,?,?)`).bind(migration.name, migration.sha256, now));
      }
      // The D1-shaped adapter uses one libSQL write transaction. Concurrent
      // initializers cannot overwrite the ledger/table created by the winner;
      // a failed statement rolls back this complete batch. No shop rows seed.
      try { await database.batch(statements); }
      catch {
        const present = await database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
        if (present.results.length) {
          return failure(409, '이미 데이터베이스에 저장 테이블이 있습니다. 기존 데이터를 바꾸지 않았습니다. 운영 연결 확인 화면에서 상태를 확인해 주세요.');
        }
        throw new Error('Initialization did not complete.');
      }
      return new Response(null, { status: 303, headers: { ...headers, Location: '/setup' } });
    } catch {
      return failure(503, '데이터베이스 준비를 완료하지 못했습니다. 운영 연결 확인 화면에서 설정을 확인해 주세요. 기존 테이블이 생겼다면 초기화를 다시 실행하지 마세요.');
    }
  };
}

export const POST = createInitializationHandler({
  accountState: getClerkAccountState,
  ownerEmail: () => process.env.OWNER_BOOTSTRAP_EMAIL,
  database: getDatabase,
  trustedOrigin: isTrustedOrigin,
});

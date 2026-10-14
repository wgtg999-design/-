import { auth, clerkClient } from '@clerk/nextjs/server';
import { authConfigured, isTrustedOrigin, safeRelativeReturnPath } from '../../../../runtime/auth';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

export async function POST(request: Request) {
  if (!isTrustedOrigin(request.headers.get('origin')) || request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({ error: '잘못된 요청 출처입니다.' }, { status: 403, headers });
  }
  if (!authConfigured()) return Response.json({ error: '로그인 연결 준비 중입니다.' }, { status: 503, headers });
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) {
    return Response.json({ error: '잘못된 요청입니다.' }, { status: 415, headers });
  }
  const reader = request.body?.getReader();
  let total = 0;
  const chunks: Uint8Array[] = [];
  if (reader) for (;;) {
    const result = await reader.read();
    if (result.done) break;
    total += result.value.length;
    if (total > 4096) {
      await reader.cancel();
      return Response.json({ error: '요청이 너무 큽니다.' }, { status: 413, headers });
    }
    chunks.push(result.value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  const next = safeRelativeReturnPath(new URLSearchParams(new TextDecoder().decode(body)).get('next') ?? '/');
  try {
    const session = await auth();
    if (session.sessionId) await (await clerkClient()).sessions.revokeSession(session.sessionId);
    const responseHeaders = new Headers({ ...headers, Location: next });
    // Clear the managed session cookie immediately after revocation. Clerk's
    // revoked session cannot refresh it on the next provider handshake.
    const cookies = request.headers.get('cookie')?.split(';').map(cookie => cookie.trim().split('=')[0]) ?? [];
    for (const name of new Set(['__session', ...cookies.filter(name => /^__session(?:_[a-zA-Z0-9]+)?$/.test(name))])) {
      responseHeaders.append('Set-Cookie', `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`);
    }
    return new Response(null, { status: 303, headers: responseHeaders });
  } catch {
    return Response.json({ error: '로그아웃하지 못했습니다. 다시 시도해 주세요.' }, { status: 503, headers });
  }
}

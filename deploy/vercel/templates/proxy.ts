import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { authConfigured, trustedOrigins } from './runtime/auth-config';

// Clerk verifies its managed session cookie/token. Page/API owner and customer
// checks remain in the commerce server; middleware never trusts oai-* headers.
export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  // A public read-only diagnostic remains accessible even if Clerk is not
  // configured. This exception exposes no identities, credentials or actions.
  if (request.nextUrl.pathname === '/setup' && ['GET','HEAD'].includes(request.method)) return NextResponse.next();
  if (!authConfigured()) {
    if (request.nextUrl.pathname === '/auth' || request.nextUrl.pathname.startsWith('/auth/')) {
      return new NextResponse('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>로그인 연결 준비 중</title><body style="font:16px Arial,sans-serif;max-width:560px;margin:64px auto;padding:24px"><h1>로그인 연결 준비 중</h1><p>운영자가 이메일 인증 서비스와 데이터베이스를 연결한 뒤 이용할 수 있습니다.</p><a href="/">홈페이지로 돌아가기</a></body></html>', {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
      });
    }
    return NextResponse.next();
  }
  return clerkMiddleware({ authorizedParties: trustedOrigins() })(request, event);
}

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|map|txt|xml)).*)', '/(api)(.*)'],
};

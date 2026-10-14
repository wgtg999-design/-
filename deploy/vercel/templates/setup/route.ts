import { getReadiness } from '../../runtime/readiness';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const state = await getReadiness();
  const rows = [
    ['상품 저장소 연결', state.databaseConnected ? 'DB에 연결됩니다.' : state.databaseConfigured ? 'DB 연결을 확인해야 합니다.' : 'Turso 연결 설정이 필요합니다.'],
    ['저장 테이블 준비', state.schemaReady ? '현재 코드에 필요한 테이블을 확인했습니다.' : '새 DB 초기화 또는 기존 자료 이전을 확인해야 합니다.'],
    ['상품 자료', state.catalog === 'stored' ? '저장된 상품 자료를 읽을 수 있습니다. 기존 자료와 같은지는 별도 확인이 필요합니다.' : state.catalog === 'initial-sample' ? '초기 시안 상품을 표시하는 상태입니다. 실제 운영 자료 이전 여부를 확인하세요.' : '상품 자료를 아직 읽을 수 없습니다.'],
    ['로그인 서비스', state.authConfigured ? '로그인 설정이 있습니다. 실제 이메일 인증과 로그인을 확인해야 합니다.' : 'Clerk 키와 사이트 주소 설정이 필요합니다.'],
    ['관리자 등록', state.ownerRegistered ? '저장된 관리자 기록이 있습니다. 대표님 계정의 실제 접근을 확인해야 합니다.' : '대표님의 인증된 계정을 관리자로 등록해야 합니다.'],
    ['이미지 교체', state.uploadConfigured ? '업로드 설정이 있습니다. 실제 R2 연결과 허용 주소를 확인해야 합니다.' : 'R2 연결과 업로드 서명 설정이 필요합니다.'],
    ['쇼핑몰 회원 등록', state.legalReady ? '약관과 개인정보 안내가 등록되어 있습니다. 내용은 운영자가 확인해야 합니다.' : '실제 이용약관과 개인정보 안내를 등록해야 합니다.']
  ];
  // Every displayed string is fixed application copy; no database fields or
  // environment values are interpolated into this public diagnostic page.
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>운영 연결 확인</title><style>body{font:15px Arial,sans-serif;color:#111;max-width:800px;margin:40px auto;padding:20px;line-height:1.8}h1{font-size:25px}dl{margin:30px 0}dt{font-weight:600;margin-top:20px}dd{margin:0;padding:0 0 16px;border-bottom:1px solid #ddd}a{color:inherit}</style></head><body><h1>운영 연결 확인</h1><p>대표님, 아래 상태를 확인해 주세요. 이 화면은 설정을 확인만 하며 데이터를 저장하거나 관리자 권한을 만들지 않습니다.</p><dl>${rows.map(([label,message])=>`<dt>${label}</dt><dd>${message}</dd>`).join('')}</dl><p>이 화면을 캡처해 공유해도 비밀키·관리자 이메일·회원·주문 내용은 표시되지 않습니다.</p><p><a href="/">홈페이지로 돌아가기</a></p></body></html>`;
  return new Response(html, { headers: { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'X-Robots-Tag':'noindex, nofollow' } });
}

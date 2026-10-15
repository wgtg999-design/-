import { getReadiness } from '../../runtime/readiness';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const state = await getReadiness();
  const auth = state.authConfiguration;
  const siteStatus = {
    missing: 'NEXT_PUBLIC_SITE_URL이 없습니다. Vercel 값 칸에 https://street-label-shop.vercel.app을 저장해 주세요.',
    invalid: 'NEXT_PUBLIC_SITE_URL 값에 실제 HTTPS 사이트 주소만 한 줄로 입력해 주세요.',
    ready: '사이트 주소 형식을 확인했습니다.',
  }[auth.siteUrl];
  const publicKeyStatus = {
    missing: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY가 없습니다. Clerk의 Publishable key를 Vercel에 저장해 주세요.',
    invalid: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY 값에는 pk_test_ 또는 pk_live_로 시작하는 키 전체만 넣어 주세요. 이름= 부분, 따옴표와 여러 줄을 넣으면 인식하지 못합니다.',
    ready: auth.publishableKeySource === 'compatibility'
      ? '공개키 형식을 확인했습니다. 앞서 사용한 NEXT_PUBLIC_CLERK_PUBLISHABLE 이름도 읽을 수 있게 처리했습니다.'
      : '공개키 형식을 확인했습니다.',
  }[auth.publishableKey];
  const secretKeyStatus = {
    missing: 'CLERK_SECRET_KEY가 없습니다. Clerk의 Secret key를 Vercel에 저장해 주세요.',
    invalid: 'CLERK_SECRET_KEY 값에는 sk_test_ 또는 sk_live_로 시작하는 키 전체만 넣어 주세요. 이름= 부분, 따옴표와 여러 줄을 넣으면 인식하지 못합니다.',
    ready: '비밀키 형식을 확인했습니다. 키값은 이 화면에 표시하지 않습니다.',
  }[auth.secretKey];
  const pairStatus = auth.keysMatch ? '공개키와 비밀키의 테스트·운영 구분이 일치합니다. 같은 Clerk 앱에서 복사했는지는 실제 로그인으로 확인해야 합니다.'
    : auth.publishableKey === 'ready' && auth.secretKey === 'ready'
      ? '테스트키와 운영키가 섞여 있습니다. 같은 Clerk 앱의 Development 화면에서 두 키를 다시 복사해 주세요.'
      : '공개키와 비밀키 설정을 먼저 완료해 주세요.';
  const customerReady = state.schemaReady && state.authConfigured;
  const rows = [
    ['사이트 모드', state.testMode ? '테스트 전용입니다. 사업자 정보는 가상이며 실제 주문 접수는 중지됩니다.' : '실제 운영 모드입니다. 테스트 안내는 가입 기본값으로 사용하지 않습니다.'],
    ['상품 저장소 연결', state.databaseConnected ? 'DB에 연결됩니다.' : state.databaseConfigured ? 'DB 연결을 확인해야 합니다.' : 'Turso 연결 설정이 필요합니다.'],
    ['저장 테이블 준비', state.schemaReady ? '현재 코드에 필요한 테이블을 확인했습니다.' : '새 DB 초기화 또는 기존 자료 이전을 확인해야 합니다.'],
    ['상품 자료', state.catalog === 'stored' ? '저장된 상품 자료를 읽을 수 있습니다. 기존 자료와 같은지는 별도 확인이 필요합니다.' : state.catalog === 'initial-sample' ? '초기 시안 상품을 표시하는 상태입니다. 실제 운영 자료 이전 여부를 확인하세요.' : '상품 자료를 아직 읽을 수 없습니다.'],
    ['로그인 서비스', state.authConfigured ? '로그인 설정이 있습니다. 실제 이메일 인증과 로그인을 확인해야 합니다.' : 'Clerk 키와 사이트 주소 설정이 필요합니다.'],
    ['사이트 주소 설정', siteStatus],
    ['Clerk 공개키 설정', publicKeyStatus],
    ['Clerk 비밀키 설정', secretKeyStatus],
    ['Clerk 키 연결', pairStatus],
    ['관리자 등록', state.ownerRegistered ? '저장된 관리자 기록이 있습니다. 대표님 계정의 실제 접근을 확인해야 합니다.' : state.ownerBootstrapConfigured ? '관리자 이메일 설정이 있습니다. 대표님의 인증된 계정으로 관리자 화면을 열어 등록을 확인하세요.' : 'Vercel에서 OWNER_BOOTSTRAP_EMAIL에 대표님이 로그인할 이메일을 지정해야 합니다.'],
    ['이미지 교체', state.uploadConfigured ? '업로드 설정이 있습니다. 실제 R2 연결과 허용 주소를 확인해야 합니다.' : '새 사진 업로드에는 R2 연결과 업로드 서명 설정이 필요합니다. 저장 테이블과 관리자 등록을 마치면 기존 배너의 순서 변경·삭제는 사용할 수 있습니다.'],
    ['쇼핑몰 회원 등록', state.legalReady ? state.testMode ? '저장된 안내가 있습니다. 테스트용 여부와 내용을 확인한 뒤 가상정보로 가입을 시험하세요.' : '약관과 개인정보 안내가 등록되어 있습니다. 내용은 운영자가 확인해야 합니다.' : state.testPoliciesAvailable ? customerReady ? '테스트 이용약관·개인정보 안내가 적용되어 회원가입 화면에서 이름과 동의사항을 입력할 수 있습니다.' : '테스트 이용약관·개인정보 안내를 준비했습니다. Clerk 인증과 DB 준비가 완료되어야 테스트 회원정보를 저장할 수 있습니다.' : state.testMode ? '저장된 안내가 비어 있거나 유효하지 않습니다. 관리자가 테스트 안내를 확인해야 합니다.' : '실제 이용약관과 개인정보 안내를 등록해야 합니다.']
  ];
  const canInitialize = state.databaseConnected && state.authConfigured && state.ownerBootstrapConfigured && !state.schemaReady;
  const preparation = state.schemaReady
    ? '<p><strong>회원정보 저장 준비가 완료되었습니다.</strong> 아래에서 회원가입을 계속하거나 관리자 화면을 열 수 있습니다.</p><p><a href="/signup">회원가입 계속하기</a> · <a href="/account">내 계정 열기</a></p>'
    : `<p>대표님께서 실제 회원·주문이 없는 새 DB로 시작할 때 사용하는 버튼입니다. 기존 테이블이 있으면 서버가 거부합니다.</p><form method="post" action="/api/setup/initialize"><label><input type="checkbox" name="confirm_new_empty" value="yes" required ${canInitialize ? '' : 'disabled'}> 기존 자료가 없는 새 DB에 저장 테이블을 만드는 것을 확인합니다.</label><p><button type="submit" ${canInitialize ? '' : 'disabled'}>새 DB 준비</button></p></form><p>버튼을 사용하려면 Turso·Clerk 연결과 사이트 주소·관리자 이메일 설정을 먼저 완료하세요. 실제 고객·주문 자료가 있으면 이 버튼 대신 데이터 이전 절차를 진행해야 합니다.</p>`;
  const configurationHelp = state.authConfigured ? '' : '<p><a href="https://vercel.com/123-f2e9/street-label-shop/settings/environment-variables">Vercel에서 표시된 연결값 수정하기</a></p><p>수정한 뒤 Deployments에서 최신 배포의 Redeploy를 실행해야 사이트에 적용됩니다.</p>';
  const readyLinks = customerReady ? '<nav aria-label="준비된 기능"><a href="/signup">회원가입 계속하기</a> · <a href="/admin">관리자 화면 열기</a></nav>' : '';
  // Every displayed string is fixed application copy; no database fields or
  // environment values are interpolated into this public diagnostic page.
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>운영 연결 확인</title><style>body{font:15px Arial,sans-serif;color:#111;max-width:800px;margin:40px auto;padding:20px;line-height:1.8}h1{font-size:25px}h2{font-size:20px;margin-top:32px}dl{margin:30px 0}dt{font-weight:600;margin-top:20px}dd{margin:0;padding:0 0 16px;border-bottom:1px solid #ddd;overflow-wrap:anywhere}a{color:inherit}button{padding:12px 20px;background:#111;color:#fff;border:0;cursor:pointer;font:inherit}button:disabled{opacity:.4;cursor:not-allowed}input{width:18px;height:18px}</style></head><body><h1>운영 연결 확인</h1><p>대표님, 상태 확인은 데이터를 변경하지 않습니다. 아래의 ‘새 DB 준비’는 대표님의 인증된 계정과 확인을 거쳐 새 DB에 저장 테이블을 만드는 별도 작업입니다.</p>${readyLinks}<dl>${rows.map(([label,message])=>`<dt>${label}</dt><dd>${message}</dd>`).join('')}</dl>${configurationHelp}<h2>대표님이 진행할 순서</h2><p><a href="/auth/sign-in?next=%2Fsetup">1. 대표님 계정으로 로그인</a></p>${preparation}<p><a href="/admin">3. 관리자 화면 열기</a></p><p>이 화면을 캡처해 공유해도 비밀키·관리자 이메일·회원·주문 내용은 표시되지 않습니다.</p><p><a href="/help/owner">전화번호 요구 끄기·관리자 계정·R2 가입 안내</a></p><p><a href="/">홈페이지로 돌아가기</a></p></body></html>`;
  return new Response(html, { headers: { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'X-Robots-Tag':'noindex, nofollow' } });
}

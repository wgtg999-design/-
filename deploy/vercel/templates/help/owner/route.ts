export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Public instructions only. No provider credentials, owner identity, account
// creation, database initialization or external requests happen on this GET.
export async function GET() {
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>대표님 설정 안내 · YOUR LABEL</title><style>
  *{box-sizing:border-box}body{margin:0;background:#fafafa;color:#181818;font:16px/1.8 Arial,sans-serif}main{max-width:820px;margin:auto;padding:32px 20px 80px}h1{font-size:28px;line-height:1.4}h2{font-size:22px;margin:0 0 16px}h3{font-size:18px}section{margin-top:28px;padding:24px;background:#fff;border:1px solid #ddd;scroll-margin-top:20px}a{color:inherit;text-underline-offset:4px}nav{display:flex;flex-wrap:wrap;gap:12px 24px}li{padding:5px 0}code{overflow-wrap:anywhere;font-size:14px}pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:14px;border:1px solid #ddd;background:#f7f7f7;font-size:13px;line-height:1.7}table{width:100%;border-collapse:collapse;font-size:14px}td,th{text-align:left;padding:10px 6px;border-bottom:1px solid #ddd;overflow-wrap:anywhere}button,.button{display:inline-block;background:#171717;color:#fff;border:0;padding:12px 16px;font:inherit;cursor:pointer;text-decoration:none}button:disabled{opacity:.5}.note{padding-left:12px;border-left:3px solid #777;color:#444}.steps{display:flex;flex-wrap:wrap;gap:8px;font-size:14px}.steps span{border:1px solid #ccc;padding:6px 10px}#copy-status{min-height:28px;font-size:14px}@media(max-width:480px){main{padding:24px 12px 64px}section{padding:18px 14px}h1{font-size:24px}table{font-size:13px}}
  </style></head><body><main><a href="/">← 쇼핑몰로 돌아가기</a><h1>대표님, 이 순서대로 눌러 주세요.</h1><nav><a href="#phone">전화번호 요구 끄기</a><a href="#owner">관리자 계정</a><a href="#r2">R2 가입과 연결</a></nav>
  <section id="phone"><h2>1. 회원가입에서 전화번호 요구 끄기</h2><p>쇼핑몰의 회원정보 가입 양식은 이름과 동의사항만 받습니다. 로그인 서비스인 Clerk가 요구하는 전화번호는 Clerk 설정에서 따로 꺼야 합니다.</p><ol>
  <li><a href="https://dashboard.clerk.com/~/user-authentication/user-and-authentication" target="_blank" rel="noopener">Clerk 로그인 설정 열기 ↗</a></li>
  <li>위쪽에서 이 쇼핑몰 앱과 <strong>Development</strong>를 선택합니다.</li>
  <li><strong>Email</strong>에서 이메일 가입·로그인과 이메일 인증을 켭니다. <strong>Password</strong>에서 비밀번호 가입을 켭니다.</li>
  <li><strong>Phone</strong>에서 전화번호 가입과 <strong>Require phone number</strong>가 켜져 있으면 끕니다. <strong>Save</strong>를 누릅니다.</li>
  <li><a href="https://dashboard.clerk.com/~/user-authentication/multi-factor" target="_blank" rel="noopener">추가 인증 설정 열기 ↗</a>에서 SMS 인증을 필수로 요구하는 설정도 확인합니다. 인증 앱·백업 코드 등 다른 인증 수단을 함께 끌 필요는 없습니다.</li>
  <li><a href="/auth/sign-up?next=%2Fsetup">쇼핑몰 이메일 회원가입 다시 열기</a>. Google 버튼 대신 이메일과 비밀번호로 시작할 수 있습니다.</li></ol>
  <p class="note">이 안내 페이지를 열거나 코드를 배포하는 것만으로 Clerk 설정이 바뀌지는 않습니다. 설정을 바꿨는데도 전화번호를 요구하면 요구 화면을 확인해야 합니다.</p></section>
  <section id="owner"><h2>2. 대표님 관리자 계정</h2><p>Vercel의 <code>OWNER_BOOTSTRAP_EMAIL</code>에 지정한 대표님 이메일을 사용합니다. 다른 방문자에게 관리자 권한을 주지 않습니다.</p><ol>
  <li><a href="https://vercel.com/123-f2e9/street-label-shop/settings/environment-variables" target="_blank" rel="noopener">Vercel 관리자 이메일 설정 확인하기 ↗</a>. 위 항목이 대표님 이메일인지 확인합니다. 값을 바꿨다면 최신 배포를 재배포합니다.</li>
  <li><a href="/auth/sign-up?next=%2Fsetup">대표님 쇼핑몰 계정 만들기</a>. 같은 이메일로 가입하고 이메일로 온 인증을 마칩니다. 이미 쇼핑몰 계정을 만들었다면 <a href="/auth/sign-in?next=%2Fsetup">로그인</a>합니다.</li>
  <li><a href="/setup">연결 확인 화면</a>에서 새 빈 DB에만 <strong>새 DB 준비</strong>를 실행합니다. 기존 테이블이 있으면 삭제하거나 다시 초기화하지 않습니다.</li>
  <li><a href="/admin">관리자 화면 열기</a>. 인증된 대표님 계정을 관리자로 등록하고 브랜드·상품·배너를 편집합니다.</li></ol>
  <p>Clerk 관리 사이트 가입과 쇼핑몰 계정 가입은 별개입니다. 이 안내는 계정 발급이나 비밀번호 공유가 완료됐다는 뜻이 아닙니다. 대표님이 정한 비밀번호와 이메일 인증은 Clerk에서 처리합니다.</p></section>
  <section id="r2"><h2>3. R2 가입 — 배너 사진을 넣을 보관함 만들기</h2><p>R2는 사진 보관함입니다. 대표님만 가입하면 됩니다.</p><div class="steps" aria-label="가입 순서"><span>① 가입</span><span>② 이메일 확인</span><span>③ R2 시작</span><span>④ 사진 보관함 만들기</span><span>⑤ 쇼핑몰 연결</span></div><ol>
  <li><a href="https://dash.cloudflare.com/sign-up" target="_blank" rel="noopener">Cloudflare 가입 화면 열기 ↗</a>. 대표님 이메일과 비밀번호로 가입하고 이메일 인증을 마칩니다.</li>
  <li><a href="https://dash.cloudflare.com/?to=/:account/r2/overview" target="_blank" rel="noopener">R2 화면 열기 ↗</a>. 계정 선택이 나오면 대표님 계정을 선택합니다.</li>
  <li><strong>Get started</strong> 또는 <strong>Enable R2</strong>를 누릅니다. 결제수단을 요구하면 Cloudflare 화면에서 직접 등록합니다. 무료 제공량이 있지만 초과 사용에는 요금이 발생할 수 있으니 표시된 조건을 확인합니다.</li>
  <li><strong>Create bucket</strong>을 누릅니다. 이름에 <code>street-label-images</code>를 입력하고 생성합니다. 이미 만든 보관함이 있으면 새로 만들지 않습니다. 공개 설정은 켜지 않습니다.</li>
  <li>R2 화면의 <strong>Manage API Tokens</strong>를 누르고 <strong>Create Account API token</strong> 또는 표시된 생성 버튼을 누릅니다.</li>
  <li>권한은 <strong>Object Read &amp; Write</strong>, 보관함 범위는 <strong>street-label-images 하나만</strong> 선택하고 만듭니다.</li>
  <li>발급 화면의 <strong>Access Key ID</strong>와 <strong>Secret Access Key</strong>를 아래 Vercel 값 칸에 각각 넣습니다. Cloudflare API Token 자체와 다른 값입니다. Account ID는 R2의 계정 정보에서 확인합니다.</li></ol>
  <p><a class="button" href="https://vercel.com/123-f2e9/street-label-shop/settings/environment-variables" target="_blank" rel="noopener">Vercel 값 넣는 화면 열기 ↗</a></p>
  <p><strong>Add Environment Variable</strong>로 아래 5개를 하나씩 저장합니다. 적용 환경은 <strong>Production</strong>입니다.</p><table><thead><tr><th>Name — 이름</th><th>Value — 값</th></tr></thead><tbody>
  <tr><td><code>R2_ACCOUNT_ID</code></td><td>R2 계정의 Account ID</td></tr><tr><td><code>R2_BUCKET_NAME</code></td><td><code>street-label-images</code></td></tr><tr><td><code>R2_ACCESS_KEY_ID</code></td><td>Access Key ID</td></tr><tr><td><code>R2_SECRET_ACCESS_KEY</code></td><td>Secret Access Key</td></tr><tr><td><code>UPLOAD_SIGNING_SECRET</code></td><td>아래 버튼을 눌러 복사한 값</td></tr></tbody></table>
  <p><button id="generate-secret" type="button">업로드용 무작위 비밀값 복사</button></p><p id="copy-status" role="status" aria-live="polite"></p><p class="note">버튼은 이 브라우저에서 안전한 무작위 값을 만들고 클립보드에만 복사합니다. 화면·서버·회원정보에 저장하지 않습니다. Vercel의 위 값 칸에 붙여 넣으세요. 키나 비밀번호를 채팅으로 보내지 마세요.</p>
  <h3>마지막으로 사진 전송 허용하기</h3><ol><li><a href="https://dash.cloudflare.com/?to=/:account/r2/overview" target="_blank" rel="noopener">R2 화면 열기 ↗</a> → <strong>street-label-images → Settings → CORS Policy → Add / Edit</strong>를 누릅니다.</li><li>아래 내용을 붙여 넣고 저장합니다.</li></ol><pre id="cors">[
  {
    "AllowedOrigins": ["https://street-label-shop.vercel.app"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]</pre><button id="copy-cors" type="button">위 CORS 내용 복사</button><ol start="3"><li><a href="https://vercel.com/123-f2e9/street-label-shop/deployments" target="_blank" rel="noopener">Vercel 배포 화면 열기 ↗</a> → 맨 위 배포의 <strong>⋯ → Redeploy → Redeploy</strong>. <strong>Ready</strong>를 기다립니다.</li><li><a href="/admin#visuals">관리자 메인 사진 열기</a> → 사진 교체 또는 사진 추가 → <strong>변경사항 저장</strong>. JPG·PNG·WebP 한 장 최대 8MB입니다.</li><li><a href="/">홈페이지</a>를 새로고침해 확인합니다. 기존 업로드 사진이나 데이터가 자동 이전되지는 않습니다.</li></ol><p><a href="https://developers.cloudflare.com/r2/get-started/" target="_blank" rel="noopener">Cloudflare 공식 R2 시작 안내 ↗</a> · <a href="/setup">현재 연결 상태 확인</a></p></section>
  <script>
  const status=document.getElementById('copy-status');
  document.getElementById('generate-secret').addEventListener('click',async function(){
    this.disabled=true;
    try{const bytes=crypto.getRandomValues(new Uint8Array(32));const value=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');await navigator.clipboard.writeText(value);status.textContent='복사했습니다. Vercel의 UPLOAD_SIGNING_SECRET 값 칸에 붙여 넣고 저장하세요.';}
    catch{status.textContent='복사하지 못했습니다. HTTPS 주소에서 클립보드 권한을 허용한 뒤 다시 누르세요.';}finally{this.disabled=false;}
  });
  document.getElementById('copy-cors').addEventListener('click',async function(){
    try{await navigator.clipboard.writeText(document.getElementById('cors').textContent);status.textContent='CORS 내용을 복사했습니다. R2 보관함의 CORS Policy 칸에 붙여 넣으세요.';}catch{status.textContent='자동 복사가 되지 않았습니다. 위 CORS 내용을 직접 선택해서 복사해 주세요.';}
  });
  </script></main></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' } });
}

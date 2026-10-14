# 대표님이 누를 버튼 순서

현재 프로젝트는 `street-label-shop`입니다. 새 Vercel 프로젝트를 만들지 않고 이 프로젝트의 연결을 마칩니다. 대표님은 기존 Sites에 실제 회원·주문이 없다고 확인하셨습니다. 아래 DB 준비는 **연결한 Turso DB도 새 빈 DB일 때** 사용할 수 있습니다.

## 먼저 로그인 연결

1. [Vercel의 Clerk 연결 페이지](https://vercel.com/marketplace/clerk)를 엽니다.
2. **Add Integration** 또는 **Install**을 누릅니다. 팀은 **123**, 프로젝트는 **street-label-shop**을 선택합니다. 연결 환경을 선택하면 **Production**을 포함합니다.
3. 안내에 따라 Clerk에 로그인하고 이 쇼핑몰용 앱을 연결합니다. Clerk 앱의 로그인 설정에서 **Email**과 **Password**를 켜고 **이메일 인증을 필수**로 설정합니다. 계정 만들기는 Clerk 계정 가입이며, 고객의 쇼핑몰 회원 등록은 마지막 단계에서 따로 열립니다.
4. [Vercel 프로젝트](https://vercel.com/123-f2e9/street-label-shop)를 엽니다. **Settings → Environment Variables**를 누릅니다.
5. 다음 두 항목을 **Production** 환경에 추가하고 **Save**를 누릅니다.

| 이름(Name / Key) | 값(Value) |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://street-label-shop.vercel.app` |
| `OWNER_BOOTSTRAP_EMAIL` | 대표님이 Clerk에서 가입하고 이메일 인증할 실제 이메일 주소 |

이메일 앞뒤에 공백을 넣지 마세요. 관리자 이메일을 다른 사람의 이메일로 지정하지 마세요.

6. 같은 목록에서 `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`와 `CLERK_SECRET_KEY`가 **Production**에 있는지 확인합니다. 자동 연결이 이 값을 만들지 않았다면 Clerk 앱의 **API Keys**에서 해당 값을 복사해 같은 이름으로 Vercel에 저장합니다. 비밀키는 채팅에 보내지 않습니다.
7. Turso도 **street-label-shop → Production**에 연결되어 있어야 합니다. 기존 연결이 있으면 새 DB를 만들지 않습니다. 연결할 때 Prefix는 **TURSO**, 배포마다 DB branch를 만드는 체크박스는 해제합니다. 자동 환경변수 `TURSO_URL`과 토큰도 앱에서 읽습니다.
8. Vercel의 **Deployments**를 누릅니다. 최신 `main` 배포의 **⋯ → Redeploy → Redeploy**를 누르고 **Ready**가 될 때까지 기다립니다. 이전 커밋만 보이면 GitHub의 최신 변경을 가져온 새 배포를 기다리세요.

Clerk의 **Development** 키는 연결 시험용입니다. 실제 판매 전에는 Clerk의 Production 인스턴스와 요구하는 도메인·DNS·이메일 설정을 완료해야 합니다. 계정 연결 또는 DNS 설정 화면이 나오면 내용을 확인하며 진행합니다. 키가 있다는 것만으로 실제 메일 발송이 검증된 것은 아닙니다.

## 1. 기존 시안 상품 표시하기

1. [운영 연결 확인](https://street-label-shop.vercel.app/setup)을 엽니다.
2. **1. 대표님 계정으로 로그인**을 누릅니다.
3. 처음이라면 로그인 상자의 **Sign up / 회원가입**을 누릅니다. 위에서 지정한 이메일로 가입하고 이메일로 온 인증 코드를 입력합니다. 이미 계정이 있다면 로그인합니다.
4. `/setup`으로 돌아오면 **기존 자료가 없는 새 DB에 저장 테이블을 만드는 것을 확인합니다.**에 체크합니다.
5. **새 DB 준비**를 누릅니다. 성공하면 같은 확인 화면으로 돌아오고 **저장 테이블 준비**가 준비된 상태로 바뀝니다.
6. [홈페이지](https://street-label-shop.vercel.app/)를 열고 **PRODUCT**를 누릅니다. 기존 소스에 포함된 시안 상품 네 개가 표시되는지 확인합니다.

버튼이 회색이면 위 상태 목록의 Turso·Clerk·관리자 이메일 설정부터 확인합니다. **이미 저장 테이블이 있다**는 메시지가 나오면 삭제하지 말고 확인 화면으로 돌아갑니다. 기존 테이블이 있는 DB는 이 버튼이 변경하지 않습니다.

이 작업은 소스에 포함된 기본 시안을 표시하도록 테이블을 준비합니다. 이전 Sites 관리자에서 따로 저장한 상품·배너 변경까지 가져오는 작업은 아닙니다. 기존 변경 자료가 필요하면 [데이터 이전 안내](DATABASE-MIGRATION.md)에 따라 원본을 확인해야 합니다. **BEST ITEM**은 관리자에서 상품의 추천 설정을 켠 뒤 표시됩니다. 초기 재고는 0이고 주문 접수는 닫혀 있습니다.

## 2. 대표님 관리자 계정과 배너 교체

### 관리자 화면 열기

1. `/setup`에서 **3. 관리자 화면 열기**를 누르거나 [관리자 주소](https://street-label-shop.vercel.app/admin)를 엽니다.
2. 위에서 지정한 이메일로 로그인하고 이메일 인증을 완료한 상태여야 합니다.
3. 처음 확인된 대표님 계정을 관리자 기록에 저장합니다. 이후에는 저장한 계정 ID로 권한을 확인합니다. 별도의 공용 **마스터 ID·비밀번호**는 없습니다.

브랜드명·상품 정보는 이 화면에서 편집할 수 있습니다. 새 배너 사진을 올리려면 다음 이미지 저장소 연결도 필요합니다.

### 이미지 저장소 연결

1. [Cloudflare](https://dash.cloudflare.com/)에 로그인합니다. **R2 Object Storage**를 엽니다. 처음이면 R2 이용 설정을 마칩니다. 결제 정보 또는 이용 요금 안내가 나오면 확인합니다.
2. 대표님이 관리하는 이미지 버킷이 없으면 **Create bucket**을 누르고 이름을 `street-label-images`로 만듭니다. 공개 설정은 켜지 않습니다. 기존 Sites의 관리 버킷에 직접 접근할 수 있다고 가정하지 않습니다.
3. R2의 **Manage R2 API Tokens → Create API token**을 누릅니다. **Object Read & Write**를 선택하고 권한 범위를 이 이미지 버킷으로 제한합니다.
4. 발급 화면의 **Access Key ID**, **Secret Access Key**와 계정의 **Account ID**를 확인합니다. 다른 Cloudflare API 토큰을 대신 넣지 않습니다.
5. Vercel 프로젝트의 **Settings → Environment Variables**에 아래 값을 **Production**으로 저장합니다.

| 이름 | 넣을 값 |
| --- | --- |
| `R2_ACCOUNT_ID` | Cloudflare 계정의 Account ID |
| `R2_BUCKET_NAME` | 위에서 만든 실제 버킷 이름 |
| `R2_ACCESS_KEY_ID` | R2 Access Key ID |
| `R2_SECRET_ACCESS_KEY` | R2 Secret Access Key |
| `UPLOAD_SIGNING_SECRET` | 아래 방법으로 만든 무작위 보안 값 |

Windows에서 보안 값을 만들려면 **시작 → PowerShell**을 열고 다음 한 줄을 붙여 넣은 뒤 Enter를 누릅니다. 값은 화면에 출력되지 않고 클립보드에 복사됩니다. Vercel의 `UPLOAD_SIGNING_SECRET` 값 칸에 **Ctrl+V → Save**로 넣습니다.

```powershell
$uploadBytes = New-Object byte[] 32; $uploadRandom = [System.Security.Cryptography.RandomNumberGenerator]::Create(); $uploadRandom.GetBytes($uploadBytes); ([BitConverter]::ToString($uploadBytes)).Replace('-', '').ToLowerInvariant() | Set-Clipboard; $uploadRandom.Dispose()
```

6. Cloudflare에서 이미지 버킷을 엽니다. **Settings → CORS Policy → Add / Edit**를 눌러 다음 내용을 붙여 넣고 저장합니다.

```json
[
  {
    "AllowedOrigins": ["https://street-label-shop.vercel.app"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

7. Vercel **Deployments → 최신 배포의 ⋯ → Redeploy**를 누르고 **Ready**를 기다립니다.
8. [관리자](https://street-label-shop.vercel.app/admin)에서 **메인 사진**을 누릅니다. 기존 사진의 교체 버튼으로 파일을 고르거나 **사진 추가**를 누릅니다. JPG·PNG·WebP, 한 장 최대 8MB입니다.
9. 미리보기를 확인하고 화면 아래 **변경사항 저장**을 누릅니다. 완료 안내 후 홈페이지를 새로고침합니다.

새 버킷을 연결해도 옛 업로드 이미지는 자동 복사되지 않습니다. 소스의 기본 시안 사진은 포함되어 있습니다. 옛 업로드 사진이 필요하면 [이미지 연결 안내](R2-STORAGE.md)의 별도 이전을 진행합니다.

## 3. 고객 로그인·회원가입 열기

1. [주문·재고 관리](https://street-label-shop.vercel.app/admin/orders)를 엽니다.
2. **운영 설정**을 누릅니다.
3. **이용약관**과 **개인정보 수집·이용 및 보관 안내**에 실제 운영에 맞는 내용을 넣습니다. 운영자 정보·수집 항목·이용 목적·보관 기간 등을 확인한 내용이어야 합니다.
4. **주문 접수 열기**는 아직 체크하지 않고 **운영 설정 저장**을 누릅니다.
5. [고객 회원가입](https://street-label-shop.vercel.app/signup)을 엽니다. 고객은 **이메일 계정 만들기 → 이메일 인증 → 이름·연락처 → 약관·개인정보 동의 → 회원 등록** 순서로 이용합니다. 기존 회원은 내 계정으로 이동합니다.

실제 약관이 없으면 쇼핑몰 가입은 계속 차단됩니다. 관리자 접근을 위해 고객 회원가입부터 완료할 필요는 없습니다. 기존 Sites는 ChatGPT 로그인이고, 이 Vercel 이전본은 Clerk 이메일 로그인입니다. 카카오·네이버 로그인은 아직 연결하지 않았습니다.

실제 주문을 받으려면 같은 관리자 화면에서 **입금 계좌·고객센터·배송/취소/반품 안내·배송비**를 정확하게 저장하고 **옵션별 실제 재고·판매 활성화**를 설정한 뒤 주문 접수를 엽니다. 입금·환불 송금은 실제 은행에서 별도로 처리합니다.

## 어디까지 확인했는가

새 DB 준비·관리자 권한·회원 화면의 보호는 분리된 로컬 테스트로 확인합니다. 대표님의 실제 Clerk 가입·인증 메일, 운영 Turso 준비, R2 사진 저장과 Vercel 배포 성공은 실제 연결 뒤 확인해야 합니다. 비밀키·토큰·비밀번호는 Vercel과 각 서비스 설정 화면에만 입력합니다.

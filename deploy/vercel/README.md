# Vercel에 전체 쇼핑몰 배포하기

대표님, 이 폴더는 홈페이지 화면뿐 아니라 **로그인·회원·주문·재고·관리자**를 Vercel에서 실행하도록 준비한 서버입니다. 기존 Sites 원본은 저장소 루트에 그대로 보존했습니다. 빌드할 때 최신 원본 화면·상품·주문 코드를 가져와 Vercel용 연결로 바꿉니다.

현재 대표님 요청에 따라 `site-mode.json`의 **test** 모드를 사용합니다. [테스트 사이트 안내](TEST-SITE.md)의 시험용 약관·개인정보·가상 운영 정보를 표시하고 실제 주문 접수는 차단합니다. `STORE_SITE_MODE=live`로 전환하면 시험 문서는 가입 안내로 사용할 수 없습니다. 실제 로그인·회원 저장·관리자·업로드에는 서비스 연결과 확인된 계정이 계속 필요합니다.

## 사용하는 서비스

| 역할 | 서비스 | 실제 연결에 필요한 항목 |
| --- | --- | --- |
| 홈페이지와 서버 실행 | Vercel / Next.js | GitHub 저장소와 배포 주소 |
| 이메일 로그인·인증·비밀번호 재설정 | Clerk | 로그인 서비스 설정과 키 |
| 회원·주문·재고·상품 저장 | Turso | 새 영구 DB 주소와 토큰 |
| 이미지 저장 | Cloudflare R2 | 접근 가능한 비공개 버킷과 S3 키 |

이 서비스들은 별도 계정·사용량·요금 조건을 가집니다. 실제 외부 계정을 만들거나 비용을 발생시키는 배포는 이 코드 준비만으로 실행되지 않습니다. 기존 Sites의 ChatGPT 로그인과 D1·R2 연결은 자동 이전되지 않습니다. Vercel 배포본은 이메일 로그인이며, 기존 Sites 원본의 ChatGPT 로그인은 그대로입니다.

Vercel의 Turso **Connect a Project** 화면에서는 Custom Prefix를 `TURSO`, Environments를 `Production`으로 선택합니다. **Create database branch for deployment**의 체크박스는 비워 두어 운영 배포마다 다른 DB가 생기지 않도록 합니다. Sensitive는 켭니다. 자동 생성되는 `TURSO_URL`과 Turso 토큰 이름을 앱과 이전 도구가 읽을 수 있습니다. Preview 검증용 DB는 별도로 연결합니다.

## 대표님이 Vercel에서 선택할 설정

1. Vercel에 로그인하고 **Add New → Project → Import Git Repository**에서 `wgtg999-design/-`를 선택합니다.
2. **Root Directory를 `deploy/vercel`로 지정합니다.** 전체 저장소의 바깥 파일을 빌드에 포함하는 옵션(**Include source files outside of the Root Directory**)을 켭니다. 이 폴더의 빌드는 저장소 루트에 보존한 원본을 읽습니다.
3. Framework는 **Next.js**, Node.js는 **22.x**로 선택합니다. `vercel.json`에 설치·빌드 명령을 넣어 두었습니다.
4. 서비스 연결 전에는 실제 회원 등록·주문·관리자 저장이 열리지 않습니다. 먼저 아래 이전 순서를 지키고 운영 환경변수를 등록한 뒤 다시 배포합니다.

설치 명령은 `pnpm install --frozen-lockfile --prod=false`, Vercel 빌드 명령은 `node scripts/provision.mjs && pnpm run build`입니다. `provision.mjs`는 대표님이 위임한 현재 테스트 사이트의 Production 배포만 준비합니다. 확정 도메인·테스트 모드를 대조하며 빈 DB만 초기화하고 기존 자료를 덮어쓰지 않습니다. 관리자 연결은 [로그인 안내](AUTH.md)의 확인된 기존 계정 조건을 따릅니다. 일반 로컬 `pnpm run build`는 DB 준비 작업을 실행하지 않습니다. 이 폴더의 독립적인 `pnpm-workspace.yaml`이 원본 개발 환경과 의존성을 구분합니다. 생성된 `app/`, `lib/`, `public/`, `.next/`를 직접 수정하거나 Git에 저장하지 않습니다.

## 운영 연결 순서

처음 연결하는 대표님은 [버튼을 누르는 순서 안내](START-HERE.md)를 따르세요. 배포된 `/help/owner`에는 전화번호 요구를 끄는 Clerk 설정 링크, 대표님 계정 연결, R2 가입·보관함·키·CORS 연결 순서와 브라우저 내 무작위 업로드 비밀값 복사 버튼이 있습니다. 안내 페이지가 외부 계정이나 저장소를 자동 생성하지 않습니다. 배포 후 `/setup`을 열면 비밀값 없이 상품 DB 연결·테이블 준비·로그인·관리자 기록·이미지 업로드·가입 안내 설정을 확인할 수 있습니다. 상태 조회는 데이터를 변경하지 않습니다. 별도의 **새 DB 준비** 버튼은 서버에 지정한 관리자 이메일과 일치하는 인증된 Clerk 계정만 사용할 수 있고, 저장 테이블이 하나라도 있으면 거부합니다. 설정이 있다는 표시와 실제 운영 연결 검증은 별개입니다.

1. **새 Turso DB를 먼저 초기화**합니다. 기존 데이터가 있으면 모든 쓰기를 중단한 일관된 원본 내보내기를 받아, 새 빈 DB에만 가져옵니다. [데이터 이전 안내](DATABASE-MIGRATION.md)의 `--plan`/읽기 확인부터 진행합니다. 기존 DB를 삭제하거나 덮어쓰지 않습니다.
2. Clerk에서 이메일·비밀번호와 필수 이메일 인증을 설정합니다. 기존 회원·관리자는 확인한 새 계정 ID와 기존 Sites ID를 명시적으로 연결합니다. 이메일이 같다는 이유로 자동 합치지 않습니다. [로그인 설정 안내](AUTH.md)를 따릅니다.
3. 기존 R2에 실제 접근할 수 있으면 같은 객체 키로 연결합니다. 접근할 수 없으면 원래 호스팅에서 이미지 내보내기를 받아 새 비공개 R2로 복사합니다. [이미지 연결 안내](R2-STORAGE.md)를 따릅니다. 원본 시안 `public/assets`는 Git에 포함되어 있습니다.
4. Vercel의 **Settings → Environment Variables**에 [필요한 환경변수 이름](environment.example)을 등록합니다. 비밀키·토큰은 그 화면에 입력하고 채팅·Git에 보내지 않습니다. `NEXT_PUBLIC_SITE_URL`에는 실제 HTTPS 홈페이지 주소를 넣습니다.
5. 새 DB의 데이터 가져오기와 신원 연결을 확인한 **뒤에** 운영 로그인·쓰기를 허용합니다. 먼저 관리자 로그인이 새 빈 DB에 관리자 기록을 만들면 안전한 가져오기 도구가 비어 있지 않은 DB를 거부합니다. Preview 검증에는 별도 테스트 DB·버킷·인증 인스턴스를 사용합니다.
6. 운영 도메인에서 실제 이메일 인증·비밀번호 재설정·본인 주문·다른 계정 차단·관리자 저장·8MB 이미지 업로드를 확인합니다. 확인 후에만 운영 전환과 주문 접수를 엽니다. 기존 주소와 공개 범위는 이 준비 작업에서 바꾸지 않았습니다.

상품 약관·개인정보·계좌·반품 안내의 기존 저장 데이터는 유지합니다. 실제 운영 모드에서는 관리자에서 정확한 운영 내용을 저장해야 가입·주문이 열립니다. 현재 시험용 약관·운영자 표시는 테스트 모드에만 적용하며, 재고·입금·환불 기록을 만들지 않습니다. 카드 결제·자동 환불 송금·택배사 실시간 조회는 이번 이전으로 추가되지 않습니다.

## 개발과 검증

홈페이지 화보는 5초마다 다음 사진으로 전환하며 직접 선택·일시정지할 수 있습니다. 화면을 벗어나거나 탭이 숨겨지면 멈추고, 운영체제의 움직임 줄이기를 존중합니다. 다음 사진의 로딩이 실패하면 현재 사진을 유지합니다. 상품 사진은 0.4초 동안 최대 1.5배 확대됩니다. 실제 착샷은 `public/app.js`의 `PRODUCT_LOOKS`에 정확한 상품 ID와 전달받은 파일을 연결하며, 사진이 없거나 실패하면 원래 상품 사진을 유지합니다. 상품명 추측이나 다른 화보로 착샷을 대체하지 않습니다. 현재 실제 새 착샷은 전달 대기 중입니다.

저장소 루트의 `node tests/storefront-media.cjs`는 별도 로컬 HTTP 서버와 가상 API로 배너 타이밍·중단·실패 처리, 상품별 착샷 연결·확대, PC/모바일 화면을 확인합니다. 모의 사진은 테스트 응답 안에만 넣으며 운영 API·계정·DB를 사용하지 않습니다.

저장소 루트에서:

```sh
node deploy/vercel/tests/auth.cjs
node deploy/vercel/tests/readiness.cjs
node deploy/vercel/tests/setup-auth.cjs
node deploy/vercel/tests/initialize.mjs
node deploy/vercel/tests/initialization-sql.mjs
node deploy/vercel/tests/provision.mjs
node deploy/vercel/tests/database.mjs
node deploy/vercel/tests/storage-upload.cjs
node deploy/vercel/tests/image-import.mjs
```

`deploy/vercel` 폴더에서:

```sh
pnpm install --frozen-lockfile --prod=false
pnpm run build
pnpm start --port 3901
```

별도 터미널의 저장소 루트에서 `node deploy/vercel/tests/browser.cjs`를 실행할 수 있습니다. Playwright와 Chromium이 필요하며 로컬 주소만 허용합니다. 브라우저 화면 테스트는 읽기용 가상 상품 응답을 사용하고 운영 데이터를 쓰지 않습니다.

기존 `tests/browser.cjs`의 미연결 차단 검증은 `STORE_SITE_MODE=live pnpm start --port 3901`로 실행한 서버를 대상으로 합니다. 현재 테스트 모드의 실제 공개 API·배너·안내 화면 검증은 기본 모드 서버에서 `VERCEL_QA_URL=http://127.0.0.1:3901 node tests/banner-policies-browser.cjs`를 사용합니다(`deploy/vercel` 기준). 정책과 저장 범위 검증은 저장소 루트의 `node deploy/vercel/tests/test-site.cjs`, `node deploy/vercel/tests/test-catalog.cjs`, `node deploy/vercel/tests/test-commerce-integration.cjs`로 진행합니다.

실제 서비스 키가 없으면 인증을 차단합니다. 외부 서비스 연결을 확인하지 않은 상태에서 실제 로그인·데이터 이전·운영 배포가 완료되었다고 볼 수 없습니다. Git의 코드 복구와 DB·이미지 복구는 별개이며 자동 백업·상시 감시를 설정하지 않았습니다.

2026-10-14 확인: 고정된 의존성의 보안 정책 검사와 Next.js 프로덕션 빌드·TypeScript 검사가 통과했습니다. 인증 보안 테스트, DB 17개·이미지 업로드/저장 31개·이미지 이전 11개·실제 로컬 Next 서버 브라우저/API 25개 검증을 통과했습니다. 추가로 운영 확인 화면 49개·초기 로그인 이동 84개·새 DB 준비 API 30개·빈 DB SQL 11개를 통과했습니다. 최신 로컬 Next 서버에서 준비 버튼의 비활성 조건·GET 거부·잘못된 요청 출처 거부·위조 관리자 거부·설정 없는 로그인 차단도 확인했습니다. 실제 Clerk 이메일 발송·비밀번호 복구·운영 DB/R2 연결과 Vercel 배포는 미검증입니다.

# Vercel에 전체 쇼핑몰 배포하기

대표님, 이 폴더는 홈페이지 화면뿐 아니라 **로그인·회원·주문·재고·관리자**를 Vercel에서 실행하도록 준비한 서버입니다. 기존 Sites 원본은 저장소 루트에 그대로 보존했습니다. 빌드할 때 최신 원본 화면·상품·주문 코드를 가져와 Vercel용 연결로 바꿉니다.

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

설치 명령은 `pnpm install --frozen-lockfile --prod=false`, 빌드 명령은 `pnpm run build`입니다. 이 폴더의 독립적인 `pnpm-workspace.yaml`이 원본 개발 환경과 의존성을 구분합니다. 생성된 `app/`, `lib/`, `public/`, `.next/`를 직접 수정하거나 Git에 저장하지 않습니다.

## 운영 연결 순서

배포 후 `/setup`을 열면 비밀값 없이 상품 DB 연결·테이블 준비·로그인·관리자 기록·이미지 업로드·가입 안내 설정을 확인할 수 있습니다. 이 화면은 읽기만 하며 DB 초기화·권한 등록·데이터 저장을 하지 않습니다. 설정이 있다는 표시와 실제 운영 연결 검증은 별개입니다.

1. **새 Turso DB를 먼저 초기화**합니다. 기존 데이터가 있으면 모든 쓰기를 중단한 일관된 원본 내보내기를 받아, 새 빈 DB에만 가져옵니다. [데이터 이전 안내](DATABASE-MIGRATION.md)의 `--plan`/읽기 확인부터 진행합니다. 기존 DB를 삭제하거나 덮어쓰지 않습니다.
2. Clerk에서 이메일·비밀번호와 필수 이메일 인증을 설정합니다. 기존 회원·관리자는 확인한 새 계정 ID와 기존 Sites ID를 명시적으로 연결합니다. 이메일이 같다는 이유로 자동 합치지 않습니다. [로그인 설정 안내](AUTH.md)를 따릅니다.
3. 기존 R2에 실제 접근할 수 있으면 같은 객체 키로 연결합니다. 접근할 수 없으면 원래 호스팅에서 이미지 내보내기를 받아 새 비공개 R2로 복사합니다. [이미지 연결 안내](R2-STORAGE.md)를 따릅니다. 원본 시안 `public/assets`는 Git에 포함되어 있습니다.
4. Vercel의 **Settings → Environment Variables**에 [필요한 환경변수 이름](environment.example)을 등록합니다. 비밀키·토큰은 그 화면에 입력하고 채팅·Git에 보내지 않습니다. `NEXT_PUBLIC_SITE_URL`에는 실제 HTTPS 홈페이지 주소를 넣습니다.
5. 새 DB의 데이터 가져오기와 신원 연결을 확인한 **뒤에** 운영 로그인·쓰기를 허용합니다. 먼저 관리자 로그인이 새 빈 DB에 관리자 기록을 만들면 안전한 가져오기 도구가 비어 있지 않은 DB를 거부합니다. Preview 검증에는 별도 테스트 DB·버킷·인증 인스턴스를 사용합니다.
6. 운영 도메인에서 실제 이메일 인증·비밀번호 재설정·본인 주문·다른 계정 차단·관리자 저장·8MB 이미지 업로드를 확인합니다. 확인 후에만 운영 전환과 주문 접수를 엽니다. 기존 주소와 공개 범위는 이 준비 작업에서 바꾸지 않았습니다.

상품 약관·개인정보·계좌·반품 안내는 기존 실제 데이터를 유지합니다. 값이 없으면 관리자에서 정확한 운영 내용을 저장해야 가입·주문이 열립니다. 임의 약관·운영자·재고·입금/환불 정보를 넣지 않았습니다. 카드 결제·자동 환불 송금·택배사 실시간 조회는 이번 이전으로 추가되지 않습니다.

## 개발과 검증

저장소 루트에서:

```sh
node deploy/vercel/tests/auth.cjs
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

실제 서비스 키가 없으면 인증을 차단합니다. 외부 서비스 연결을 확인하지 않은 상태에서 실제 로그인·데이터 이전·운영 배포가 완료되었다고 볼 수 없습니다. Git의 코드 복구와 DB·이미지 복구는 별개이며 자동 백업·상시 감시를 설정하지 않았습니다.

2026-10-14 확인: 고정된 의존성의 보안 정책 검사와 Next.js 프로덕션 빌드·TypeScript 검사가 통과했습니다. 인증 보안 테스트, DB 17개·이미지 업로드/저장 31개·이미지 이전 11개·실제 로컬 Next 서버 브라우저/API 25개 검증을 통과했습니다. 실제 Clerk 이메일 발송·비밀번호 복구·운영 DB/R2 연결과 Vercel 배포는 미검증입니다.

# AI 가상 피팅 구현·운영 인계

확인일: 2026-10-21. 대상: 기존 **street-label-shop**, Next.js 16.3.4 App Router / React 19.2.6 / Clerk / Turso. 별도 V2 프로젝트와 기존 회원·상품·주문·재고·소유자 기록을 변경하지 않는다.

## 현재 상태

실제 FASHN API 규격의 서버 어댑터, 고객 화면, 관리자 설정·집계, 개인정보 처리 동의, 제한·중복 방지, 비교 슬라이더를 구현했다. API 키가 없거나 기능이 꺼져 있으면 사진 입력·전송을 열지 않는다. 공개 코드에는 모의 생성 엔진이나 원본을 결과로 대체하는 처리가 없다.

**이 개발 환경에는 FASHN_API_KEY가 없다. 실제 유료 생성과 얼굴·피부색·체형·배경·프린트 보존 수준은 검증하지 못했다.** 자동 테스트의 AI 응답은 명시적인 합성 테스트 데이터이며 실제 AI 결과의 증거가 아니다. 운영 기능 활성화는 하지 않았다.

## 제공업체 조사 및 선정

| 후보 | 확인한 제공 방식·이용 조건 | 비용·속도·보관 | 판단 |
|---|---|---|---|
| FASHN v1.6 | 공식 REST API `POST https://api.fashn.ai/v1/run`, `GET /v1/status/{predictionId}`. 상업용 고객 애플리케이션을 약관에서 허용 | 성공 출력 1장당 1크레딧. 온디맨드 $0.075/크레딧, 최소 $7.50/100크레딧. quality 약 12~17초 + 큐/네트워크. Base64 입력 처리 종료 후 삭제·최대 1일 정리, Base64 출력 완료 후 최대 60분 | 선택. 상의/하의를 명시하고 1장, quality, JPEG, Base64 입력·출력 사용 |
| IDM-VTON 공개 체크포인트 | 공개 코드·가중치, CC BY-NC-SA 4.0. 공식 상업용 호스팅 API는 이번 조사에서 확인 못함 | 자체 GPU 운영·별도 상업 허가 필요. 이 배포의 비용·속도·보관 SLA 미검증 | 비상업 라이선스 때문에 기본 후보 제외 |
| CatVTON 공개 체크포인트 | 공개 코드·가중치·데모, CC BY-NC-SA 4.0. 공식 상업용 호스팅 API는 이번 조사에서 확인 못함 | 자체 GPU 운영·별도 상업 허가 필요. 이 배포의 비용·속도·보관 SLA 미검증 | 비상업 라이선스 때문에 기본 후보 제외 |

FASHN Try-On Max도 공식 제공되지만 이번 구현은 상·하의와 속도·비용이 정해진 v1.6으로 한정했다. 다른 모델명·의류 파라미터를 임의로 바꾸지 말 것. 제공업체 가격·약관은 운영 직전에 다시 확인한다. 품질이 마음에 들지 않는 성공 결과는 실패 과금 면제와 다르다.

공식 근거:

- https://docs.fashn.ai/api-reference/tryon-v1-6
- https://docs.fashn.ai/api-overview/api-fundamentals
- https://docs.fashn.ai/api-overview/error-handling (실패 생성은 크레딧 미사용)
- https://docs.fashn.ai/api-overview/data-retention-privacy
- https://help.fashn.ai/plans-and-pricing/api-pricing
- https://fashn.ai/legal/terms-of-service (상업 이용, 고객 애플리케이션, 콘텐츠 권한)
- https://fashn.ai/legal/dpa
- https://fashn.ai/legal/subprocessors (국외 처리 위치는 사용 경로에 따라 달라짐)
- https://huggingface.co/yisol/IDM-VTON/blob/main/README.md
- https://huggingface.co/zhengchong/CatVTON/blob/main/README.md

## 사용자 흐름과 기존 기능 연결

- 상세페이지 `AI TRY ON`, 인스타그램 위 `옷 입히기 / AI TRY ON` → 같은 출처의 React 피팅 화면을 모달 안에서 연다.
- 현재 상품 ID를 자동 선택. 공개되고 피팅을 허용한 의류만 선택 가능. 상품명·기본/피팅 사진·색상·분류·옵션·재고 상태를 기존 데이터에서 읽는다.
- 상·하의 자동 매핑, 관리자 재지정 가능. ACC는 기본 제외. 최초 4개 상품의 2×2 합성 상품사진은 선택된 한 구역만 잘라 보낸다.
- 사진 미리보기 → 외부 처리 동의 → 생성 접수 → 서버 상태 조회 → Before/After. 실제 실패·형식 오류·CDN URL 응답은 결과로 표시하지 않는다.
- 결과는 AI임을 명시하며 실제 사이즈·핏·색상·착용감을 보장하지 않는다.
- 결과의 장바구니 버튼은 기존 상품의 사이즈 선택으로 돌아간다. 기존 재고·수량 검증과 장바구니 코드를 그대로 사용한다. 품절을 구매 가능으로 바꾸지 않는다.
- React `BeforeAfterSlider`는 같은 contain 프레임, 50% 초기값, 중앙 구분선/핸들, 마우스·터치·키보드·접근성 레이블을 제공한다.

## 사진·동의·삭제 범위

1. **브라우저**: 선택한 파일은 JPEG로 방향 정리·메타데이터 제거 후 Blob으로 보유한다. localStorage/IndexedDB/쿠키/상품 DB/회원 프로필에 사진을 기록하지 않는다. 동의 체크 이전에는 AI API 요청을 시작하지 않는다. 사진 교체·창 종료 시 Object URL을 revoke하고 참조를 해제한다. iframe 종료 시 문서도 제거한다. 새로고침·BFCache 복귀 시 사진을 복원하지 않는다.
2. **쇼핑몰 서버**: 한 요청 동안 바이트를 메모리에서 검사·처리하며, R2·임시 파일·이미지 DB에 쓰는 경로가 없다. 실제 이미지 디코딩, MIME 일치, 픽셀 수, 정지 이미지, 크기 제한을 확인하고 JPEG로 다시 인코딩한다. 원본 이름·이미지·Base64·공급자 오류 원문을 로그에 출력하지 않는다. 주요 바이트 버퍼는 사용 후 0으로 덮고 참조 해제한다. JS 불변 문자열·런타임·호스팅 메모리의 물리적 즉시 삭제까지 보장하는 것은 아니다.
3. **FASHN**: 고객·의류 이미지를 Base64로 보내 URL을 남기지 않는다. `return_base64:true`, 출력 1장. 기본 3일 CDN URL 방식으로 우회하지 않는다. 공식 문서에 따르면 입력의 일시 처리 사본은 완료 후 삭제되며 최대 1일 자동 정리 장치가 있다. 결과는 완료 후 최대 60분간 상태 API에서 조회 가능하다. 파라미터·상태·타임스탬프·Base64 자리표시자 등의 요청 메타데이터는 자동 삭제되지 않는다. 현재 삭제 API가 없으며 삭제 요청은 FASHN에 해야 한다. 별도 동의 없이는 자사/제3자 모델 학습에 쓰지 않는다고 명시한다.
4. **취소**: 브라우저 요청·상태 조회를 중단하고 쇼핑몰의 제공업체 ID를 지운다. 공식 취소/즉시 삭제 API를 확인하지 못했으므로 그런 API를 만들지 않았다. 이미 접수된 외부 AI 작업의 실행·보관·비용이 즉시 취소된다고 안내하지 않는다. 생성 POST의 접수 여부가 불명확할 때 자동 재전송하지 않는다.
5. **식별자/집계**: 개인 정보 없는 UUID, 날짜별 HMAC 가명 식별자, 요청 키의 HMAC, 제공업체 작업 ID, 상태·시간·크레딧만 별도 테이블에 둔다. 제공업체 ID/조회 권한은 10분 후 만료, 기능 접근 및 인증된 일일 Cron에서 물리적으로 정리한다. 당일 가명 카운터는 취소 후에도 유지하여 횟수 우회를 막는다. 이전 날짜의 만료 기록은 식별자 없는 일별 집계로 합치며 집계는 30일 후 삭제한다. Cron 미실행 시 논리 만료는 유지되지만 물리 정리 시점은 다음 접근까지 지연될 수 있다. 정확히 10분 뒤 모든 메타데이터가 물리 삭제된다고 보장하지 않는다.
6. API 응답에 `private, no-store`, CDN/Vercel-CDN no-store, no-referrer, nosniff를 사용한다. 피팅 화면 CSP는 외부 스크립트·통신을 제한한다. 사진 바이트가 URL/쿼리에 들어가지 않는다. 이 화면에 분석·세션 리플레이 SDK를 넣지 않는다.
7. 저장하지 않는 앱 코드와 제3자 인프라 정책은 구분한다. Vercel/WAF/프록시/오류 추적에 요청·응답 본문 캡처가 켜져 있는지는 이 환경에서 계정 권한이 없어 확인하지 못했다. 활성화 전 `/api/try-on*`의 본문 캡처·리플레이·디버깅 로깅을 제외하고 테스트해야 한다. FASHN의 하위 처리업체 DPA/보관 약정을 포함해 확인해야 하며 ‘어디에도 절대 저장되지 않음’이라고 표시하면 안 된다.

## 인증·남용·운영비 제한

- 기존 Clerk 검증 세션·인증된 기본 이메일을 사용한다. 사용자 제공 헤더로 로그인/관리자 권한을 만들지 않는다. 다른 고객의 작업 ID로 결과를 조회할 수 없다.
- 기본 로그인 필수. 비회원은 관리자가 허용할 때만 서명 HttpOnly/SameSite=Strict 쿠키를 사용한다. 쿠키에는 사진이나 계정 정보가 없다. 비회원이 쿠키를 지우면 브라우저별 제한을 우회할 수 있으므로 강한 1인 식별 수단으로 보지 않는다. 전체 예산·횟수 상한은 유지된다.
- 사용자당 진행 중 작업 1개, 전체 진행 중 작업 4개. 접수 여부가 불명인 작업도 10분 동안 동시 실행 슬롯을 유지한다. 상태 조회는 작업별 2초 간격과 전체 10초당 40회 상한을 함께 적용한다. 서버 SQL 한 문장에서 중복 요청 키, 현재 설정, 일일 회원/비회원 한도, 일일 전체 횟수·예산·동시 실행 수를 원자적으로 검사하고 비용을 예약한다.
- 기본: 비활성화, 비회원 차단, 회원 3회/일, 비회원 허용 시 1회/브라우저/일, 전체 20회/일, 예산 $1.50/일. 기준 날짜는 UTC이다.
- 단가 $0.075로 **모든 접수 시도**를 예약한다. 실패·불명·취소도 한도에 남는다. 제공업체는 실패 출력에 비용을 청구하지 않지만 불명 결과/중복 과금 가능성을 과소 계산하지 않기 위한 보수적 제한이다. 이 대시보드는 청구서/잔액 실시간 동기화가 아니다. FASHN에서 별도로 크레딧/자동 충전 설정을 관리한다.
- 생성 접수 20초, 상태 조회 15초 제한. UI 전체 3분 제한. 상태 GET만 최대 3회 지수 백오프로 재확인하고, 생성 POST는 자동 재시도하지 않는다. DB 요청 키로 동일 접수를 중복 생성하지 않는다.

## 환경변수·운영 연결

Vercel 기존 프로젝트의 **Settings → Environment Variables**:

- `FASHN_API_KEY`: https://app.fashn.ai/api 의 Developer API 키. 일반 OpenArt 키나 FASHN 앱 구독으로 대체하지 않는다.
- `TRYON_SIGNING_SECRET`: 암호학적으로 생성한 임의 값, 최소 32바이트. 서버 가명 식별자와 비회원 쿠키 서명용.
- `CRON_SECRET`: 위 값과 별개인 최소 32바이트 임의 값. Vercel Cron 인증용.
- 기존 `NEXT_PUBLIC_SITE_URL`, Clerk, Turso 설정 유지. 새 비밀값에 `NEXT_PUBLIC_` 접두어를 붙이지 않는다.

키를 채팅·Git·브라우저 JS에 넣지 않는다. 개발 환경 설정 초안에는 FASHN 키와 비밀값 이름 요구사항만 추가했으며, 실제 값 입력·환경 저장/게시와 Vercel 환경변수 등록/재배포는 별개이다. 그 초안이 운영 사이트에 자동 복사되는 것은 아니다.

운영 순서:

1. 기존 상품·회원·주문은 그대로 둔 채 코드 빌드/검증. 생성 기능 기본 비활성화 유지.
2. FASHN 약관·DPA·국외 처리 및 TTL을 확인하고 API 전용 크레딧을 준비한다. 자동 결제/구독을 코드가 가입시키지는 않는다.
3. 서버 환경변수 3개 등록 후 기존 프로젝트 재배포. 정리 Cron은 `0 0 * * *` (UTC 하루 1회, 무료 요금제 주기에 맞춤)으로 구성했다. Cron 관리 화면에서 인증·실행을 확인한다.
4. 대표님 계정으로 `/admin/try-on` → ‘AI 피팅 전용 저장소 준비’. 기존 초기화/새 DB 준비를 실행하지 않는다. 이 작업은 이름이 분리된 4개 테이블과 인덱스만 추가하며 기존 마이그레이션 원장을 바꾸지 않는다. 새 기능의 테이블이 없을 때 공개 API는 DDL을 실행하지 않고 준비 중으로 닫힌다.
5. 기존 `/admin`의 상품 편집에서 피팅용 의류 사진/상의·하의/허용 여부 확인. 각 원본 4칸 사진 외에 실물 한 벌의 정면 단독 사진 권장.
6. 작은 예산·로그인 필수 상태로 활성화하고, 동의/사용 권한 있는 실제 인물 사진과 상의 1개·하의 1개로 최소 실생성 검증. 얼굴·체형·피부색·머리카락·배경·프린트·손/팔 보존을 직접 확인한다. 실제 크레딧/실패 과금도 대시보드로 대조한다.
7. 호스팅 로그·WAF·프록시/분석 캡처 제외, 다른 계정의 조회 거부, 만료/취소/오류, 모바일을 배포 환경에서 확인한 후 공개 운영한다.

## 변경·신규 파일

기존 파일 수정:

- `legacy/store.html`: 인스타그램 위 메뉴, 모달 실행 스크립트.
- `public/app.js`: 상세 AI 버튼, 기존 옵션/장바구니로 복귀.
- `public/refined-store.css`: 피팅 모달/버튼 반응형 스타일.
- `legacy/admin.html`: AI 피팅 관리 링크.
- `public/admin.js`, `public/admin.css`: 피팅용 의류 사진 업로드·제거·유형·허용 설정.
- `lib/content.ts`: 선택적 `tryOnImage`, `tryOnEnabled`, `tryOnCategory` 필드. 기존 상품은 그대로 호환.
- `deploy/vercel/package.json`, `deploy/vercel/pnpm-lock.yaml`: 고정 버전 `sharp@0.35.4` 서버 디코딩 의존성.
- `deploy/vercel/next.config.mjs`: Sharp 서버 외부 패키지 및 전용 CSP/보관 방지 헤더.
- `deploy/vercel/vercel.json`: 일일 인증된 메타데이터 정리 Cron.
- `deploy/vercel/environment.example`: 비밀값 이름 안내.

신규 파일:

- `public/try-on-launcher.js`
- `deploy/vercel/runtime/tryon-images.ts`
- `deploy/vercel/runtime/tryon-provider.ts`
- `deploy/vercel/runtime/tryon-schema.ts`
- `deploy/vercel/runtime/tryon-service.ts`
- `deploy/vercel/runtime/tryon.ts`
- `deploy/vercel/templates/try-on/{page.tsx,TryOnClient.tsx,BeforeAfterSlider.tsx,try-on.css}`
- `deploy/vercel/templates/api/try-on/route.ts`
- `deploy/vercel/templates/api/try-on/[id]/route.ts`
- `deploy/vercel/templates/api/admin/try-on/route.ts`
- `deploy/vercel/templates/api/internal/try-on-cleanup/route.ts`
- `deploy/vercel/templates/admin/try-on/{page.tsx,TryOnAdmin.tsx}`
- `deploy/vercel/tests/tryon.cjs`
- `deploy/vercel/tests/tryon-browser.cjs`

기존 `tests/model-photo-content.cjs`에도 피팅용 사진·상의/하의·허용 여부의 저장/재조회/제거와 기본·착용 사진 보존 검증을 추가했다.
- 이 문서 `docs/ai-virtual-try-on.md`

생성된 `deploy/vercel/app` / `lib` / `public`은 편집 원본이 아니다. root/public과 runtime/templates를 수정하고 prepare로 재생성한다.

## 검증 기록

- `node deploy/vercel/tests/tryon.cjs`: 23개 시나리오. 실제 SQLite/이미지 디코더, 동의·형식·MIME·크기, 공개 상품·상의/하의 지정, 관리자·Origin·결과 소유권, 중복·동시 예산 예약, 실패/불명/취소, 비회원 서명, TTL·일별 비식별 집계, 공식 API 형식·Base64 외 결과 거부. 제공업체만 테스트용으로 대체했다. 사진 저장 0, 실제 생성 없음.
- `TRYON_QA_URL=http://127.0.0.1:3915 node deploy/vercel/tests/tryon-browser.cjs`: 실제 Next production 빌드의 React 화면에 같은 출처의 명시적 테스트 API 응답을 연결했다. 6개 시나리오, PC 1440px/모바일 390px·320px, 마우스/터치/키보드, 동의, 실패, 취소, 창 종료 시 Blob 참조 해제, 새로고침 시 사진 복원 안 됨, 기존 장바구니. 외부 통신 0, 브라우저 오류 0. 실제 AI 품질 검증은 아니다.
- 기존 회귀 검증: `tests/model-photo-content.cjs` 15개, `tests/commerce-api.cjs`, `tests/admin-security.cjs`, `deploy/vercel/tests/test-commerce-integration.cjs` 32개, `deploy/vercel/tests/auth.cjs` 27개 시나리오.
- `cd deploy/vercel && NEXT_TELEMETRY_DISABLED=1 pnpm run build`: Next production 빌드/TypeScript 검사.

## 미완료·미검증

- 유효한 운영 API 키/크레딧이 없어 **실제 FASHN 생성 미실행**. 실제 상의·하의 품질, 보존 수준과 공급자 과금/잔액 미확인.
- 실제 고객·대표님 로그인 세션 및 운영 Turso 계정 권한이 없어 운영 설정·테이블 생성·활성화/고객 사진 전송은 실행하지 않음.
- 운영 호스팅/WAF/프록시 캡처 및 외부 공급자의 삭제 실행을 직접 감사하지 못함. 문서상 정책과 앱 자체 처리를 구분해야 함.
- 실시간 카메라 AR, 치수 측정/사이즈 추천, 실제 핏 보장, 전신 여러 벌 동시 착용은 이번 범위에 포함하지 않음.
- 외부 작업 강제 취소/즉시 삭제 API가 확인되지 않아 제공하지 않음. 취소는 로컬 조회·참조 해제이다.
- FASHN 청구서/잔액 실시간 동기화는 구현하지 않았으며 예약 예산과 확인된 크레딧만 표시한다.

# Street Label — storefront and owner CMS

**Vercel 전체 서버 배포 준비:** [deploy/vercel/README.md](deploy/vercel/README.md). GitHub에서 Vercel로 가져올 때 Root Directory를 `deploy/vercel`로 지정합니다. 원래 Sites 서버는 이 저장소 루트에 보존되어 있습니다.

Vinext / Cloudflare Workers. D1 holds the catalog and pinned owner identity; R2 holds uploaded product and campaign images. The storefront uses a fixed left menu on desktop and a compact header with a sliding menu on mobile.

## 왼쪽 메뉴와 다국어 쇼핑몰

참고 화면의 메뉴 구성을 반영했습니다. PC에는 브랜드 로고와 세로 메뉴를 왼쪽에 고정하고 오른쪽에 큰 화보와 상품을 배치했습니다. 모바일은 상단 로고·메뉴·장바구니와 열고 닫는 메뉴를 사용합니다. 기존 화보와 상품 사진을 유지하며 상품 목록은 PC 4열, 모바일 2열입니다. 참고 브랜드의 상표·로고·사진은 사용하지 않았습니다.

- **언어**: 한국어, 중국어 간체, 중국어 번체, 일본어. 선택은 브라우저에 저장되며 홈페이지·가입·계정·주문 화면에 적용됩니다. 언어를 바꿔도 장바구니, 선택한 사이즈, 작성 중인 가입·주문 입력값이 유지됩니다. 가격은 모두 원화입니다.
- **BEST ITEM**: 관리자가 추천 표시한 공개 상품만 노출합니다. 실제 판매 순위나 판매량을 만들지 않습니다.
- **관심 상품**: 하트 버튼으로 저장·해제하고 메뉴에서 모아 봅니다. 현재 브라우저에만 저장하는 선호 목록이며 회원·주문 데이터는 D1에 저장합니다. 비공개로 바뀐 상품은 목록에서 제외합니다.
- **사이즈 안내**: 관리자가 상품별 실측표를 입력할 수 있습니다. 미입력 상태에서는 측정 방법과 미등록 안내만 보여 주고 수치를 만들지 않습니다.
- **COMMUNITY**: 공지와 쇼핑 FAQ를 읽는 화면입니다. 고객 게시글이나 실제 후기 기능은 포함하지 않습니다.
- **SNS**: 인스타그램·카카오톡은 주소 미설정 시 ‘연결 준비 중’을 안내합니다. 관리자에서 실제 공식 HTTPS 주소를 저장하면 링크로 연결됩니다.

`/admin`에서 브랜드명, SNS 주소, 네 언어의 안내·소개 문구와 상품명·색상·설명·실측표를 편집할 수 있습니다. 브랜드명은 홈페이지와 가입·계정 화면에 함께 반영됩니다. 번역 입력이 없으면 운영자 원문을 표시합니다. 실제 약관·개인정보·계좌·반품 안내는 임의로 번역하거나 새로 만들지 않습니다. 현지 고객에게 판매하기 전에 해당 언어의 실제 안내를 검토해야 합니다.

현재 주문서는 국내 주소·우편번호 방식입니다. 언어 추가만으로 해외 배송을 개통하지 않습니다. 해외 판매에는 국가별 주소, 배송비, 통관 안내와 반품 조건을 별도로 정해야 합니다. 카드 결제도 결제사·사업자 연결 후 추가할 수 있습니다. 우선 실제 브랜드명·상품 사진·실측·재고와 운영 안내를 확정하는 것을 권합니다.

네 언어 전체의 긴 설명·실측표를 상품 100개에 최대 길이로 입력하면 기존 저장 API의 400KB 요청 제한에 걸릴 수 있습니다. 큰 상품군으로 확대하기 전에 저장 방식과 용량을 검토하세요.

## 홈페이지 화면 바로 확인하기

디자인을 확인할 때는 함께 전달한 `street-label-homepage.html`을 내려받아 Chrome 또는 Edge에서 여세요. CSS, 기존 화보 이미지, 시안 상품 4개가 파일 안에 들어 있어 별도 서버 설치 없이 홈페이지 화면을 볼 수 있습니다. 상품 분류·검색·가격 정렬, 상품 상세, 화보 전환과 모바일 메뉴도 확인할 수 있습니다.

`legacy/store.html`은 서버가 사용하는 원본 화면 파일입니다. 이 파일만 직접 열면 서버 기준의 CSS·이미지 경로와 상품 API가 연결되지 않아 기본 글자·버튼이나 깨진 이미지가 보일 수 있습니다. 화면 미리보기에는 별도로 내보낸 파일을 사용하세요.

미리보기는 원래 소스의 시안 이미지·상품을 사용합니다. 운영 중인 D1 회원·주문·상품 데이터나 R2 업로드 이미지를 복제하지 않습니다. 회원가입·주문·관리자 저장은 서버에 연결된 홈페이지에서 이용하며, 미리보기에서 완료 처리하지 않습니다. 미리보기 장바구니 저장 위치도 운영 장바구니와 구분합니다.

설치된 개발 환경의 저장소 루트에서 미리보기를 다시 만들려면 다음 명령을 실행합니다.

```sh
node scripts/export-preview.cjs
```

기본 출력 위치는 저장소 옆 `outputs/street-label-homepage.html`입니다. 서버용 소스의 CSS·JS·이미지나 인증·API 설정을 수정하지 않고 미리보기를 생성합니다.

## Use
Open the storefront with the owning ChatGPT account. Click **관리자 모드** in the header or footer, or visit `/admin`. Edit brand text, campaign images, journal image and product details. Add/hide/remove/reorder products. Click **변경사항 저장**, then refresh the storefront. Uploads support JPG, PNG and WebP, at most 8MB each. Hero images: 1–5; products: up to 100. New products start hidden.

## Authorization
Hosted ChatGPT sign-in is owned by Sites. `OWNER_BOOTSTRAP_EMAIL` is a secret runtime value populated from the confirmed Sites owner record; never exposed to clients. Only that verified identity can initialize the singleton owner record. All subsequent admin checks compare the durable site-scoped user ID. Every admin page/API checks server-side ownership. Mutations also require an exact same-origin Origin header. Site audience is a separate Sites setting and must be checked in the existing project; this change does not alter it. No passwords or client-side secret credentials are used.

## Persistence and validation
D1 `store_content` contains the validated catalog and revision; saves use a revision conditional update to reject stale writes. Hidden products are omitted from the storefront API. Images are uploaded to R2 with random object keys and served with fixed image MIME types and nosniff. Image upload bodies are bounded; SVG/HTML and external image URL schemes are rejected. Storefront and editor escape text before HTML interpolation. Cart remains browser-local; authenticated checkout creates durable D1 orders.

## Source
- `legacy/store.html`, `public/style.css`, `public/app.js`: storefront.
- `legacy/admin.html`, `public/admin.css`, `public/admin.js`: editor.
- `app/admin/route.ts`, `app/api/admin/*`: owner-protected endpoints.
- `lib/admin.ts`: owner identity and request checks.
- `lib/content.ts`: schema and initial sample catalog.
- `db/schema.ts`, `drizzle/`: database schema/migration.

Use the Sites build and publication helpers. Generated output is in `dist/`; source belongs in `public/`, `app/`, `legacy/` and `lib/`. Do not edit generated `dist/`.

## Verification
`node tests/admin-security.cjs` checks missing/foreign identity rejection, initial owner eligibility and pinned ID, same-origin restriction, persistent content save, stale-write conflict and content/image validation. Customer signup has local Chromium coverage described below. Real owner login and the production image-upload/editor workflow still require live verification.

## Initial images
Original AI-generated concept assets in `public/assets/` (not actual stock): campaign.png, campaign-v2.png, products.png. Product contact sheet is displayed using CSS quadrant positions; uploaded photos use a normal full-image view. Replace with actual product photographs before sales. Card payments and automatic bank/refund transfers are not connected. Order and stock management are described below.


## Commerce release
- `/signup`: explicit ChatGPT-linked login/signup entry, customer registration and the return path to checkout or the account page.
- `/account`: registered customer profile, shipping checkout, own order history and cancel/return requests. Unregistered visitors go to signup. This is not standalone email/password registration.
- `/admin/orders`: operator settings, per-size inventory and per-order quantity limits, paginated order management, manual bank receipt confirmation, carrier/tracking entry, cancellation, returns and manual refund-completion records.
- `/api/shop`: customer operations and public settings/stock. Order identity comes from Sites, never client user IDs.
- `/api/admin/commerce`: owner-only management. All mutations require same-origin and server validation.
- `lib/order-state.ts`: state transitions; `lib/commerce.ts`: APIs.
- `drizzle/0001_simple_harpoon.sql`: additive tables and uniqueness, plus `0002_bizarre_sersi.sql` operation-token column. Never modify after deployment. `lib/order-sql.ts` creates parameterized transaction plans. New orders atomically check stock, catalog/settings revision, membership and pending-order count; then deduct stock and audit in one D1 batch transaction. Cancellation restores once. Returns restore only after physical receipt and resale approval. Stale stock edits reject by revision.
- Client prices are not trusted. Server snapshots product/price/address into immutable order details. Idempotency keys prevent duplicate orders; at most 3 awaiting-payment orders per customer. Per-option max purchase count applies per order, not lifetime per customer.
- Full-order cancellations/refunds only. No partial refunds, courier API, automatic transfers, customer email/SMS or automatic unpaid-order expiry. Operators cancel overdue unpaid orders manually. Refund completion is a record after the operator confirms the actual external transfer, not a money transfer.
- No live customers, orders or inventory were seeded. Initial stock is zero and selling disabled; initial order acceptance is off. Configure operator account information, shipping fee, customer support, terms/privacy and returns text, then set actual option stock and enable order acceptance.
- The current Site audience cannot be inferred from this source archive. Verify it in the existing Sites project. Audience and admin permissions are independent; no audience change is included here.

### Commerce validation
`node tests/order-state.cjs`, `python3 tests/commerce-sql.py`, and `node tests/commerce-api.cjs` cover state transitions, real SQLite migration and atomic transaction execution, last-unit concurrent ordering, transaction rollback, exactly-once stock restoration, server price validation, quantity limits, idempotency, cross-customer privacy and mutation denial, manual payment/cancellation/refund lifecycle. These tests use isolated synthetic data. Local browser checks use a built Worker and isolated D1/R2, with simulated Sites identity headers. Production ChatGPT authentication, real customer accounts, production data, and live editor/upload behavior remain unverified.

Deployment compatibility: failed initial commerce migration was verified unapplied (only original store tables existed). Removed unsupported migration trigger statements and moved atomic order/stock/audit changes to D1 batch transactions. Unique per-operation tokens ensure failed/stale state changes cannot restore inventory or append audit events. No applied migration was edited.

## 회원가입 동선

홈페이지 왼쪽 메뉴·모바일 메뉴·하단의 **로그인 / 회원가입**에서 `/signup`으로 이동합니다. ChatGPT 로그인 후 처음 방문한 고객은 이름과 연락처를 입력하고 이용약관·개인정보 안내에 각각 동의합니다. 가입 중에는 중복 제출을 막고, 실패하면 입력 내용을 유지합니다. 가입 성공 화면에서 **내 계정으로 이동**을 선택하거나, 장바구니에서 시작했다면 **주문서 이어서 작성**을 선택합니다. 기존 회원은 바로 내 계정 또는 주문서로 연결됩니다.

회원정보와 주문은 로그인 신원에 연결해 D1에 저장합니다. 새로고침·다른 브라우저에서도 같은 ChatGPT 계정으로 로그인하면 조회할 수 있습니다. 일반 이메일·비밀번호 가입, 카카오·네이버 로그인은 구현되어 있지 않습니다.

### 운영자가 설정할 내용

`/admin/orders#settings`의 **운영 설정**에서 실제 **이용약관**과 **개인정보 수집·이용 및 보관 안내**를 입력하고 **운영 설정 저장**을 누르세요. 비어 있거나 공백뿐이면 가입 화면과 서버 모두 가입을 차단합니다. 테스트용 약관과 운영자 정보를 운영 DB에 넣지 않았습니다.

주문까지 개통하려면 실제 입금 계좌·예금주·입금 기한, 고객센터, 배송·취소·반품 안내, 배송비, 옵션별 재고·판매 상태를 설정한 뒤 주문 접수를 열어야 합니다. 회원가입과 주문 접수 개통은 별도입니다. 최초 관리자 설정이 필요한 경우에만 Sites의 안전한 서버 설정에서 `OWNER_BOOTSTRAP_EMAIL`을 설정하며, 채팅이나 프런트엔드에 비밀값을 넣지 않습니다.

### 검증 명령

Node.js 22.13 이상과 `pnpm@11.25.0`을 사용합니다. 저장소 루트에서 실행합니다.

```sh
pnpm install --frozen-lockfile --prefer-offline --prod=false --store-dir .sites-runtime/pnpm-store --cache-dir .sites-runtime/pnpm-store/policy-cache
node tests/admin-security.cjs
node tests/commerce-api.cjs
node tests/order-state.cjs
python3 tests/commerce-sql.py
node tests/signup-security.cjs
node tests/signup-routes.cjs
node tests/customer-brand.cjs
node tests/i18n.cjs
node tests/catalog-locales.cjs
node tests/public-stock.cjs
pnpm exec tsc --noEmit --incremental false
npm run build
```

`tests/signup-security.cjs`는 인증·동의·안내 미설정·약관 버전·입력값·재등록·본인 정보와 주문의 분리를 인메모리 SQLite로 검증합니다. `tests/signup-routes.cjs`는 로그인 전후 화면, 주문서로 돌아가는 경로, 외부 URL 이동 차단을 검증합니다.

`node tests/signup-browser.cjs`를 실행하려면 Playwright와 Chromium, 별도로 실행한 로컬 QA Worker가 필요합니다. 공개 사이트를 테스트 대상으로 쓰지 않도록 접속 주소를 localhost로 제한합니다. QA Worker는 프로덕션 빌드로 만든 별도 이름의 설정을 쓰고, DB/R2 저장 위치를 `.sites-runtime/browser-qa/state`로 분리합니다. 테스트가 운영 설정을 합성 테스트 값으로 변경하므로 일반 개발 DB와도 공유하지 마세요. 인증은 신뢰된 로그인 헤더를 모의 처리하며, 실제 ChatGPT 로그인을 검증하는 것은 아닙니다.

Linux 클라우드 환경에서 확인한 QA 실행 순서는 다음과 같습니다. 먼저 위의 설치·빌드를 완료한 뒤 저장소 루트에서 실행합니다. `OWNER_BOOTSTRAP_EMAIL`에 넣는 아래 값은 로컬 QA 전용 가상 신원입니다.

```sh
node --input-type=module <<'JS'
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(), folder=path.join(root,'.sites-runtime/browser-qa');
fs.mkdirSync(path.join(folder,'xdg-config'),{recursive:true});
const config=JSON.parse(fs.readFileSync('dist/server/wrangler.json','utf8'));
config.name='street-label-browser-qa';
config.main=path.join(root,'dist/server/index.js');
config.assets.directory=path.join(root,'dist/client');
config.vars={OWNER_BOOTSTRAP_EMAIL:'browser-owner@example.test'};
config.d1_databases=[{binding:'DB',database_name:'street-label-browser-qa',database_id:'3f0c07d0-7704-4f8a-9319-5ba524f783d6',migrations_dir:path.join(root,'drizzle')}];
config.r2_buckets=[{binding:'BUCKET',bucket_name:'street-label-browser-qa'}];
fs.writeFileSync(path.join(folder,'wrangler.json'),JSON.stringify(config));
JS
CI=1 XDG_CONFIG_HOME="$PWD/.sites-runtime/browser-qa/xdg-config" SITES_RUNTIME_ROOT="$PWD/.sites-runtime/browser-qa" node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local --config .sites-runtime/browser-qa/wrangler.json --persist-to .sites-runtime/browser-qa/state
CI=1 XDG_CONFIG_HOME="$PWD/.sites-runtime/browser-qa/xdg-config" SITES_RUNTIME_ROOT="$PWD/.sites-runtime/browser-qa" node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js dev --local --config .sites-runtime/browser-qa/wrangler.json --persist-to .sites-runtime/browser-qa/state --ip 127.0.0.1 --port 8791 --inspector-port 0
```

다른 터미널에서 같은 저장소 루트로 이동한 뒤 `node tests/storefront-ux.cjs`, `node tests/signup-browser.cjs`를 순서대로 실행합니다. Playwright가 별도로 제공되는 환경이라면 해당 모듈이 Node에서 읽히도록 설정해야 합니다. 기본 Chromium 위치는 `/usr/bin/chromium`이며 `CHROMIUM_PATH`로 변경할 수 있습니다. 결과와 스크린샷은 `.sites-runtime/browser-qa/`에 저장됩니다. 코드 변경 후 다시 빌드했다면 QA Worker도 다시 시작하세요. `--remote`를 추가하지 마세요.

### 소스 전달과 복구

이번 업데이트는 대표님이 제공한 ZIP을 기준으로 했습니다. ZIP에는 원래 Git 이력이 없어, 원본 가져오기를 별도 기준 커밋으로 기록했습니다. 마지막 참고 커밋으로 강제 되돌리지 않았습니다. `.openai/hosting.json`의 기존 프로젝트 ID, `DB`, `BUCKET`을 유지했습니다.

이 환경에는 Sites 프로젝트 조회·배포 도구가 없으며, 공개 사이트 읽기도 네트워크 프록시에서 차단됐습니다. 최신 배포 버전·공개 범위와의 대조 및 기존 프로젝트 배포는 별도로 필요합니다. 다른 호스팅으로 옮겨도 인증이나 DB/R2 연결이 자동으로 이어진다고 가정하지 않습니다.

Git으로 코드를 복구하는 것과 D1의 회원·주문 및 R2의 이미지를 복구하는 것은 별개입니다. 이번 작업에서 운영 데이터 자동 백업이나 상시 감시는 설정하지 않았습니다.

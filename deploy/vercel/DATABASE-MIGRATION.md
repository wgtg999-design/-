# Vercel 데이터 연결과 이전

이 앱은 Turso의 영구 SQLite 데이터베이스를 사용합니다. Vercel의 임시 파일시스템에 회원·주문을 저장하지 않습니다. 기존 Sites의 D1 연결과 로그인 신원은 자동으로 옮겨지지 않습니다. 원래 Sites 프로젝트와 데이터는 그대로 두고, **새로운 빈 Turso DB**를 준비합니다. 이 문서의 명령은 준비 절차이며 현재 운영 데이터에 실행한 결과가 아닙니다.

## 서버 설정

Vercel 서버 환경변수에 `TURSO_DATABASE_URL`과 `TURSO_AUTH_TOKEN`을 설정합니다. URL은 `libsql://` 또는 `https://`이며 토큰을 URL에 붙이지 않습니다. 테스트 파일 DB는 주입하는 테스트 클라이언트에서만 허용합니다. 비밀값·백업·회원정보를 Git 또는 채팅에 올리지 마세요. 외부 서비스 계정과 실제 기존 DB 식별자는 운영자가 안전한 설정 화면에서 확인해야 합니다.

`deploy/vercel`에서 다음 명령으로 내용을 먼저 확인합니다.

```sh
node scripts/migrate.mjs --plan
node scripts/migrate.mjs --check
node scripts/migrate.mjs --initialize
```

`--plan`은 연결하지 않습니다. `--check`는 읽기만 합니다. `--initialize`는 새 빈 DB에 기존 세 SQL 마이그레이션과 Vercel 전용 로그인 연결·업로드 티켓 테이블을 **한 트랜잭션**으로 생성합니다. 상품·약관·회원·주문을 임의로 채우지 않습니다. 테이블이 이미 있으면 거부하며, 정확히 같은 초기화 이력이 있으면 아무 변경 없이 종료합니다. 기존 마이그레이션을 수정하거나 데이터를 삭제하는 복구 옵션은 없습니다.

## 기존 D1 데이터 가져오기

기존 데이터가 없다면 이 단계는 생략합니다. 데이터가 있는지 직접 확인하지 못한 상태에서 ‘이전 완료’로 보지 않습니다. 데이터가 있다면 다음 순서로 운영자가 확인한 이전 시간을 정해 진행합니다.

1. 기존 Sites에서 **회원가입·회원정보 변경·주문·취소/반품·관리자 저장·재고 변경 등 모든 쓰기**를 일시 중단합니다. 신규 주문 접수만 닫아서는 충분하지 않습니다. 현재 코드에는 전체 쓰기를 막는 운영 스위치가 없으므로 호스팅의 유지보수 설정이나 별도 차단을 먼저 마련해야 합니다. 이 도구는 기존 사이트를 차단하지 않습니다.
2. Cloudflare의 공식 설정에서 정확한 계정 ID·D1 DB ID와 **D1 읽기 권한만 있는 토큰**을 확인합니다. 안전한 서버 환경에 `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, `CLOUDFLARE_API_TOKEN`으로 설정합니다. `.openai/hosting.json`의 Sites 프로젝트 ID는 Cloudflare 계정/DB ID가 아닙니다. Sites에서 직접 D1 접근 권한을 제공하지 않으면 먼저 기존 호스팅의 공식 내보내기를 받아야 합니다.
3. Git 저장소 밖의 비공개 경로에 읽기 전용 JSON 백업을 만듭니다. 출력 디렉터리는 미리 만들고, 백업 파일을 Git에 추가하지 마세요.

   ```sh
   node scripts/export-data.mjs --output /secure/backups/street-label-d1.json --maintenance-confirmed
   ```

   이 명령은 고정된 일곱 테이블만 `SELECT`하며 회원·주문·상품·운영 설정의 ID와 원래 값을 보존합니다. 전후 행 수·주요 버전 검사를 하지만 여러 HTTP 조회가 하나의 DB 스냅샷은 아니므로 **모든 쓰기 중단이 필수**입니다. `--maintenance-confirmed`는 운영자가 중단했다고 확인하는 표시이며 중단 기능이 아닙니다. 쓰기가 계속되면 같은 행 수의 일부 변경을 놓칠 수 있습니다. 기존 파일은 덮어쓰지 않습니다.
4. 새 DB에 위 초기화를 완료한 뒤 먼저 JSON을 검증하고 가져옵니다.

   ```sh
   node scripts/import-data.mjs --plan /secure/backups/street-label-d1.json
   node scripts/import-data.mjs --apply /secure/backups/street-label-d1.json
   ```

   importer는 SQL 파일을 실행하지 않습니다. 형식·열·기본 입력값·주문/회원/이력의 관계를 검사하며, 새 DB의 모든 운영 테이블·신원 연결·업로드 티켓이 비어 있어야 합니다. 이미 데이터가 있으면 거부합니다. 입력값을 바인딩해 한 트랜잭션으로 넣고 각 테이블 행 수를 확인합니다. 실패하면 전체를 되돌리며 기존 D1을 수정하지 않습니다. 256MB를 넘거나 서비스의 트랜잭션 제한에 걸리는 큰 데이터는 별도 분할 이전 계획이 필요합니다.
5. 새 DB의 행 수·상품 공개/숨김·재고·가격·설정 버전·주문 총액/상태와 원래 ID를 비교합니다. 실제 운영자 로그인·본인 주문 조회·다른 계정 접근 차단을 검증한 후에만 쓰기와 사이트 주소를 전환합니다. 이전 도중 양쪽 사이트에서 동시에 주문을 받지 마세요.

## 기존 회원과 관리자의 로그인 연결

새 로그인은 Clerk에서 검증한 세션을 사용합니다. 기존 Sites 사용자 ID와 Clerk 사용자 ID는 다릅니다. **이메일이 같다는 이유만으로 자동 합치지 않습니다.** 기존 데이터를 가져온 후 운영자가 각 기존 사용자 ID와 본인이 확인한 Clerk 사용자 ID를 지정합니다.

Git 저장소 밖의 JSON 파일 예시:

```json
[{"providerUserId":"user_EXPLICIT_VERIFIED_ID","legacyUserId":"EXPLICIT_OLD_SITE_USER_ID"}]
```

```sh
node scripts/link-identities.mjs --plan /secure/backups/identity-links.json
node scripts/link-identities.mjs --check /secure/backups/identity-links.json
node scripts/link-identities.mjs --apply /secure/backups/identity-links.json
```

`--plan`은 JSON 구조만 확인합니다. `--check`는 기존 회원/관리자가 실제 DB에 존재하는지와 지정된 Clerk 계정의 **검증된 기본 이메일**을 읽기 검증합니다. `--apply`만 연결 테이블에 씁니다. 서버의 `CLERK_SECRET_KEY`가 필요하며, 기존 회원의 저장 이메일 또는 관리자 전용으로 확인한 `OWNER_BOOTSTRAP_EMAIL`과 비교합니다. 운영자는 ID 쌍이 실제 본인 계정인지도 확인해야 합니다. 관리자만 있고 기존 회원 이메일이 없다면 `OWNER_BOOTSTRAP_EMAIL`을 공식 서버 설정에서 확인해야 합니다. 이미 다른 계정에 연결된 ID는 재배정할 수 없습니다. 기존 고객/주문/관리자 ID 자체를 바꾸지 않습니다.

본인 확인·정당한 계정 연결이 불가능하면 이전 계정 연결을 보류합니다. 이메일이 바뀐 고객 등의 예외를 임의로 처리하지 않습니다. 실제 다른 계정 로그인과 조회 차단까지 검증해야 이전이 완료됩니다.

## 이미지와 복구

현재 선택한 방식은 **기존 R2 버킷을 S3 API로 연결**하는 것입니다. 실제 동일 버킷의 서버용 접근 권한을 설정하면 기존 `/media/<key>`를 유지할 수 있지만, 아직 연결·실제 이미지 조회를 검증한 것은 아닙니다. 버킷이 바뀌면 원래 객체 키·MIME·수량·크기·해시를 확인하며 별도로 복사해야 합니다. JSON DB 백업에 이미지 파일은 들어 있지 않습니다.

Git 코드 복구, D1/Turso 회원·주문 복구, R2 이미지 복구는 서로 다릅니다. 이 도구는 수동으로 실행한 단일 백업/이전을 준비하며 자동 백업이나 상시 감시를 설정하지 않습니다. 오류 시 원래 Sites/D1/R2를 유지하고 새 DB로 전환하지 마세요. 새 DB의 실제 주문이 발생한 후 이전 백업을 덮어쓰는 복구는 금지합니다.

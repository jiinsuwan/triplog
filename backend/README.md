# TripLog Backend

Spring Boot 3.5 · Java 21 · Maven · MyBatis · Flyway · Spring Security(JWT) · SpringDoc

구조·규칙은 [`../docs/architecture.md`](../docs/architecture.md) 참고. 이 문서는 **로컬 셋업/실행**만 다룬다.

## 1. 사전 준비

- **JDK 21** (SSAFY 표준). macOS Homebrew 예:
  ```bash
  brew install openjdk@21
  ```
  keg-only라 시스템 기본에 안 잡히면, 빌드 전에 `JAVA_HOME`을 지정한다:
  ```bash
  export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
  ```
- **MySQL 8** (로컬). 스키마 2개 생성:
  ```sql
  CREATE DATABASE IF NOT EXISTS triplog      DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE DATABASE IF NOT EXISTS triplog_test DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  ```
- **Maven은 설치 불필요** — 동봉된 wrapper(`./mvnw`)를 쓴다.

## 2. 환경변수

루트의 [`../.env.example`](../.env.example)를 복사해 값을 채운다. 백엔드가 읽는 키:

| 키 | 설명 |
|---|---|
| `DB_URL` / `DB_USER` / `DB_PASSWORD` | DB 접속 (예: SSAFY 로컬은 `ssafy`/`ssafy`) |
| `JWT_SECRET` | JWT 서명 키 (HS256, **32바이트 이상**) |
| `UPLOAD_DIR` | 사진 로컬 저장 경로 (기본 `./uploads`) |
| `CORS_ALLOWED_ORIGINS` | 허용 Origin (기본 `http://localhost:5173`) |
| `OAUTH_KAKAO_*` / `OAUTH_GOOGLE_*` / `OAUTH_NAVER_*` | 소셜 로그인 client id·secret·redirect URI |
| `OAUTH_FRONTEND_SUCCESS_URI` / `OAUTH_FRONTEND_FAILURE_URI` | 소셜 로그인 완료/실패 후 프론트 이동 경로 |

> `application.yml`은 값을 직접 담지 않고 env로 주입받는다. `.env`는 절대 커밋하지 않는다.

## 3. 실행 / 테스트

env를 export 한 뒤(또는 IDE 실행 구성에 등록):

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home

./mvnw test                 # 단위 + 통합테스트 (통합테스트는 MySQL triplog_test 필요)
./mvnw spring-boot:run      # 앱 실행 → http://localhost:8080
./mvnw clean package        # 빌드
```

- 헬스 체크: `GET /api/health` → `{"code":"SUCCESS","data":{"status":"UP"}}`
- API 명세(Swagger UI): `http://localhost:8080/swagger-ui.html`
- 앱 기동 시 Flyway가 `db/migration/V*.sql`을 자동 적용한다.

> `./mvnw test`에는 `@SpringBootTest`/Mapper 통합테스트가 포함되어 **MySQL `triplog_test`가 필요**하다. 단위테스트만 돌리려면 `-Dtest=...`로 한정한다.

### 3-1. 로컬 통합테스트 환경

통합테스트는 `@ActiveProfiles("test")`로 `triplog_test`를 쓴다. **빈 `triplog_test` database를 먼저 만들면**(위 §1 SQL), Flyway가 그 안에 테이블/seed migration을 적용하고, 각 테스트는 트랜잭션 롤백·고유 fixture·명시 cleanup으로 격리한다(일부는 `NOT_SUPPORTED`·`@AfterEach` 수동 정리). 데이터 공유는 불필요 — 빈 `triplog_test` + DB 계정만 있으면 재현된다.

**DB 계정**: 기본은 `triplog` 유저. 로컬에 없으면 본인 계정(`root`·`ssafy` 등)을 쓰고 `DB_USER`/`DB_PASSWORD`를 맞춘다.

**환경변수 주입** — Spring Boot는 `.env`를 자동으로 읽지 않는다(dotenv 의존성 없음):

- **IDE**: EnvFile 플러그인 또는 Run Configuration의 Environment Variables
- **CLI (Bash)** — `DB_URL`을 test DB로 **명시**해 주입한다(환경변수가 test profile 기본값보다 우선하므로):
  ```bash
  cd backend
  DB_URL='jdbc:mysql://localhost:3306/triplog_test?serverTimezone=Asia/Seoul&characterEncoding=UTF-8' \
    DB_USER=root DB_PASSWORD=ssafy ./mvnw test
  # 또는 셸에 잡힌 개발용 DB_URL을 먼저 제거: unset DB_URL
  ```
  > `.env`를 `source`하는 방식은 `DB_URL` 값의 `&` 때문에 따옴표 처리가 까다로워 권장하지 않는다. 위처럼 명시적으로 주입한다.
- **CLI (PowerShell)**:
  ```powershell
  cd backend
  $env:DB_URL = 'jdbc:mysql://localhost:3306/triplog_test?serverTimezone=Asia/Seoul&characterEncoding=UTF-8'
  $env:DB_USER = 'root'; $env:DB_PASSWORD = 'ssafy'
  .\mvnw.cmd test
  ```

> ⚠️ 환경변수 `DB_URL`은 test profile 기본값보다 **우선**한다. 셸/IDE에 개발용 `DB_URL`이 이미 있으면 명시 주입을 빠뜨릴 때 test가 개발 DB를 문다. 위처럼 `DB_URL`을 `triplog_test`로 명시하거나 기존 값을 제거(`unset DB_URL`)한다.

## 4. 패키지 구조

`com.triplog` 하위에 도메인별 패키지(`auth user trip place itinerary photo card ai common config`).
각 도메인 계층 표준(controller/service/mapper/dto/domain)과 공유 영역 규칙은
[`architecture.md §2`](../docs/architecture.md)를 따른다.

> **AI(`ai/`) 패키지**: Spring AI 채택(BOM만 적용). provider 구현은 AI 작업이 시작되는 Sprint에서 추가한다.

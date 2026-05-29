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

> `application.yml`은 값을 직접 담지 않고 env로 주입받는다. `.env`는 절대 커밋하지 않는다.

## 3. 실행 / 테스트

env를 export 한 뒤(또는 IDE 실행 구성에 등록):

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home

./mvnw test                 # 단위/웹 테스트 (DB 불필요)
./mvnw spring-boot:run      # 앱 실행 → http://localhost:8080
./mvnw clean package        # 빌드
```

- 헬스 체크: `GET /api/health` → `{"code":"SUCCESS","data":{"status":"UP"}}`
- API 명세(Swagger UI): `http://localhost:8080/swagger-ui.html`
- 앱 기동 시 Flyway가 `db/migration/V*.sql`을 자동 적용한다.

## 4. 패키지 구조

`com.triplog` 하위에 도메인별 패키지(`auth user trip place itinerary photo card ai common config`).
각 도메인 계층 표준(controller/service/mapper/dto/domain)과 공유 영역 규칙은
[`architecture.md §2`](../docs/architecture.md)를 따른다.

> **AI(`ai/`) 패키지**: Spring AI 채택(BOM만 적용). provider 구현은 AI 작업이 시작되는 Sprint에서 추가한다.

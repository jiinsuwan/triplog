# 0001 — fresh clone에서 Node 18 / Java 17로 빌드 실패

- 날짜: 2026-05-29
- 트랙: core (환경)
- 상태: 해결 (버전 고정 + preflight 도입)

## 증상
다른 PC에서 레포를 처음 clone 후 테스트 실행 시 실패.
- `npm run test` — Node `v18.12.1`에서 실패 (프로젝트는 Node 20+ 가정)
- `./mvnw -B test` — Java `17.0.10`이라 Java 21 컴파일 타깃에서 실패

## 원인
- 로컬 런타임 버전이 프로젝트 요구(Node 20+, JDK 21 — architecture D1/§9-2)와 불일치.
- 시작 전 자동으로 걸러주는 장치가 없어, 작업에 들어간 뒤에야 발견됨.

## 해결 / 예방
- `scripts/preflight.sh` 추가 — 작업 전 Node / Java / .env / MySQL 점검, 불일치 시 중단.
- `frontend/.nvmrc`(20) 추가 — `nvm use`로 Node 정렬.
- Java는 `JAVA_HOME`을 21로:
  - macOS: `export JAVA_HOME=$(/usr/libexec/java_home -v 21)`
  - SDKMAN: `sdk use java 21.x`
- backend/frontend README의 요구 버전(Node 20+, JDK 21) 재확인.

## 참고
- CI는 Node 20 / Java 21로 고정돼 있어 CI에서는 재현되지 않음(로컬 전용 이슈). architecture §9-2.

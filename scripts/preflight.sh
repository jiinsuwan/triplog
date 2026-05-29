#!/usr/bin/env bash
# TripLog preflight — 작업 시작 전 환경 점검 (Node 20+ / Java 21 / .env / MySQL)
# 사용: bash scripts/preflight.sh   (레포 루트에서)
set -uo pipefail

fail=0
ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; }
bad()  { printf "  \033[31m✗\033[0m %s\n" "$1"; fail=1; }
warn() { printf "  \033[33m!\033[0m %s\n" "$1"; }

echo "== TripLog preflight =="

# Node 20+
if command -v node >/dev/null 2>&1; then
  nver=$(node -v | sed 's/^v//'); nmajor=${nver%%.*}
  if [ "${nmajor:-0}" -ge 20 ] 2>/dev/null; then ok "Node $nver (>=20)"
  else bad "Node $nver — 20 이상 필요 (frontend/.nvmrc 참고: nvm use)"; fi
else bad "node 없음 — Node 20+ 설치 필요"; fi

# Java 21
if command -v java >/dev/null 2>&1; then
  jver=$(java -version 2>&1 | head -1 | sed -E 's/.*version "([0-9]+).*/\1/')
  if [ "$jver" = "21" ]; then ok "Java $jver"
  else bad "Java $jver — 21 필요 (JAVA_HOME을 21로: /usr/libexec/java_home -v 21)"; fi
else bad "java 없음 — JDK 21 설치 필요"; fi

# .env (루트)
if [ -f .env ]; then ok ".env 존재"
else bad ".env 없음 — .env.example 복사해 채우기"; fi

# MySQL 접속 (선택 점검)
host=${DB_HOST:-127.0.0.1}; port=${DB_PORT:-3306}
if command -v mysqladmin >/dev/null 2>&1; then
  if mysqladmin ping -h "$host" -P "$port" --silent >/dev/null 2>&1; then ok "MySQL ($host:$port) 응답"
  else warn "MySQL ($host:$port) 응답 없음 — 로컬 DB 실행 확인"; fi
else warn "mysqladmin 없음 — MySQL 접속 점검 생략(로컬 DB는 직접 확인)"; fi

echo
if [ "$fail" -ne 0 ]; then echo "preflight 실패 — 위 ✗ 항목을 먼저 해결하세요."; exit 1; fi
echo "preflight 통과."

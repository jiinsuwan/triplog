#!/usr/bin/env bash
# TripLog git hooks 설치 — 각자 로컬에서 1회 실행
# 사용: bash scripts/install-hooks.sh   (레포 루트에서)
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

git config core.hooksPath scripts/hooks
chmod +x scripts/hooks/* 2>/dev/null || true

echo "✓ git hooks 설치됨 (core.hooksPath=scripts/hooks)"
echo "  - pre-push: main 직접 push 차단 + 브랜치명 규칙 경고"

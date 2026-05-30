#!/usr/bin/env bash
# Smoke tests — run against a container to verify the deploy is healthy.
# Usage: bash test/smoke.sh https://192.168.1.126
set -euo pipefail

BASE="${1:-https://192.168.1.126}"
PASS=0
FAIL=0

check() {
  local label="$1" expect="$2" url="$3" method="${4:-GET}" body="${5:-}"
  local args=(-sk -o /dev/null -w "%{http_code}" -X "$method")
  [[ -n "$body" ]] && args+=(-H "Content-Type: application/json" -d "$body")
  local actual
  actual=$(curl "${args[@]}" "$url")
  if [[ "$actual" == "$expect" ]]; then
    echo "  ✓ $label"
    ((PASS++)) || true
  else
    echo "  ✗ $label — expected HTTP $expect, got $actual"
    ((FAIL++)) || true
  fi
}

echo ""
echo "=== Smoke tests: $BASE ==="
echo ""

# Static files
check "GET /                          → 200  (nginx serving app)"   200 "$BASE/"

# Auth — unauthenticated calls
check "GET /api/auth/me               → 401  (not authenticated)"   401 "$BASE/api/auth/me"
check "GET /api/accounts              → 401  (not authenticated)"   401 "$BASE/api/accounts"
check "GET /api/bills                 → 401  (not authenticated)"   401 "$BASE/api/bills"
check "GET /api/categories            → 401  (not authenticated)"   401 "$BASE/api/categories"
check "GET /api/forecast              → 401  (not authenticated)"   401 "$BASE/api/forecast"
check "GET /api/news                  → 401  (not authenticated)"   401 "$BASE/api/news"

# Auth — bad request bodies return 400, not 500
check "POST /api/auth/login (empty)   → 400  (validation working)"  400 "$BASE/api/auth/login"  POST '{}'
check "POST /api/auth/register (empty)→ 400  (validation working)"  400 "$BASE/api/auth/register" POST '{}'

echo ""
if [[ $FAIL -gt 0 ]]; then
  echo "RESULT: FAIL — $FAIL of $((PASS+FAIL)) checks failed"
  exit 1
else
  echo "RESULT: PASS — all $PASS checks passed"
fi

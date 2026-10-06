#!/usr/bin/env bash
# Smoke pós-deploy (ADR-026 §5). Uso: scripts/smoke-prod.sh https://seu-app.up.railway.app
set -u
BASE="${1:?uso: smoke-prod.sh <url-publica>}"
BASE="${BASE%/}"
fail=0
ok() { echo "OK   $1"; }
bad() { echo "FALHA $1"; fail=1; }

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/health")
[ "$code" = "200" ] && ok "/api/health 200" || bad "/api/health respondeu $code (esperado 200)"

code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/dev/login" -H 'content-type: application/json' -d '{}')
[ "$code" = "404" ] && ok "POST /api/dev/login 404" || bad "POST /api/dev/login respondeu $code (esperado 404)"

if curl -s "$BASE/login" | grep -q "Entrar como (teste)"; then bad "/login mostra o login de teste"; else ok "/login sem login de teste"; fi

session=$(curl -s "$BASE/api/auth/session")
if echo "$session" | grep -Eq '"(sessionToken|userId)"'; then bad "/api/auth/session expõe sessionToken/userId"; else ok "/api/auth/session sem sessionToken/userId"; fi

[ "$fail" = "0" ] && echo "SMOKE OK" || { echo "SMOKE FALHOU"; exit 1; }

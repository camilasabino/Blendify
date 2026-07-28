#!/usr/bin/env bash
# Start Blendify infra + API + Web in the background.
# Usage:
#   ./scripts/start.sh
#   ./scripts/start.sh --no-migrate
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_common.sh
source "$SCRIPT_DIR/_common.sh"

RUN_MIGRATE=true
for arg in "$@"; do
  case "$arg" in
    --no-migrate) RUN_MIGRATE=false ;;
    -h|--help)
      echo "Usage: ./scripts/start.sh [--no-migrate]"
      echo "  Starts Docker (Postgres/Redis), migrates DB, then API + Web."
      exit 0
      ;;
  esac
done

echo "==> Starting Blendify"

# Avoid duplicate processes
"$SCRIPT_DIR/stop.sh" >/dev/null 2>&1 || true

echo "→ Docker infra"
docker compose up -d
wait_for_postgres

if [[ "$RUN_MIGRATE" == true ]]; then
  echo "→ Prisma generate + migrate deploy"
  npm run db:generate
  npm run prisma:deploy -w @blendify/api
fi

echo "→ API (logs: $LOG_DIR/api.log)"
nohup npm run dev:api >"$LOG_DIR/api.log" 2>&1 &
echo $! >"$API_PID_FILE"

echo "→ Web (logs: $LOG_DIR/web.log)"
nohup npm run dev:web >"$LOG_DIR/web.log" 2>&1 &
echo $! >"$WEB_PID_FILE"

wait_for_http "http://127.0.0.1:$API_PORT/api/health" "API" 60 || true
wait_for_http "http://127.0.0.1:$WEB_PORT" "Web" 60 || true

echo
echo "✓ Blendify is running"
echo "  Web  → http://127.0.0.1:$WEB_PORT"
echo "  API  → http://127.0.0.1:$API_PORT"
echo "  Docs → http://127.0.0.1:$API_PORT/api/docs"
echo "  Logs → $LOG_DIR/"
echo
echo "Stop with:  npm run stop   or   ./scripts/stop.sh"

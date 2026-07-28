#!/usr/bin/env bash
# Stop Blendify API + Web (and optionally Docker infra).
# Usage:
#   ./scripts/stop.sh
#   ./scripts/stop.sh --infra   # also docker compose down
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_common.sh
source "$SCRIPT_DIR/_common.sh"

STOP_INFRA=false
for arg in "$@"; do
  case "$arg" in
    --infra|-i) STOP_INFRA=true ;;
    -h|--help)
      echo "Usage: ./scripts/stop.sh [--infra]"
      echo "  Stops API (:$API_PORT) and Web (:$WEB_PORT)."
      echo "  --infra  also runs docker compose down"
      exit 0
      ;;
  esac
done

echo "==> Stopping Blendify app"
stop_pidfile "$API_PID_FILE" "API"
stop_pidfile "$WEB_PID_FILE" "Web"
kill_port "$API_PORT"
kill_port "$WEB_PORT"

if [[ "$STOP_INFRA" == true ]]; then
  echo "→ Stopping Docker infra (Postgres + Redis)"
  docker compose down
fi

echo "✓ App stopped"

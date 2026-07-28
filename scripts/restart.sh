#!/usr/bin/env bash
# Soft restart: stop API + Web and start them again (keeps DB / Redis data).
# Usage:
#   ./scripts/restart.sh
#   ./scripts/restart.sh --no-migrate
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_common.sh
source "$SCRIPT_DIR/_common.sh"

START_ARGS=()
for arg in "$@"; do
  case "$arg" in
    -h|--help)
      echo "Usage: ./scripts/restart.sh [--no-migrate]"
      echo "  Soft restart of API + Web. Docker volumes are NOT wiped."
      exit 0
      ;;
    *)
      START_ARGS+=("$arg")
      ;;
  esac
done

echo "==> Restarting Blendify (soft)"
"$SCRIPT_DIR/stop.sh"

if ((${#START_ARGS[@]})); then
  "$SCRIPT_DIR/start.sh" "${START_ARGS[@]}"
else
  "$SCRIPT_DIR/start.sh"
fi

echo "✓ Restart complete"

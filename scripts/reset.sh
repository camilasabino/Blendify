#!/usr/bin/env bash
# Full local reset: stop app, wipe Docker volumes, recreate DB, start again.
# Usage:
#   ./scripts/reset.sh
#   ./scripts/reset.sh --yes   # skip confirmation
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_common.sh
source "$SCRIPT_DIR/_common.sh"

ASSUME_YES=false
for arg in "$@"; do
  case "$arg" in
    --yes|-y) ASSUME_YES=true ;;
    -h|--help)
      echo "Usage: ./scripts/reset.sh [--yes]"
      echo "  Stops the app, deletes Postgres/Redis volumes, remigrates, and starts again."
      exit 0
      ;;
  esac
done

if [[ "$ASSUME_YES" != true ]]; then
  echo "This will STOP Blendify and DELETE local Postgres + Redis data."
  read -r -p "Continue? [y/N] " reply
  case "$reply" in
    y|Y|yes|YES) ;;
    *)
      echo "Cancelled."
      exit 1
      ;;
  esac
fi

echo "==> Resetting Blendify"

"$SCRIPT_DIR/stop.sh" --infra

echo "→ Removing Docker volumes"
docker compose down -v

echo "→ Starting fresh infra"
docker compose up -d
wait_for_postgres

echo "→ Prisma generate + migrate reset"
npm run db:generate
npx -w @blendify/api prisma migrate reset --force --skip-seed

echo "→ Starting app"
"$SCRIPT_DIR/start.sh" --no-migrate

echo
echo "✓ Reset complete (DB wiped + app running)"

#!/usr/bin/env bash
# Shared helpers for Blendify lifecycle scripts.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$ROOT/.blendify"
LOG_DIR="$RUNTIME_DIR/logs"
PID_DIR="$RUNTIME_DIR/pids"
API_PID_FILE="$PID_DIR/api.pid"
WEB_PID_FILE="$PID_DIR/web.pid"
API_PORT="${API_PORT:-3000}"
WEB_PORT="${WEB_PORT:-5173}"

mkdir -p "$LOG_DIR" "$PID_DIR"

cd "$ROOT"

kill_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "→ Stopping process(es) on :$port ($pids)"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 0.4
    pids="$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
    fi
  fi
}

stop_pidfile() {
  local file="$1"
  local label="$2"
  if [[ -f "$file" ]]; then
    local pid
    pid="$(cat "$file" 2>/dev/null || true)"
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "→ Stopping $label (pid $pid)"
      kill "$pid" 2>/dev/null || true
      sleep 0.3
      kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$file"
  fi
}

wait_for_http() {
  local url="$1"
  local label="$2"
  local attempts="${3:-40}"
  local i
  for ((i = 1; i <= attempts; i++)); do
    if curl -sf "$url" >/dev/null 2>&1; then
      echo "✓ $label is up ($url)"
      return 0
    fi
    sleep 0.5
  done
  echo "✗ Timed out waiting for $label ($url)"
  return 1
}

wait_for_postgres() {
  local attempts="${1:-40}"
  local i
  for ((i = 1; i <= attempts; i++)); do
    if docker compose exec -T postgres pg_isready -U blendify -d blendify >/dev/null 2>&1; then
      echo "✓ Postgres is ready"
      return 0
    fi
    sleep 0.5
  done
  echo "✗ Timed out waiting for Postgres"
  return 1
}

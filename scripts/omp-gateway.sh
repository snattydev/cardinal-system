#!/usr/bin/env bash
set -euo pipefail

BROKER_PORT="${OMP_BROKER_PORT:-8765}"
GATEWAY_PORT="${OMP_GATEWAY_PORT:-4000}"
BIND_HOST="${OMP_GATEWAY_BIND:-127.0.0.1}"

case "$BIND_HOST" in
  127.0.0.1|localhost|::1|"[::1]") ;;
  *)
    if [[ "${OMP_GATEWAY_ALLOW_UNSAFE_BIND:-0}" != "1" ]]; then
      echo "[omp-gateway] Refusing --no-auth on non-loopback bind host '$BIND_HOST' (set OMP_GATEWAY_ALLOW_UNSAFE_BIND=1 to override)." >&2
      exit 1
    fi
    ;;
esac

OMP_BIN="$(which omp 2>/dev/null || echo "${HOME}/.bun/bin/omp")"

TOKEN="$("$OMP_BIN" auth-broker token)"

BROKER_PID=""
GATEWAY_PID=""

cleanup() {
  echo "[omp-gateway] Shutting down services..."
  if [[ -n "${GATEWAY_PID:-}" ]]; then
    kill -TERM "$GATEWAY_PID" 2>/dev/null || true
  fi
  if [[ -n "${BROKER_PID:-}" ]]; then
    kill -TERM "$BROKER_PID" 2>/dev/null || true
  fi
}
trap cleanup SIGINT SIGTERM EXIT

# Check if broker is already running on port
if ! (echo > /dev/tcp/127.0.0.1/"${BROKER_PORT}") >/dev/null 2>&1; then
  echo "[omp-gateway] Starting auth-broker on 127.0.0.1:${BROKER_PORT}..."
  "$OMP_BIN" auth-broker serve --bind "127.0.0.1:${BROKER_PORT}" &
  BROKER_PID=$!

  for _ in {1..50}; do
    if (echo > /dev/tcp/127.0.0.1/"${BROKER_PORT}") >/dev/null 2>&1; then
      break
    fi
    sleep 0.1
  done
else
  echo "[omp-gateway] Reusing existing auth-broker on 127.0.0.1:${BROKER_PORT}."
fi

echo "[omp-gateway] Starting auth-gateway on ${BIND_HOST}:${GATEWAY_PORT}..."
export OMP_AUTH_BROKER_URL="http://127.0.0.1:${BROKER_PORT}"
export OMP_AUTH_BROKER_TOKEN="${TOKEN}"

"$OMP_BIN" auth-gateway serve --bind "${BIND_HOST}:${GATEWAY_PORT}" --no-auth &
GATEWAY_PID=$!

wait "$GATEWAY_PID"

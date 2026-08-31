#!/usr/bin/env bash
# Cardinal System — Cloud Agent start phase (runs on every boot).
# Ensures a dev .env exists so the backend can boot. Idempotent: only creates
# .env when missing, never overwrites a user-provided one. If a previous
# generated .env lacks POOL_SECRET (required by the key factory), it is
# appended without touching the rest of the file.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

append_pool_secret_if_missing() {
  if grep -q '^POOL_SECRET=' .env; then
    return 0
  fi
  echo "[start] appending POOL_SECRET to existing .env..."
  printf 'POOL_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env
}

if [ -f .env ]; then
  append_pool_secret_if_missing
  echo "[start] .env already present — leaving other values untouched."
  exit 0
fi

echo "[start] generating a throwaway dev .env (admin / cardinal-dev)..."

# Argon2 hashes contain '$', which Bun's dotenv loader would treat as variable
# expansion. Escape every '$' so the hash is stored verbatim.
HASH="$(bun -e 'console.log(await Bun.password.hash("cardinal-dev"))' | sed 's/\$/\\$/g')"
SECRET="$(openssl rand -hex 32)"
POOL="$(openssl rand -hex 32)"

cat > .env <<EOF
# Auto-generated dev credentials for Cloud Agent. Not for production.
# Login: user "admin" / password "cardinal-dev".
ADMIN_USER=admin
ADMIN_PASSWORD_HASH=$HASH
JWT_SECRET=$SECRET
POOL_SECRET=$POOL
PORT=8787
DB_PATH=./cardinal.db
STATIC_DIR=frontend/dist
EOF

echo "[start] .env created."

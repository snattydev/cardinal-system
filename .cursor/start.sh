#!/usr/bin/env bash
# Cardinal System — Cloud Agent start phase (runs on every boot).
# Ensures a dev .env exists so the backend can boot. Idempotent: only creates
# .env when missing, never overwrites a user-provided one.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [ -f .env ]; then
  echo "[start] .env already present — leaving it untouched."
  exit 0
fi

echo "[start] generating a throwaway dev .env (admin / cardinal-dev)..."

# Argon2 hashes contain '$', which Bun's dotenv loader would treat as variable
# expansion. Escape every '$' so the hash is stored verbatim.
HASH="$(bun -e 'console.log(await Bun.password.hash("cardinal-dev"))' | sed 's/\$/\\$/g')"
SECRET="$(openssl rand -hex 32)"

cat > .env <<EOF
# Auto-generated dev credentials for Cloud Agent. Not for production.
# Login: user "admin" / password "cardinal-dev".
ADMIN_USER=admin
ADMIN_PASSWORD_HASH=$HASH
JWT_SECRET=$SECRET
PORT=8787
DB_PATH=./cardinal.db
STATIC_DIR=frontend/dist
EOF

echo "[start] .env created."

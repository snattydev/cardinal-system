#!/usr/bin/env bash
# Cardinal System — Cloud Agent install phase.
# Idempotent: installs the Bun toolchain (not present in the base image) and
# refreshes workspace dependencies from the frozen lockfile.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# 1. Bun toolchain (the whole stack runs on Bun; the default image ships Node only).
if ! command -v bun >/dev/null 2>&1; then
  echo "[install] installing Bun..."
  curl -fsSL https://bun.sh/install | bash
fi

# Expose bun/bunx on the system PATH for every later phase (install, start,
# terminals) and interactive shells, independent of shell-profile sourcing.
BUN_BIN="$HOME/.bun/bin/bun"
if [ -x "$BUN_BIN" ]; then
  sudo ln -sf "$BUN_BIN" /usr/local/bin/bun
  sudo ln -sf "$BUN_BIN" /usr/local/bin/bunx
fi
hash -r
bun --version

# 2. Workspace dependencies (root lockfile covers packages/*, backend, frontend).
echo "[install] installing workspace dependencies..."
bun install --frozen-lockfile

echo "[install] done."

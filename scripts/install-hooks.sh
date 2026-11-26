#!/usr/bin/env bash
# Activate the versioned hooks in .githooks/ for this clone (idempotent).
set -euo pipefail

root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$root" ]; then
  echo "install-hooks: run this inside a git repository." >&2
  exit 1
fi
if [ ! -d "$root/.githooks" ]; then
  echo "install-hooks: no .githooks/ directory found." >&2
  exit 1
fi

for hook in "$root"/.githooks/*; do
  [ -f "$hook" ] || continue
  case "$(basename "$hook")" in
    *-allowlist|*.md) ;;
    *) chmod +x "$hook" ;;
  esac
done

git -C "$root" config core.hooksPath .githooks
echo "install-hooks: core.hooksPath=.githooks"

#!/usr/bin/env bash
# bootstrap-admin-password.sh — safely set ADMIN_PASSWORD_HASH without model exposure
# Usage:
#   bash scripts/bootstrap-admin-password.sh [--target <path>] [--cloud]
#
# Follows docs/security.md:
# - Prompts in human TTY via `read -s` (no echo, not logged)
# - Passes password to Bun via stdin pipe (never in CLI args / ps / env)
# - Computes argon2id hash via Bun.password.hash
# - Writes only the hash to the destination env file
set -euo pipefail

TARGET=".env"
NON_INTERACTIVE=false

while [ $# -gt 0 ]; do
  case "$1" in
    --target)
      TARGET="$2"
      shift 2
      ;;
    --cloud|--prod)
      TARGET="${HOME}/.config/cardinal/env"
      shift
      ;;
    --non-interactive)
      NON_INTERACTIVE=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--target <path>] [--cloud] [--non-interactive]"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if ! command -v bun >/dev/null 2>&1; then
  echo "Error: bun is required but not found in PATH" >&2
  exit 1
fi

if [ "$NON_INTERACTIVE" = false ]; then
  if [ ! -t 0 ]; then
    echo "Error: stdin is not a TTY. For automated testing, pass --non-interactive" >&2
    exit 1
  fi

  read -r -s -p "Enter new admin password: " PASS1
  echo
  read -r -s -p "Confirm admin password: " PASS2
  echo

  if [ "$PASS1" != "$PASS2" ]; then
    echo "Error: passwords do not match" >&2
    unset PASS1 PASS2
    exit 1
  fi
else
  # Read password from stdin in non-interactive mode
  IFS= read -r -s PASS1
fi

if [ -z "${PASS1:-}" ]; then
  echo "Error: password cannot be empty" >&2
  unset PASS1 PASS2
  exit 1
fi

if [ "${#PASS1}" -lt 8 ]; then
  echo "Error: password must be at least 8 characters" >&2
  unset PASS1 PASS2
  exit 1
fi

# Hash via Bun using stdin (never passed via argv)
HASH=$(printf '%s' "$PASS1" | bun -e '
const pass = (await Bun.stdin.text()).replace(/\r?\n$/, "");
if (!pass) process.exit(1);
const h = await Bun.password.hash(pass, { algorithm: "argon2id" });
process.stdout.write(h);
')

unset PASS1 PASS2

if [ -z "$HASH" ]; then
  echo "Error: failed to generate password hash" >&2
  exit 1
fi

TARGET_DIR="$(dirname "$TARGET")"
if [ ! -d "$TARGET_DIR" ]; then
  mkdir -p "$TARGET_DIR"
fi

if [ -f "$TARGET" ]; then
  TMP_FILE="$(mktemp "${TARGET}.tmp.XXXXXX")"
  if grep -q '^ADMIN_PASSWORD_HASH=' "$TARGET"; then
    # Replace existing line safely
    awk -v h="$HASH" '
      BEGIN { replaced = 0 }
      /^ADMIN_PASSWORD_HASH=/ { print "ADMIN_PASSWORD_HASH=" h; replaced = 1; next }
      { print }
      END { if (!replaced) print "ADMIN_PASSWORD_HASH=" h }
    ' "$TARGET" > "$TMP_FILE"
  else
    cat "$TARGET" > "$TMP_FILE"
    printf "\nADMIN_PASSWORD_HASH=%s\n" "$HASH" >> "$TMP_FILE"
  fi
  chmod --reference="$TARGET" "$TMP_FILE" 2>/dev/null || chmod 600 "$TMP_FILE"
  mv -f "$TMP_FILE" "$TARGET"
else
  # Create new file from deploy/env.example if available, else create minimal
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
  if [ -f "$REPO_ROOT/deploy/env.example" ]; then
    awk -v h="$HASH" '
      /^ADMIN_PASSWORD_HASH=/ { print "ADMIN_PASSWORD_HASH=" h; next }
      { print }
    ' "$REPO_ROOT/deploy/env.example" > "$TARGET"
  else
    printf "ADMIN_USER=admin\nADMIN_PASSWORD_HASH=%s\n" "$HASH" > "$TARGET"
  fi
  chmod 600 "$TARGET"
fi

echo "✓ Admin password hash successfully written to $TARGET"

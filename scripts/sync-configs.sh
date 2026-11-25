#!/usr/bin/env bash
set -euo pipefail

# Allowlist host configuration copier for Cardinal Context Hub (cardinal_agent_config / cardinal_user_config).
# Copies ONLY explicitly allowlisted non-secret config files under $DEST/{agents,user}, stripping any
# accidental inline tokens/passwords via stream redaction so host secrets never land in the mount dir.

DEST="./configs"
INCLUDE_USER=1
DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --no-user)
      INCLUDE_USER=0
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      cat <<'USAGE'
Usage: sync-configs.sh [--no-user] [--dry-run] [DEST_DIR]

Copies allowlisted, secret-redacted config files from $HOME / $XDG_CONFIG_HOME
into DEST_DIR/{agents,user} (default: ./configs) for read-only mounting into cardinal-mcp.
USAGE
      exit 0
      ;;
    *)
      DEST="$1"
      shift
      ;;
  esac
done

HOME_DIR="${HOME:?HOME must be set}"
XDG_DIR="${XDG_CONFIG_HOME:-$HOME_DIR/.config}"

COPIED=0
SKIPPED=0

is_blocked_name() {
  local base
  base="$(basename "$1" | tr '[:upper:]' '[:lower:]')"
  case "$base" in
    .env|.env.*|.npmrc|.netrc|.pypirc|.pgpass|.dockercfg|.git-credentials|known_hosts|authorized_keys|hosts.yml|hosts.yaml)
      return 0
      ;;
    *.pem|*.key|*.p12|*.pfx|*.jks|*.keystore|*.kdbx|*.age|*.gpg|*.asc|*.sqlite|*.sqlite3|*.db|*.db-wal|*.db-shm)
      return 0
      ;;
    *auth*|*cred*|*secret*|*token*|*password*|*passwd*|*oauth*|*private*|*cookie*|*history*|*accounts*|id_rsa*|id_ed25519*|id_ecdsa*|id_dsa*)
      return 0
      ;;
  esac
  return 1
}

redact_stream() {
  awk '
  BEGIN { in_pem = 0 }
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/ {
    print "[REDACTED]"
    in_pem = 1
    next
  }
  /-----END [A-Z0-9 ]*PRIVATE KEY-----/ {
    in_pem = 0
    next
  }
  in_pem { next }
  {
    line = $0
    gsub(/Bearer [A-Za-z0-9._-]+/, "Bearer [REDACTED]", line)
    gsub(/sk-(proj-|svcacct-|ant-|or-v1-|live_|test_)?[A-Za-z0-9_-]{16,}/, "[REDACTED]", line)
    gsub(/(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}/, "[REDACTED]", line)
    gsub(/github_pat_[A-Za-z0-9_]{20,}/, "[REDACTED]", line)
    gsub(/AIza[0-9A-Za-z_-]{20,}/, "[REDACTED]", line)
    gsub(/xox[baprs]-[0-9A-Za-z-]{10,}/, "[REDACTED]", line)
    gsub(/AKIA[0-9A-Z]{16}/, "[REDACTED]", line)
    gsub(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, "[REDACTED]", line)

    out = ""
    rest = line
    while (match(rest, /[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^:\/@"'\'' \t]+:[^@"'\'' \t]+@/)) {
      seg = substr(rest, RSTART, RLENGTH)
      if (index(seg, ":[REDACTED]@") == 0) {
        sub(/:[^:@]+@/, ":[REDACTED]@", seg)
      }
      out = out substr(rest, 1, RSTART - 1) seg
      rest = substr(rest, RSTART + RLENGTH)
    }
    line = out rest

    lower = tolower(line)
    if (lower ~ /(api[_-]?key|secret|token|password|passwd|private[_-]?key|client[_-]?secret|access[_-]?key|auth[_-]?header|webhook[_-]?secret|signing[_-]?key)/) {
      if (line !~ /(\$\{[^}]+\}|\$[A-Za-z_][A-Za-z0-9_]*|\{env:[^}]+\}|env:[A-Za-z0-9_]+|\[REDACTED\]|<[^>]+>)/) {
        if (match(line, /[:=][ \t]*"[^"]+"/)) {
          prefix = substr(line, 1, RSTART)
          seg = substr(line, RSTART + 1, RLENGTH - 1)
          sub(/"[^"]+"/, "\"[REDACTED]\"", seg)
          line = prefix seg substr(line, RSTART + RLENGTH)
        } else if (match(line, /[:=][ \t]*'\''[^'\'']+'\''/)) {
          prefix = substr(line, 1, RSTART)
          seg = substr(line, RSTART + 1, RLENGTH - 1)
          sub(/'\''[^'\'']+'\''/, "'\''[REDACTED]'\''", seg)
          line = prefix seg substr(line, RSTART + RLENGTH)
        } else if (match(line, /[:=][ \t]*[^ \t#"'\'']+/)) {
          prefix = substr(line, 1, RSTART)
          seg = substr(line, RSTART + 1, RLENGTH - 1)
          sub(/[^ \t#"'\'']+/, "[REDACTED]", seg)
          line = prefix seg substr(line, RSTART + RLENGTH)
        }
      }
    }
    print line
  }'
}

copy_one() {
  local src="$1"
  local rel_dest="$2"

  if [ ! -f "$src" ] || [ -L "$src" ]; then
    return 0
  fi

  if is_blocked_name "$src" || is_blocked_name "$rel_dest"; then
    SKIPPED=$((SKIPPED + 1))
    return 0
  fi

  local out="$DEST/$rel_dest"
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '[dry-run] %s -> %s\n' "$src" "$out"
    COPIED=$((COPIED + 1))
    return 0
  fi

  mkdir -p "$(dirname "$out")"
  redact_stream < "$src" > "$out.tmp"
  mv "$out.tmp" "$out"
  COPIED=$((COPIED + 1))
}

# --- Allowlisted Agent Harness Configs -> $DEST/agents/... ---
copy_one "$XDG_DIR/opencode/opencode.json" "agents/opencode/opencode.json"
copy_one "$XDG_DIR/opencode/opencode.jsonc" "agents/opencode/opencode.jsonc"
copy_one "$XDG_DIR/opencode/config.json" "agents/opencode/config.json"
copy_one "$XDG_DIR/opencode/AGENTS.md" "agents/opencode/AGENTS.md"

copy_one "$HOME_DIR/.omp/agent/config.yml" "agents/omp/config.yml"
copy_one "$HOME_DIR/.omp/agent/config.yaml" "agents/omp/config.yaml"
copy_one "$HOME_DIR/.omp/agent/config.json" "agents/omp/config.json"
copy_one "$HOME_DIR/.omp/agent/config.toml" "agents/omp/config.toml"
copy_one "$HOME_DIR/.omp/agent/settings.json" "agents/omp/settings.json"
copy_one "$HOME_DIR/.omp/agent/AGENTS.md" "agents/omp/AGENTS.md"
copy_one "$XDG_DIR/omp/config.json" "agents/omp/xdg-config.json"
copy_one "$XDG_DIR/omp/config.toml" "agents/omp/xdg-config.toml"

copy_one "$HOME_DIR/.gemini/GEMINI.md" "agents/agy/GEMINI.md"
copy_one "$HOME_DIR/.gemini/settings.json" "agents/agy/gemini-settings.json"
copy_one "$HOME_DIR/.gemini/antigravity/mcp_config.json" "agents/agy/mcp_config.json"
copy_one "$XDG_DIR/antigravity/settings.json" "agents/agy/settings.json"

copy_one "$HOME_DIR/.cursor/mcp.json" "agents/cursor/mcp.json"
copy_one "$HOME_DIR/.cursor/cli-config.json" "agents/cursor/cli-config.json"
copy_one "$XDG_DIR/Cursor/User/settings.json" "agents/cursor/settings.json"
copy_one "$XDG_DIR/Cursor/User/keybindings.json" "agents/cursor/keybindings.json"

copy_one "$HOME_DIR/.claude/CLAUDE.md" "agents/claude/CLAUDE.md"
copy_one "$HOME_DIR/.claude/settings.json" "agents/claude/settings.json"

copy_one "$HOME_DIR/.codex/config.toml" "agents/codex/config.toml"
copy_one "$HOME_DIR/.codex/AGENTS.md" "agents/codex/AGENTS.md"

copy_one "$HOME_DIR/.hermes/config.yaml" "agents/hermes/config.yaml"
copy_one "$HOME_DIR/.hermes/SOUL.md" "agents/hermes/SOUL.md"
copy_one "$HOME_DIR/.hermes/USER.md" "agents/hermes/USER.md"
copy_one "$HOME_DIR/.hermes/MEMORY.md" "agents/hermes/MEMORY.md"

copy_one "$XDG_DIR/rtk/config.toml" "agents/rtk/config.toml"

# --- Allowlisted User / Terminal Configs -> $DEST/user/... ---
if [ "$INCLUDE_USER" -eq 1 ]; then
  copy_one "$XDG_DIR/kitty/kitty.conf" "user/kitty/kitty.conf"
  copy_one "$XDG_DIR/kitty/theme.conf" "user/kitty/theme.conf"
  copy_one "$XDG_DIR/kitty/current-theme.conf" "user/kitty/current-theme.conf"

  copy_one "$XDG_DIR/alacritty/alacritty.toml" "user/alacritty/alacritty.toml"
  copy_one "$XDG_DIR/alacritty/alacritty.yml" "user/alacritty/alacritty.yml"
  copy_one "$XDG_DIR/foot/foot.ini" "user/foot/foot.ini"
  copy_one "$XDG_DIR/ghostty/config" "user/ghostty/config"

  copy_one "$XDG_DIR/fish/config.fish" "user/fish/config.fish"
  copy_one "$HOME_DIR/.zshrc" "user/zsh/zshrc"
  copy_one "$XDG_DIR/zsh/.zshrc" "user/zsh/xdg-zshrc"
  copy_one "$HOME_DIR/.bashrc" "user/bash/bashrc"
  copy_one "$XDG_DIR/starship.toml" "user/starship/starship.toml"

  copy_one "$HOME_DIR/.gitconfig" "user/git/gitconfig"
  copy_one "$XDG_DIR/git/config" "user/git/config"
  copy_one "$XDG_DIR/git/ignore" "user/git/ignore"

  copy_one "$HOME_DIR/.tmux.conf" "user/tmux/tmux.conf"
  copy_one "$XDG_DIR/tmux/tmux.conf" "user/tmux/xdg-tmux.conf"
  copy_one "$XDG_DIR/zellij/config.kdl" "user/zellij/config.kdl"
fi

echo "Synced $COPIED config file(s) to $DEST (skipped sensitive: $SKIPPED)."

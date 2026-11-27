#!/usr/bin/env bash
# sync-skills.sh — copy in-repo Cardinal skills out to repo-local .agents/skills, Hermes, and optional vault.
# Source of truth: skills/*.md in this repo.
# Run: bash skills/sync-skills.sh

set -euo pipefail

REPO_SKILLS="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$REPO_SKILLS/.." && pwd)"
AGENT_SKILLS="${AGENT_SKILLS:-$REPO_ROOT/.agents/skills}"
HERMES_SKILLS="${HERMES_SKILLS:-$HOME/.hermes/skills}"
VAULT_SKILLS="${VAULT_SKILLS:-$HOME/Data/The Archive/for-my-agents/skills}"

echo "Syncing skills from $REPO_SKILLS"

synced=0

# Hermes layout: <category>/<name>/SKILL.md
hermes_dest() {
    local name="$1"
    case "$name" in
        cardinal-system) echo "$HERMES_SKILLS/devops/${name}/SKILL.md" ;;
        *) echo "$HERMES_SKILLS/development/${name}/SKILL.md" ;;
    esac
}

sync_skill() {
    local name="$1"
    local src="$REPO_SKILLS/${name}.md"
    if [[ ! -f "$src" ]]; then
        echo "  skip $name — missing $src"
        return
    fi

    local repo_dest="$AGENT_SKILLS/${name}/SKILL.md"
    mkdir -p "$(dirname "$repo_dest")"
    cp "$src" "$repo_dest"
    echo "  $name -> $repo_dest"

    local dest
    dest="$(hermes_dest "$name")"
    mkdir -p "$(dirname "$dest")"
    cp "$src" "$dest"
    echo "  $name -> $dest"

    if [[ -d "$(dirname "$VAULT_SKILLS")" || -d "$VAULT_SKILLS" ]]; then
        mkdir -p "$VAULT_SKILLS"
        cp "$src" "$VAULT_SKILLS/${name}.md"
        echo "  $name -> $VAULT_SKILLS/${name}.md"
    fi

    ((synced++)) || true
}

sync_skill "cardinal-dev"
sync_skill "cardinal-pr"
sync_skill "cardinal-commit"
sync_skill "cardinal-system"
sync_skill "cardinal-standards"

echo "$synced skills synced."

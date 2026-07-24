#!/usr/bin/env bash
# sync-skills.sh — Sync Hermes skills → repo + vault
# Source of truth: ~/.hermes/skills/
# Run: bash skills/sync-skills.sh

set -euo pipefail

HERMES_SKILLS="$HOME/.hermes/skills"
REPO_SKILLS="$(cd "$(dirname "$0")" && pwd)"
VAULT_SKILLS="$HOME/Data/The Archive/for-my-agents/skills"

echo "🔁 Syncing skills..."
echo "   Source: $HERMES_SKILLS"
echo ""

synced=0

sync_skill() {
    local skill_name="$1"
    local src=""

    # Search: category/SKILL.md first, then flat/<name>.md, then flat/<name>/SKILL.md
    src=$(find "$HERMES_SKILLS" -path "*/${skill_name}/SKILL.md" -print -quit 2>/dev/null)
    [[ -z "$src" ]] && src=$(find "$HERMES_SKILLS" -name "${skill_name}.md" -not -path "*/references/*" -print -quit 2>/dev/null)

    if [[ -z "$src" ]]; then
        echo "   ⚠️  $skill_name — no encontrado en Hermes, skip"
        return
    fi

    # Copy to repo
    mkdir -p "$REPO_SKILLS"
    cp "$src" "$REPO_SKILLS/${skill_name}.md"
    echo "   ✅ $skill_name → repo/skills/"

    # Copy to vault
    mkdir -p "$VAULT_SKILLS"
    cp "$src" "$VAULT_SKILLS/${skill_name}.md"
    echo "   ✅ $skill_name → vault/skills/"

    ((synced++)) || true
}

# Cardinal skills
sync_skill "cardinal-dev"
sync_skill "cardinal-pr"
sync_skill "cardinal-commit"

echo ""
echo "🎯 $synced skills sincronizadas."

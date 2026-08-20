#!/usr/bin/env bash
# verify-dev-setup.sh — valida el setup multi-agente de dev en Cardinal System.
# Chequea: agentes OpenCode descubiertos, Cursor rules y .cursor/agents, AGENTS.md, opencode.json.
# Uso: bash scripts/verify-dev-setup.sh
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

pass=0; fail=0
ok()  { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }

echo "== OpenCode =="
if command -v opencode >/dev/null 2>&1 || [ -x "$HOME/.opencode/bin/opencode" ]; then
  OC="$HOME/.opencode/bin/opencode"; [ -x "$OC" ] || OC="opencode"
  ok "opencode disponible ($($OC --version 2>/dev/null))"
  AGENTS=$($OC agent list 2>/dev/null | grep -cE '^(orchestrator|builder|tester|reviewer|docs) ')
  if [ "$AGENTS" -eq 5 ]; then
    ok "5 agentes custom descubiertos (orchestrator, builder, tester, reviewer, docs)"
  else
    bad "se esperaban 5 agentes custom, se encontraron $AGENTS (correr: $OC agent list)"
  fi
else
  bad "opencode no encontrado en PATH ni en ~/.opencode/bin"
fi

echo "== Cursor rules =="
[ -f AGENTS.md ] && ok "AGENTS.md presente" || bad "AGENTS.md faltante"
MDC=".cursor/rules/cardinal.mdc"
if [ -f "$MDC" ]; then
  ok "$MDC presente"
  if grep -q '^description:' "$MDC" && grep -q '^globs:' "$MDC"; then
    ok "frontmatter válido (description + globs)"
  else
    bad "frontmatter incompleto (falta description o globs)"
  fi
else
  bad "$MDC faltante"
fi

echo "== Cursor agents =="
CURSOR_AGENTS="builder tester docs reviewer security-reviewer verifier ws-protocol frontend herdr-dispatcher"
cursor_count=0
for r in $CURSOR_AGENTS; do
  f=".cursor/agents/$r.md"
  if [ -f "$f" ] && grep -q "^name: $r$" "$f" && grep -q "^model: inherit$" "$f"; then
    cursor_count=$((cursor_count+1))
  else
    bad "adapter Cursor inválido o faltante: $f"
  fi
done
if [ "$cursor_count" -eq 9 ]; then
  ok "9 adapters Cursor (name + model inherit)"
fi
for r in reviewer security-reviewer verifier; do
  if grep -q "^readonly: true$" ".cursor/agents/$r.md" 2>/dev/null; then
    :
  else
    bad "readonly true faltante en .cursor/agents/$r.md"
  fi
done
if grep -q "^readonly: true$" .cursor/agents/reviewer.md \
   && grep -q "^readonly: true$" .cursor/agents/security-reviewer.md \
   && grep -q "^readonly: true$" .cursor/agents/verifier.md; then
  ok "readonly en reviewer, security-reviewer, verifier"
fi

echo "== opencode.json =="
if [ -f opencode.json ]; then
  if python3 -c "import json,sys; json.load(open('opencode.json'))" 2>/dev/null; then
    ok "JSON válido"
  else
    bad "JSON inválido"
  fi
  grep -q '"default_agent": "orchestrator"' opencode.json && ok "default_agent=orchestrator" || bad "default_agent no configurado"
  grep -q '"subagent_depth": 2' opencode.json && ok "subagent_depth=2" || bad "subagent_depth no configurado"
else
  bad "opencode.json faltante"
fi

echo ""
echo "Resultado: $pass ok, $fail fallos"
[ "$fail" -eq 0 ]

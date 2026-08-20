# Cursor subagents (2026-08-20)

## Qué se hizo

Nueve subagentes de Cursor (`.cursor/agents/`) y roles canónicos agnósticos en `docs/agents/roles/`. Composer pasa a ser la superficie de desarrollo: delega por tamaño, verifica con `verifier`, y usa `herdr-dispatcher` para otras instancias/kinds si hay Herdr.

## Por qué

El swarm de OpenCode existía, pero el desarrollo diario del repo es Cursor. Hacía falta delegar desde adentro sin duplicar identidades (SOULs) ni hacer que Cardinal spawnee agentes.

## Decisiones

- Híbrido: roles de proceso + especialistas (`ws-protocol`, `frontend`) + `verifier` + `herdr-dispatcher`.
- Capas: role doc agnóstico + adapter Cursor corto. `description` en inglés; cuerpos en español.
- `readonly` en reviewer / security-reviewer / verifier. `is_background: false` en todos.
- OpenCode no se expande; los 5 agentes existentes apuntan al role doc. Reviewer de OpenCode sigue cubriendo security porque ese runtime no tiene `security-reviewer`.
- SOULs y prompts one-shot de PR no se tocaron.

## Alternativas consideradas

- Solo roles de proceso (espejo OpenCode): insuficiente para ws/frontend/Herdr/verifier.
- Especialistas por cada package: demasiado ruido para el Task tool.
- Wrappers flacos (solo “leé el doc”): frágil en contexto vacío.
- Padre orchestrator estricto: peor para diffs de 1–2 archivos.

## Archivos creados/modificados

- Creados: `docs/agents/roles/*.md` (9), `.cursor/agents/*.md` (9), este doc
- Modificados: `AGENTS.md`, `.cursor/rules/cardinal.mdc`, `.opencode/agents/*.md` (punteros), `scripts/verify-dev-setup.sh`, spec status

# Cursor subagents (2026-08-20)

## What was done

Nine Cursor subagents (`.cursor/agents/`) and agnostic canonical roles in `docs/agents/roles/`. Composer becomes the development surface: delegates by size, verifies with `verifier`, and uses `herdr-dispatcher` for other instances/kinds when Herdr is available.

## Why

The OpenCode swarm existed, but day-to-day repo development happens in Cursor. In-IDE delegation was needed without duplicating identities (SOULs) or making Cardinal spawn agents.

## Decisions

- Hybrid: process roles + specialists (`ws-protocol`, `frontend`) + `verifier` + `herdr-dispatcher`.
- Layers: agnostic role doc + concise Cursor adapter. `description` in English; bodies in Spanish.
- `readonly` in reviewer / security-reviewer / verifier. `is_background: false` across all.
- OpenCode not expanded; the 5 existing agents point to the role doc. OpenCode reviewer continues covering security because that runtime lacks `security-reviewer`.
- SOULs and PR one-shot prompts were not touched.

## Alternatives Considered

- Process roles only (OpenCode mirror): insufficient for ws/frontend/Herdr/verifier.
- Specialists for every package: too much noise for the Task tool.
- Thin wrappers (only "read the doc"): fragile in empty contexts.
- Strict orchestrator parent: worse for 1-2 file diffs.

## Created/modified files

- Created: `docs/agents/roles/*.md` (9), `.cursor/agents/*.md` (9), `docs/superpowers/plans/2026-08-20-cursor-subagents.md`, this doc
- Modified: `AGENTS.md`, `.cursor/rules/cardinal.mdc`, `.opencode/agents/*.md` (pointers), `scripts/verify-dev-setup.sh`, `docs/superpowers/specs/2026-08-20-cursor-subagents-design.md` (status/footer)

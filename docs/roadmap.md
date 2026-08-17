# Cardinal System — Roadmap

> Actualizado: 2026-08-06. Single source of truth de prioridades.

---

## 📋 Ahora: Fase 1 — Context Store (✅ Completa — v0.2.0, 2026-08-06)

Pre-Fase 1 (refactors Bun workspaces) completada en PR #5 (v0.1.1).
Ver [`roadmap/fase-1.md`](roadmap/fase-1.md) para el detalle de features.

> Nota (2026-08-10): features 1.3–1.8 mergeadas en `dev` + bump a 0.2.0. Falta PR `dev → main` con la Fase 1 completa cuando se decida estabilizar.

---

## 🗺️ Fases

| Fase | Nombre | Estado | Roadmap |
|------|--------|--------|---------|
| 0 | Esqueleto Vivo | ✅ Completa | [`roadmap/fase-0.md`](roadmap/fase-0.md) |
| 1 | Context Store | ✅ Completa (v0.2.0) | [`roadmap/fase-1.md`](roadmap/fase-1.md) |
| 2 | Cardinal v2 (Blackboard + MCP + Pool) | 🚧 En curso | [`roadmap/fase-2.md`](roadmap/fase-2.md) |
| 3 | Grafo de Conocimiento | 🔮 Futuro | — |
| 4 | Automations | 🔮 Futuro | — |

### Fase 2 — estado

Re-scopeada por Cardinal v2 (2026-08-12): la orquestación es commodity, el
Cardinal es cerebro (identidad + contexto + blackboard). El cuello de botella
ya no es el VPS (webhooks); ahora es **validar los pilares con spikes** (001
blackboard ✅, 002 MCP multi-vault, 003 pool opencode-go). Ver
[`roadmap/fase-2.md`](roadmap/fase-2.md) y el
[plan de backlog](../superpowers/plans/2026-08-17-cardinal-v2-backlog.md).

El desbloqueo por polling local de la API de GitHub (decisión 2026-08-10) sigue
válido como alternativa para triggers externos, pero dejó de ser el cuello de
botella de Fase 2.

---

## 🎯 Arsenal

| Herramienta | Hasta | Rol |
|-------------|-------|-----|
| Antigravity Pro | recurrente | Features pesadas, reviews |
| OpenCode GO | ~20 días | Daily coding |
| Cursor Pro | 4 meses | Refactors grandes, frontend |
| DeepSeek API | $4 crédito | Pentesting |

---

## 📐 Convenciones

- **Versionado:** `MAJOR.FASE.PATCH` (source: `package.json`)
- **Commits:** Conventional Commits (inglés ≤72 chars, body español)
- **Branches:** `feature/* → dev → main` (merge commit)
- **TDD:** Obligatorio para core. No para frontend/docs
- **Agentes:** Nombres fuera del repo. Solo roles
- **Contexto:** `context/` → knowledge base. `AGENTS.md` → dev rules

---

*Se actualiza cuando cambian prioridades o se completa una fase.*

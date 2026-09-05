# Cardinal System — Roadmap

> Actualizado: 2026-09-03. Single source of truth de prioridades.

---

## Ahora: Fase 2 — Cardinal v2 (🚧 en curso — v0.2.5)

Fase 1 (Context Store) completa en `dev` desde v0.2.0. Fase 2 en progreso:
blackboard + MCP hub + router/keys (`/router`, create keys, fusion). Ver
[`roadmap/fase-2.md`](roadmap/fase-2.md). Sprint:
[`sprints/2026-09-03-router-surface.md`](sprints/2026-09-03-router-surface.md).

Pendiente de estabilización: PR `dev → main` cuando se decida freeze (Fase 1 + 2
parciales acumuladas en `dev`).

---

## Fases

| Fase | Nombre | Estado | Roadmap |
|------|--------|--------|---------|
| 0 | Esqueleto Vivo | ✅ Completa | [`roadmap/fase-0.md`](roadmap/fase-0.md) |
| 1 | Context Store | ✅ Completa (v0.2.0) | [`roadmap/fase-1.md`](roadmap/fase-1.md) |
| 2 | Cardinal v2 (Blackboard + MCP + Pool) | 🚧 En curso | [`roadmap/fase-2.md`](roadmap/fase-2.md) |
| 3 | Grafo de Conocimiento | 🔮 Futuro | — |
| 4 | Automations | 🔮 Futuro | — |

### Fase 2 — estado (2026-09-03)

| Pilar | Hecho | Falta |
|-------|-------|-------|
| 3 Blackboard | tasks CRUD, WS, mailbox API, UI `/tasks`, MCP board tools, mailbox MCP | — |
| 1 MCP hub | `packages/mcp` memory + board + mailbox, compose `:8789` | — |
| 2 Pool/router | router, key factory, `/keys` create+expiry+USD, dashboard `/router`, fusion/MoA | spike-003 opencode-go (opcional); e2e zen free (#5); UI mutar cadenas / mostrar Fusion |

Tesis: orquestación es commodity; Cardinal es cerebro (identidad + contexto +
blackboard); herdr/Hermes/CLIs son las manos.

---

## Arsenal

| Herramienta | Hasta | Rol |
|-------------|-------|-----|
| Antigravity Pro | recurrente | Features pesadas, reviews |
| OpenCode GO | ~20 días | Daily coding |
| Cursor Pro | 4 meses | Refactors grandes, frontend |
| DeepSeek API | $4 crédito | Pentesting |

---

## Convenciones

- **Versionado:** `MAJOR.FASE.PATCH` (source: `package.json`)
- **Commits:** Conventional Commits (inglés ≤72 chars, body español)
- **Branches:** `feature/* → dev → main` (merge commit)
- **TDD:** Obligatorio para core. No para frontend/docs
- **Agentes:** Nombres fuera del repo. Solo roles
- **Contexto:** `context/` → knowledge base. `AGENTS.md` → dev rules

---

*Se actualiza cuando cambian prioridades o se completa una fase.*

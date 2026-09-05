# Fase 2 — Cardinal v2 (Blackboard + MCP Hub + Key Pool)

> Spec: [`../superpowers/specs/2026-08-12-cardinal-v2-architecture.md`](../superpowers/specs/2026-08-12-cardinal-v2-architecture.md)
> Plan de ejecución: [`../superpowers/plans/2026-08-17-cardinal-v2-backlog.md`](../superpowers/plans/2026-08-17-cardinal-v2-backlog.md)
> Estado: En curso (v0.2.5, actualizado 2026-09-03).
> Sprint superficie router: [`../sprints/2026-09-03-router-surface.md`](../sprints/2026-09-03-router-surface.md)
> Verificación v0.2.5 (2026-09-05): [`../sprints/2026-09-05-router-surface-verification.md`](../sprints/2026-09-05-router-surface-verification.md)
> Índice: [`../features/2026-09-03-router-surface.md`](../features/2026-09-03-router-surface.md)

---

## Re-scope (2026-08-12)

La Fase 2 original (One-Shot Pipeline) fue re-scopeada por Cardinal v2. Tesis:
**orquestación es commodity** — Cardinal es el cerebro (identidad + contexto +
blackboard); herdr/Hermes/CLIs son las manos.

Cuatro pilares:

| # | Pilar | Estado |
|---|-------|--------|
| 4 | Identidad `sk-cardinal-*` | ✅ Fase 0 |
| 3 | Blackboard + mailbox | ✅ (mailbox MCP 2026-08-31) |
| 1 | MCP context hub multi-vault | ✅ memory + board + mailbox tools en `packages/mcp` |
| 2 | Key pool + router | ✅ router + key factory + `/keys` create/expiry/USD + dashboard JWT `/router` + fusion/MoA (v0.2.5) |

## Lo que se mantiene del diseño original

Del roadmap Fase 2 original (2.1–2.5), solo se mantienen **2.1 LLM Router** y
**2.2 API Key Factory** (ahora dentro del pilar 2). 2.3/2.4/2.5 (one-shot Podman,
PR Review Pipeline, @mention) se reemplazan por blackboard + integración
herdr/MCP — no reimplementar orquestación.

## Progreso

```
Pilar 3 (blackboard): tasks CRUD ✅ · WS broadcast ✅ · mailbox API ✅ · UI /tasks ✅ · MCP board tools ✅ · mailbox MCP ✅
Pilar 1 (MCP):        memory tools ✅ · board tools ✅ · mailbox tools ✅ · compose :8789 ✅
Pilar 2 (pool):       router ✅ · key factory ✅ · `/keys` create+limits ✅ · `/router` dashboard JWT ✅ · fusion/MoA ✅ · pool opencode-go spike-003 ░
```

Detalle del backlog y orden de ejecución en
[`../superpowers/plans/2026-08-17-cardinal-v2-backlog.md`](../superpowers/plans/2026-08-17-cardinal-v2-backlog.md).

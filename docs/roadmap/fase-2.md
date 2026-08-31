# Fase 2 — Cardinal v2 (Blackboard + MCP Hub + Key Pool)

> Spec: [`../superpowers/specs/2026-08-12-cardinal-v2-architecture.md`](../superpowers/specs/2026-08-12-cardinal-v2-architecture.md)
> Plan de ejecución: [`../superpowers/plans/2026-08-17-cardinal-v2-backlog.md`](../superpowers/plans/2026-08-17-cardinal-v2-backlog.md)
> Estado: En curso (actualizado 2026-08-31).

---

## Re-scope (2026-08-12)

La Fase 2 original (One-Shot Pipeline) fue re-scopeada por Cardinal v2. Tesis:
**orquestación es commodity** — Cardinal es el cerebro (identidad + contexto +
blackboard); herdr/Hermes/CLIs son las manos.

Cuatro pilares:

| # | Pilar | Estado |
|---|-------|--------|
| 4 | Identidad `sk-cardinal-*` | ✅ Fase 0 |
| 3 | Blackboard + mailbox | 🚧 casi completo (falta mailbox MCP) |
| 1 | MCP context hub multi-vault | ✅ memory tools + board tools en `packages/mcp` |
| 2 | Key pool + router | ✅ router + key factory + `/keys` UI (v0.2.2) |

## Lo que se mantiene del diseño original

Del roadmap Fase 2 original (2.1–2.5), solo se mantienen **2.1 LLM Router** y
**2.2 API Key Factory** (ahora dentro del pilar 2). 2.3/2.4/2.5 (one-shot Podman,
PR Review Pipeline, @mention) se reemplazan por blackboard + integración
herdr/MCP — no reimplementar orquestación.

## Progreso

```
Pilar 3 (blackboard): tasks CRUD ✅ · WS broadcast ✅ · mailbox API ✅ · UI /tasks ✅ · MCP board tools ✅ · mailbox MCP ░
Pilar 1 (MCP):        memory tools ✅ · board tools ✅ · compose :8789 ✅
Pilar 2 (pool):       router ✅ · key factory ✅ · keys dashboard ✅ · pool opencode-go spike-003 ░
```

Detalle del backlog y orden de ejecución en
[`../superpowers/plans/2026-08-17-cardinal-v2-backlog.md`](../superpowers/plans/2026-08-17-cardinal-v2-backlog.md).

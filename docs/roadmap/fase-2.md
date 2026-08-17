# Fase 2 — Cardinal v2 (Blackboard + MCP Hub + Key Pool)

> Spec: [`../superpowers/specs/2026-08-12-cardinal-v2-architecture.md`](../superpowers/specs/2026-08-12-cardinal-v2-architecture.md)
> Plan de ejecución: [`../superpowers/plans/2026-08-17-cardinal-v2-backlog.md`](../superpowers/plans/2026-08-17-cardinal-v2-backlog.md)
> Estado: En curso.

---

## Re-scope (2026-08-12)

La Fase 2 original (One-Shot Pipeline) fue re-scopeada por Cardinal v2. Tesis:
**orquestación es commodity** — Cardinal es el cerebro (identidad + contexto +
blackboard); herdr/Hermes/CLIs son las manos.

Cuatro pilares:

| # | Pilar | Estado |
|---|-------|--------|
| 4 | Identidad `sk-cardinal-*` | ✅ Fase 0 |
| 3 | Blackboard + mailbox | 🚧 tasks CRUD + WS broadcast; falta mailbox, UI, MCP tools |
| 1 | MCP context hub multi-vault | 📋 diseño (spike-002) |
| 2 | Key pool + router | 📋 diseño (spike-003) |

## Lo que se mantiene del diseño original

Del roadmap Fase 2 original (2.1–2.5), solo se mantienen **2.1 LLM Router** y
**2.2 API Key Factory** (ahora dentro del pilar 2). 2.3/2.4/2.5 (one-shot Podman,
PR Review Pipeline, @mention) se reemplazan por blackboard + integración
herdr/MCP — no reimplementar orquestación.

## Progreso

```
Pilar 3 (blackboard): tasks CRUD ✅ · WS broadcast ✅ · mailbox ░ · UI ░ · MCP tools ░
Pilar 1 (MCP):        spike-002 ░
Pilar 2 (pool):       spike-003 ░ · router ░ · key factory ░
```

Detalle del backlog y orden de ejecución en
[`../superpowers/plans/2026-08-17-cardinal-v2-backlog.md`](../superpowers/plans/2026-08-17-cardinal-v2-backlog.md).

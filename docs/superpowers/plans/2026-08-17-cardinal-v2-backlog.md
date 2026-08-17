# Cardinal v2 — Backlog & Plan de Ejecución

> Complementa la spec viva `docs/superpowers/specs/2026-08-12-cardinal-v2-architecture.md`.
> Estado al momento: v0.2.1, `dev` limpio (cec1add), Fase 1 completa. Suite: 225 pass / 0 fail.

## Estado actual

| Pilar | Estado |
|-------|--------|
| 4 — Identidad (`sk-cardinal-*`) | ✅ Fase 0 |
| 3 — Blackboard | 🚧 tasks CRUD + WS broadcast (`task_update`) hechos; falta mailbox, UI, MCP tools |
| 1 — MCP multi-vault | 📋 solo diseño (spike-002 pendiente) |
| 2 — Key pool + router | 📋 solo diseño (spike-003 pendiente) |

## Backlog

| # | Item | Tipo | TDD | Depende de |
|---|------|------|-----|-----------|
| 1 | Mailbox `messages` — handoff directo agente↔agente | feature | Sí (DB) | — |
| 2 | UI del board — página Tasks + consumir `task_update` + CRUD | frontend | No (build) | — |
| 3 | MCP tools del blackboard (`task_create/list/claim/complete`) | feature | Sí | spike-002 |
| 4 | Spike-002 — MCP multi-vault (`search_vaults` con origen + token budget) | spike | — | — |
| 5 | Spike-003 — pool opencode-go (upstream + metering) | spike | — | — |
| 6 | LLM Router `/v1/chat/completions` + `model_routes` + fallback chain | feature | Sí (router) | spike-003 |
| 7 | Key Factory — scopes + `budget_limit` + keys dinámicas auto-revocables | feature | Sí (keys) | spike-003 |
| 8 | Fix typecheck roto (`maxPayloadLength` vs `bun-types`) | fix | — | — |
| 9 | Docs stale — `roadmap/fase-2.md`, `roadmap.md`, `AGENTS.md` | docs | — | — |
| 10 | PR `dev→main` — estabilizar Fase 1 + blackboard | release | — | todos |

## Orden propuesto

```
Fase 0 — Higiene (desbloquear pipeline)       → 8, 9
Fase 1 — Cerrar pilar 3 (blackboard)          → 1 (mailbox), 2 (UI)
Fase 2 — Validar pilares restantes (spikes)   → 4 (MCP), 5 (pool)
Fase 3 — Build sobre lo validado              → 3 (MCP tools), 6 (router), 7 (key factory)
Fase 4 — Estabilizar                          → 10 (PR dev→main)
```

## Decisiones

- **Higiene primero (8, 9).** El typecheck roto es un blocker del gate de
  verificación para TODO lo que sigue; los docs stale ya me hicieron leer
  "0/16" en `fase-2.md` y tener que cross-checkear contra la spec viva. Son
  chicos y dejan el repo verificado + alineado antes de construir.
- **Cerrar pilar 3 antes de los spikes (1, 2 antes de 4, 5).** El blackboard ya
  está al ~60% (CRUD + broadcast). Con mailbox + UI queda funcional end-to-end,
  con un entregable visible. Los spikes validan pilares enteros que después
  implican features grandes (6, 7) — conviene no arrancarlas hasta validar.
- **Spikes no se planifican con código exacto** (son experimentos throwaway,
  ver skill `spike`). El detalle bite-sized va en el plan de implementación de
  cada feature real (1, 6, 7), no en este backlog.
- **CLI:** para features delegadas, **cursor-agent primero** (Plan Pro, el de
  más uso disponible). Spikes e higiene trivial van directo o cursor-agent según
  peso. Frontend (2) → cursor-agent.
- **El MCP surface del blackboard (3) se expone SOLO tras validar MCP en
  spike-002** — no construir el server MCP antes de saber que el patrón funciona.

## Detalle por item (alcance mínimo)

### 8 — Fix typecheck (`maxPayloadLength`)
- Investigar si `bun-types` reconoce `maxPayloadLength` en la versión instalada;
  si no, alinear la opción de `Bun.serve` con la API tipada (sin debilitar el
  hardening de Fase 1). Archivos: `backend/src/server.ts`, posible `bun.lock`.
- Verificación: `bun run typecheck` verde (backend + frontend).

### 9 — Docs stale
- `docs/roadmap/fase-2.md` → reescribir según re-scope de Cardinal v2 (adiós
  One-Shot Pipeline, hola blackboard + MCP + pool).
- `docs/roadmap.md` y `AGENTS.md` → actualizar "Estado actual" (Fase 1 completa,
  Fase 2 = Cardinal v2 en curso).
- Verificación: lectura humana + `git diff`.

### 1 — Mailbox `messages`
- Tabla `messages` (id, from_agent, to_agent, type, payload_ref, read, created_at)
  + repos + endpoints JWT (`agent_send`, `agent_inbox`) + broadcast `message_update`.
- Espeja el patrón de `tasks` (migration append, handlers puros con `onChange`,
  `broadcastMessage` en el Hub). TDD RED→GREEN en `packages/db` + `backend/src/api`.
- Archivos: `packages/db/src/schema.ts` + `repos.ts`, `packages/core/src/types.ts`,
  `packages/ws/src/hub.ts`, `backend/src/api/messages.ts` (+ test), `backend/src/server.ts`.

### 2 — UI del board (frontend)
- Página `Tasks.tsx` + ruta + entrada en sidebar. Listar tasks (GET `/api/tasks`),
  crear/claimar/completar, y suscribirse a `task_update` vía `connectRoster`
  (extender `ServerEvent` en `frontend/src/lib/types.ts`).
- Verificación: `bun run build` + smoke visual.

### 4 — Spike-002 (MCP multi-vault)
- Dado el RAG proxy (host :8788) + un server MCP fino, cuando un agente llama
  `search_vaults(query)`, entonces recibe chunks con origen de vault y token
  budget. Validar con un agente MCP-capable (Hermes tiene cliente nativo).

### 5 — Spike-003 (pool opencode-go)
- Dado `opencode serve` (GO), cuando el router manda un completion, entonces
  devuelve tokens reales y el metering por key anda. Validar passthrough de
  tools (pitfall Nogal Hive).

### 6 — LLM Router
- `packages/router/` (nuevo workspace): tabla `model_routes` (task_type →
  primary → fallback), endpoint `/v1/chat/completions` OpenAI-compatible,
  fallback chain, streaming SSE. TDD obligatorio (router = ámbito crítico).

### 7 — Key Factory
- Extender `agent_keys` con `scopes` (JSON) y `budget_limit`; enforcement de
  budget; keys `created_by=system` auto-revocables; dashboard de consumo.
  TDD obligatorio (keys).

### 10 — PR dev→main
- Pre-merge checklist de AGENTS.md completo (tests, build, leak audit, Security
  Review si se tocó auth/keys/ws, Standard Review, version bump, docs).
  Nunca auto-merge.

## Próximo paso

Fase 0: arrancar por **8 (typecheck)** y **9 (docs)** — chicos, desbloquean el
pipeline y alinean los docs. Después Fase 1 (mailbox + UI) para cerrar el
blackboard.

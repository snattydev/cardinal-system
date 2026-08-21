# Cardinal v2 — Backlog & Plan de Ejecución

> Complementa la spec viva `docs/superpowers/specs/2026-08-12-cardinal-v2-architecture.md`.
> Estado al momento: v0.2.1, `dev` limpio (cec1add), Fase 1 completa. Suite: 225 pass / 0 fail.
> Re-priorizado 2026-08-20: Santi quiere el router + key pool deployados en local ANTES que mailbox/UI.

## Estado actual

| Pilar | Estado |
|-------|--------|
| 4 — Identidad (`sk-cardinal-*`) | ✅ Fase 0 |
| 2 — Key pool + router | 🚧 EN CURSO (arquitectura cerrada 2026-08-20; GO caído → zen free es el upstream real) |
| 3 — Blackboard | 🚧 tasks CRUD + WS broadcast (`task_update`) hechos; falta mailbox, UI, MCP tools (pospuesto) |
| 1 — MCP multi-vault | 📋 solo diseño (spike-002 pendiente) |

## Backlog (orden nuevo)

| # | Item | Tipo | TDD | Depende de |
|---|------|------|-----|-----------|
| 6 | LLM Router: `providers`/`provider_models`/`model_routes` + `/v1/chat/completions` + fallback chain + SSE + autorouter | feature | Sí (router) | — |
| 7 | Key Factory: `agent_keys` scopes + `budget_limit` + keys auto-revocables + metering | feature | Sí (keys) | — |
| 5 | Seed providers/routes + e2e con zen free real | spike/e2e | — | 6, 7 |
| 1 | Mailbox `messages` — handoff directo agente↔agente | feature | Sí (DB) | — |
| 2 | UI del board — página Tasks | frontend | No (build) | — |
| 3 | MCP tools del blackboard (`task_create/list/claim/complete`) | feature | Sí | spike-002 |
| 4 | Spike-002 — MCP multi-vault (`search_vaults` con origen + token budget) | spike | — | — |
| 8 | Fix typecheck roto (`maxPayloadLength` vs `bun-types`) | fix | — | — |
| 9 | Docs stale — `roadmap/fase-2.md`, `roadmap.md`, `AGENTS.md` | docs | — | — |
| 10 | PR `dev→main` — estabilizar Fase 1 + blackboard + router | release | — | todos |
| 11 | Bootstrap admin password **sin el modelo** (TTY `read -s` → solo hash en env/secret) | security / deploy | — | **blocker cloud** |
| 12 | ✅ Keys dashboard: listar + revocar persistentes (`/keys`) | feature | Sí (keys API) | — |
| 13 | One-shot keys: bloque compacto abajo-izq en `/keys` + hard-delete al terminar (rastro en log del one-shot, no en historial) | feature | Sí | pipeline one-shot |

## Decisiones

- **Router + Key Factory primero (6, 7).** Santi priorizó tener el sistema en testing
  y semi-funcionamiento local: pool + router deployados en los containers de podman.
  Blackboard queda ~60% (CRUD + broadcast) pero NO bloquea — se retoma después.
- **Router provider-agnostic (decisión 2026-08-20).** NO es un registry de alias fijo
  (spec vieja). Es el modelo FreeLLMAPI: `providers` como entidades configurables,
  cada uno con sus `provider_models`, y `model_routes` que resuelven por nombre de
  modelo (autorouter) O por alias explícito. La key derivada define scopes + budget.
  Detalle completo en spec sección 6.
- **Failover transparente.** "Pido deepseek-v4-flash, hay 4 providers free, uso 1,
  se corta → el router pasa al otro sin interrumpir." El cliente nunca ve el failover.
- **GO caído.** `opencode-go/*` no responde (suscripción vencida 2026-08). Upstream
  real disponible: zen free (`opencode/*-free`, validado). `opencode serve` NO expone
  `/v1/chat/completions` (spike-003) — para opencode como upstream va
  `opencode-llm-proxy` (:4010, adapta a OpenAI wire).
- **CLI:** features delegadas → **cursor-agent** (Santi: "usá solo cursor para
  desarrollar en estos momentos"). Spikes e higiene trivial van directo.
- **El MCP surface del blackboard (3) se expone SOLO tras validar MCP en spike-002.**

## Detalle por item (alcance mínimo)

### 6 — LLM Router (provider-agnostic)
- Migración: `providers`, `provider_models`, `model_routes` (ver spec sección 6).
- `packages/router/` (nuevo workspace): resolución (autorouter por nombre de modelo
  + alias por `model_routes`), fallback chain con health/cooldown, upstream calls
  OpenAI-compat (streaming SSE sin romper), metering por key + por provider.
- Endpoint `POST /v1/chat/completions` + `GET /v1/models` en `backend/src/server.ts`,
  auth Bearer `sk-cardinal-*`.
- TDD obligatorio (router = ámbito crítico).

### 7 — Key Factory
- Extender `agent_keys` con `scopes` (JSON), `budget_limit`, `budget_used`;
  enforcement de budget en el router; keys `created_by=system` auto-revocables;
  dashboard de consumo. TDD obligatorio (keys).

### 5 — Seed + e2e
- Seed: provider zen free (opencode) + alias de ejemplo ("fast" → deepseek-v4-flash-free).
- e2e: completion real vía key derivada + verificación de metering.

### 8 — Fix typecheck (`maxPayloadLength`)
- Investigar si `bun-types` reconoce `maxPayloadLength` en la versión instalada;
  si no, alinear la opción de `Bun.serve` con la API tipada (sin debilitar el
  hardening de Fase 1). Archivos: `backend/src/server.ts`, posible `bun.lock`.
- Verificación: `bun run typecheck` verde (backend + frontend).

### 9 — Docs stale
- `docs/roadmap/fase-2.md` → reescribir según re-scope de Cardinal v2.
- `docs/roadmap.md` y `AGENTS.md` → actualizar "Estado actual".
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
- ⚠️ Blocker entorno 2026-08: frontend no levanta en dev (rolldown native binding
  EACCES/ERR_DLOPEN_FAILED por noexec en ~/Data). Mismo issue que el portfolio.

### 4 — Spike-002 (MCP multi-vault)
- Dado el RAG proxy (host :8788) + un server MCP fino, cuando un agente llama
  `search_vaults(query)`, entonces recibe chunks con origen de vault y token
  budget. Validar con un agente MCP-capable (Hermes tiene cliente nativo).

### 10 — PR dev→main
- Pre-merge checklist de AGENTS.md completo (tests, build, leak audit, Security
  Review si se tocó auth/keys/ws, Standard Review, version bump, docs).
  Nunca auto-merge.

### 11 — Bootstrap admin password sin el modelo (blocker cloud)
- En local/testing cualquier password sirve. En nube, no.
- Script TTY: el humano tipea la password (`read -s`); se hashea en esa
  máquina; solo el hash llega a `~/.config/cardinal/env` o Podman secret.
- El modelo **nunca** genera, recibe, imprime ni rota el plaintext. Aplica
  aunque Santi sea el único usuario.
- Ver `docs/security.md` § "Bootstrap de password admin".

### 12 — Keys dashboard (listar + revocar persistentes)
- ✅ Implementado el 2026-08-21.
- Spec: [`2026-08-20-keys-dashboard-design.md`](../specs/2026-08-20-keys-dashboard-design.md).
- Página `/keys`, JWT, sin plaintext. Historial human-revoked detrás de icono log.
- Crear sigue en CLI. TDD en API keys.

### 13 — One-shot keys (diferido)
- Bloque compacto abajo a la izquierda en `/keys` para `created_by=system` vivas.
- Al terminar el one-shot: hard-delete de `agent_keys`; rastro en el log de ese
  agente, no en el historial de `/keys`.
- Depende del pipeline one-shot. Detalle en spec §6.

## Próximo paso

Router + key factory y el dashboard de keys ya están en `dev`. El item 13 sigue
diferido hasta que exista el pipeline one-shot; no implementarlo todavía.

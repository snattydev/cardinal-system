# Cardinal v2 — Backlog & Execution Plan

> Complements the living spec `docs/superpowers/specs/2026-08-12-cardinal-v2-architecture.md`.
> Current status: v0.2.5 (2026-09-03). Fase 1 complete. Fase 2 advanced in `dev`.
> Reprioritized 2026-08-20: router + key pool first; then blackboard/MCP.
> Router surface 2026-09-03: `/router` dashboard + key create/limits + fusion.

## Current Status

| Pillar | Status |
|---|---|
| 4 — Identity (`sk-cardinal-*`) | [done] Fase 0 |
| 2 — Key pool + router | [done] router + key factory + `/keys` create/expiry/USD + JWT `/router` dashboard + fusion/MoA (v0.2.5) |
| 3 — Blackboard | [done] tasks CRUD + WS + mailbox API + `/tasks` UI + MCP board + MCP mailbox |
| 1 — MCP multi-vault | [done] memory + board + mailbox tools (`packages/mcp`, compose `:8789`) |

## Backlog (New Order)

| # | Item | Type | TDD | Depends on |
|---|------|------|-----|------------|
| 6 | [done] Provider-agnostic LLM Router | feature | Yes | — |
| 7 | [done] Key Factory scopes + budget + encryption | feature | Yes | — |
| 5 | [done] Seed providers/routes (`scripts/seed-router.py`) | spike/e2e | — | 6, 7 |
| 1 | [done] Mailbox `messages` API (agent<->agent handoff) | feature | Yes | — |
| 2 | [done] Board UI — `/tasks` page | frontend | No | — |
| 3 | [done] MCP board tools + dual-auth `/api/tasks` (2026-08-31) | feature | Yes | MCP hub |
| 4 | [done] MCP multi-vault memory tools (`packages/mcp`) | feature | Yes | — |
| 8 | [done] Fix typecheck `maxPayloadLength` | fix | — | — |
| 9 | [done] Stale docs — refresh (2026-08-31 + 2026-09-03 router surface) | docs | — | — |
| 10 | PR `dev->main` — stabilize Fase 1 + blackboard + router + MCP | release | — | all |
| 11 | [done] Bootstrap admin password without the model (`scripts/bootstrap-admin-password.sh`) | security / deploy | — | **cloud blocker** |
| 12 | [done] Keys dashboard: list + revoke persistent (`/keys`) | feature | Yes | — |
| 13 | One-shot keys: compact block bottom-left in `/keys` + hard-delete upon completion | feature | Yes | one-shot pipeline (v3 N1) |
| 14 | [done] MCP mailbox tools (`agent_send` / `agent_inbox`) + dual-auth `/api/messages` (2026-08-31) | feature | Yes | 1, 3 |
| 15 | [done] JWT `/router` dashboard + providers/routes API (2026-09-03) | feature | Yes | 6 |
| 16 | [done] `POST /api/keys` create + expiry + USD limit (2026-09-03) | feature | Yes | 7, 12 |
| 17 | [done] Fusion / MoA (`model=fusion`, synthesize judge) (2026-09-03) | feature | Yes | 6 |

## Decisions

- **Router + Key Factory first (6, 7).** The owner prioritized having the system in testing
  and semi-operational locally: pool + router deployed in podman containers.
  Blackboard remains at ~60% (CRUD + broadcast) but does NOT block — it resumes afterward.
- **Provider-agnostic router (decision 2026-08-20).** It is NOT a fixed alias registry
  (old spec). It follows the FreeLLMAPI model: `providers` as configurable entities,
  each with its `provider_models`, and `model_routes` that resolve by model name
  (autorouter) OR by explicit alias. The derived key defines scopes + budget.
  Full detail in spec section 6.
- **Transparent failover.** "I request deepseek-v4-flash, there are 4 free providers, I use 1,
  it drops -> router fails over to another without interruption." The client never sees the failover.
- **GO is down.** `opencode-go/*` is unresponsive (subscription expired 2026-08). Real
  available upstream: zen free (`opencode/*-free`, validated). `opencode serve` does NOT expose
  `/v1/chat/completions` (spike-003) — for opencode as upstream,
  `opencode-llm-proxy` (:4010, adapts to OpenAI wire) is used.
- **CLI:** delegated features -> **cursor-agent** (owner decision: "use only cursor to
  develop right now"). Spikes and trivial hygiene go direct.
- **Blackboard MCP surface (3) is exposed ONLY after validating MCP in spike-002.**

## Item Details (Minimum Scope)

### 6 — LLM Router (Provider-Agnostic)
- Migration: `providers`, `provider_models`, `model_routes` (see spec section 6).
- `packages/router/` (new workspace): resolution (autorouter by model name
  + alias via `model_routes`), fallback chain with health/cooldown, upstream calls
  OpenAI-compat (streaming SSE without breakage), metering per key + per provider.
- Endpoints `POST /v1/chat/completions` + `GET /v1/models` in `backend/src/server.ts`,
  auth Bearer `sk-cardinal-*`.
- Mandatory TDD (router = critical scope).

### 7 — Key Factory
- Extend `agent_keys` with `scopes` (JSON), `budget_limit`, `budget_used`;
  budget enforcement in the router; auto-revocable `created_by=system` keys;
  consumption dashboard. Mandatory TDD (keys).

### 5 — Seed + e2e
- Seed: zen free provider (opencode) + example alias ("fast" -> deepseek-v4-flash-free).
- e2e: real completion via derived key + metering verification.

### 8 — Fix typecheck (`maxPayloadLength`)
- Investigate whether `bun-types` recognizes `maxPayloadLength` in the installed version;
  if not, align the `Bun.serve` option with the typed API (without weakening the
  Fase 1 hardening). Files: `backend/src/server.ts`, possible `bun.lock`.
- Verification: `bun run typecheck` passing (backend + frontend).

### 9 — Stale docs
- [done] Refresh 2026-08-31 (Fase 2 re-scope) and 2026-09-03 (router surface:
  [`2026-09-03-router-surface.md`](../../features/2026-09-03-router-surface.md)).
- `docs/roadmap.md`, `fase-2.md`, `AGENTS.md`, README, backlog, manual
  `docs/guides/router-usage.md`.

### 1 — Mailbox `messages`
- `messages` table (id, from_agent, to_agent, type, payload_ref, read, created_at)
  + repos + JWT endpoints (`agent_send`, `agent_inbox`) + `message_update` broadcast.
- Mirrors the `tasks` pattern (append migration, pure handlers with `onChange`,
  `broadcastMessage` in the Hub). RED->GREEN TDD in `packages/db` + `backend/src/api`.
- Files: `packages/db/src/schema.ts` + `repos.ts`, `packages/core/src/types.ts`,
  `packages/ws/src/hub.ts`, `backend/src/api/messages.ts` (+ test), `backend/src/server.ts`.

### 2 — Board UI (frontend)
- Page `Tasks.tsx` + route + sidebar entry. List tasks (GET `/api/tasks`),
  create/claim/complete, and subscribe to `task_update` via `connectRoster`
  (extend `ServerEvent` in `frontend/src/lib/types.ts`).
- Verification: `bun run build` + visual smoke test.
- [blocked] Environment blocker 2026-08: frontend does not run in dev (rolldown native binding
  EACCES/ERR_DLOPEN_FAILED due to noexec on ~/Data). Same issue as the portfolio.

### 4 — Spike-002 (MCP multi-vault)
- Given the RAG proxy (host :8788) + a thin MCP server, when an agent calls
  `search_vaults(query)`, it receives chunks with vault origin and token
  budget. Validate with an MCP-capable agent (Hermes has a native client).

### 10 — PR dev->main
- Complete pre-merge checklist from AGENTS.md (tests, build, leak audit, Security
  Review if auth/keys/ws touched, Standard Review, version bump, docs).
  Never auto-merge.

### 11 — Bootstrap admin password without the model (cloud blocker)
- In local/testing any password works. In the cloud, no.
- TTY script: the human types the password (`read -s`); it is hashed on that
  machine; only the hash reaches `~/.config/cardinal/env` or Podman secret.
- The model **never** generates, receives, prints, or rotates the plaintext. Applies
  even though the owner is the sole user.
- See `docs/security.md` § "Admin password bootstrap".

### 12 — Keys dashboard (list + revoke persistent)
- [done] Implemented on 2026-08-21. Create + expiry + USD: item **16** (2026-09-03).
- Original spec: [`2026-08-20-keys-dashboard-design.md`](../specs/2026-08-20-keys-dashboard-design.md)
  (create was CLI-only; that is now obsolete).
- Page `/keys`, JWT. Human-revoked history behind log icon.

### 13 — One-shot keys (deferred)
- Compact block at the bottom-left of `/keys` for live `created_by=system` keys.
- Upon completing the one-shot: hard-delete from `agent_keys`; trace remains in that
  agent's log, not in `/keys` history.
- Depends on the one-shot pipeline. Detail in spec §6.

### 14 — MCP mailbox tools + dual-auth `/api/messages`
- [done] Implemented on 2026-08-31. Doc:
  [`2026-08-31-mcp-mailbox-tools.md`](../../features/2026-08-31-mcp-mailbox-tools.md).
- Tools `cardinal_agent_send` / `cardinal_agent_inbox` (always listed). Dual-auth
  JWT or agent key; key cannot spoof `from_agent`, cannot read another's inbox, cannot mark-read
  on another mailbox.

### 15 — JWT `/router` dashboard
- [done] 2026-09-03. Doc: [`2026-09-03-router-dashboard.md`](../../features/2026-09-03-router-dashboard.md).
- `GET/PATCH /api/router/providers`, `GET/PUT /api/router/routes`. Read-only UI `/router`
  (SAO tables). No Fusion editor.

### 16 — Key create + expiry + USD
- [done] 2026-09-03. Doc: [`2026-09-03-key-create-limits.md`](../../features/2026-09-03-key-create-limits.md).
- `POST /api/keys` JWT; form on `/keys`; plaintext shown once. Router: expiry ->
  unauthorized; USD >= limit -> 402.

### 17 — Fusion / MoA
- [done] 2026-09-03. Doc: [`2026-09-03-router-fusion.md`](../../features/2026-09-03-router-fusion.md).
- `fallback_chain` object `{mode:fusion, panel, judge}`. v1: `synthesize`, no
  streaming. Seed via SQL (`upsertModelRoute` remains arrays).

## Next Step

Router surface (15–17) and mailbox MCP (14) are in the working tree (`dev`).
Next: item **5** (seed providers/routes + zen free e2e), item **11**
(bootstrap admin password TTY, cloud blocker), item **10** (PR `dev->main`
upon freeze). Follow-ups for 15–17 (not now): UI chain mutation, show
Fusion in `/router`, USD hop-level in Fusion. Item 13 remains deferred until
the one-shot pipeline; **do not implement it**.

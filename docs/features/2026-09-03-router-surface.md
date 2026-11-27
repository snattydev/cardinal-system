# Router Surface v0.2.5 (dashboard + keys + fusion) (2026-09-03)

Three parallel slices (Herdr Background, kind Cursor) across pillar 2
(pool/router). This document serves as the unified index; slice details live in
their respective feature docs.

| Slice | Agent | Doc |
|-------|-------|-----|
| JWT Dashboard `/router` | `card-router-ui` | [`2026-09-03-router-dashboard.md`](./2026-09-03-router-dashboard.md) |
| Create keys + expiry + USD | `card-keys` | [`2026-09-03-key-create-limits.md`](./2026-09-03-key-create-limits.md) |
| Fusion / MoA | `card-fusion` | [`2026-09-03-router-fusion.md`](./2026-09-03-router-fusion.md) |

Sprint: [`docs/sprints/2026-09-03-router-surface.md`](../sprints/2026-09-03-router-surface.md).

## What was done (unified view)

The router is no longer just `/v1` + CLI. Three surfaces fit together:

1. **Operating the pool** — `/router` page (JWT, SAO theme, tables). Lists
   providers/models/aliases. API `GET/PATCH/PUT /api/router/*`. The UI is
   read-only; PATCH/PUT exist for clients.
2. **Client identity** — `/keys` creates `sk-cardinal-*` with scopes, token
   budget, `expires_at`, and USD cap. The router cuts off on expiry (401) and USD
   (402) in addition to pre-existing token budgets.
3. **Fusion** — `POST /v1/chat/completions` with `model=fusion` (or an alias
   whose `fallback_chain` is `{"mode":"fusion",...}`) fans out to N proposers and
   a judge synthesizes a completion. Sequential failover remains unchanged.

Separation of responsibilities:

| Surface | Auth | Who |
|---------|------|-----|
| `/v1/chat/completions`, `/v1/models` | Bearer `sk-cardinal-*` | agents / apps |
| `/api/router/*`, `/router` | JWT cookie | admin dashboard |
| `/api/keys`, `/keys` | JWT cookie | admin dashboard |

## Why

The pool (v0.2.2) had an engine and `/keys` for list/revoke, but Settings retained
"MODEL ROUTER coming in Fase 2", key creation was CLI-only, and there was no
Mixture of Agents. The owner requested all three features together, inspired by
FreeLLMAPI, without cloning its unified key or public catalog.

## Decisions (unified)

- Three agents, same working tree, file ownership: dashboard does not touch
  `packages/router/src/router.ts`; keys only touches auth/budget pre-loops; Fusion
  lives in `fusion.ts` + a short dispatch.
- Version bump **0.2.5** (0.2.4 reserved for mailbox MCP). In `dev`, PATCH only.
- Fusion is not edited in `/router` v1: `GET /api/router/routes` parses
  `fallback_chain` as an array; a Fusion object renders as empty hops (`-`).
  Seeded via SQL. Follow-up.
- Fusion USD metering: cap pre-check runs before dispatch; `meterSuccess` in
  `fusion.ts` does not increment `budget_usd_used`. Follow-up.
- No commit by subagents; parent unifies docs and state.

## Alternatives Considered

- **Single agent, three serial PRs:** rejected. The owner requested a Cursor session
  per feature in Herdr Background.
- **Fusion as a top-level tab (FreeLLMAPI):** deferred. Cardinal has few
  providers; chain dashboard and key creation come first.
- **Unified key format like `freellmapi-...`:** rejected. Breaks `sk-cardinal-*` +
  per-agent scopes.

## Files (union of the three slices)

See each individual feature doc. This index does not duplicate the list.

## Verification

Parent, unified suite over the combined working tree (2026-09-03):

- `bun test --timeout 30000 packages/*/src backend/src` -> **417 pass / 0 fail**
- `bun run build` (frontend) -> Vite 8.1.5, **exit 0**

## Known Gaps (not in this bump)

- `/router` UI does not call PATCH/PUT; does not show Fusion panel/judge.
- `upsertModelRoute` and `PUT /api/router/routes/:alias` only accept arrays
  (failover). Fusion is seeded by inserting the JSON object directly.
- Fusion does not meter hop-level USD; `best_of` and Fusion streaming return 400/501.
- Seed + e2e real free zen (backlog #5) and spike-003 opencode-go remain open.
- Backlog item #13 one-shot keys: deferred.

# Mixture of Agents / Fusion in `@cardinal/router` (2026-09-03)

Pillar 2 of Cardinal v2. The client requests the virtual model `fusion` (or an
alias whose `fallback_chain` is a JSON object with `"mode":"fusion"`). The router
fires N proposers in parallel and a cheap judge synthesizes **one** OpenAI-shaped
completion. This is not sequential failover: that path continues to exist.

## What was done

- Fusion dispatch in `packages/router` **after** auth, scope, token budget, and
  USD/expiry pre-checks in `routeCompletion`. Trigger:
  `request.model === "fusion"` **or** the route JSON has `mode === "fusion"`.
- Proposer fan-out using `Promise.allSettled`. 2xx drafts with a string
  `choices[0].message.content` are passed to the judge. Partial failures: only
  healthy drafts are used. If **all** proposers fail -> `all_providers_failed`
  (HTTP 502) with `attempts`; the judge is **not** called.
- The judge receives the original messages plus a user turn:
  `Synthesize a single answer from these proposer drafts:` and returns an
  OpenAI completion. The `model` field in the response is rewritten to the
  requested alias (`fusion` or `mix`).
- Same endpoint: `POST /v1/chat/completions`. v1 does **not** stream Fusion.
- Configuration in the existing `model_routes.fallback_chain` column as a JSON
  **object** (no migration). Hop arrays remain sequential failover.

Canonical config:

```json
{
  "mode": "fusion",
  "panel": [
    { "provider": "p1", "model": "m1" },
    { "provider": "p2", "model": "m2" }
  ],
  "judge": { "provider": "judge-p", "model": "judge-m" },
  "strategy": "synthesize"
}
```

`panel[]` and `judge` can be strings (model IDs: resolved to the first active
hop). `upsertModelRoute` continues to accept **only** hop arrays; a Fusion route
is seeded via SQL / direct INSERT of the JSON object.

New errors (HTTP mapping in `backend/src/api/router.ts`):

| Code | HTTP | Condition |
|------|------|-----------|
| `fusion_not_configured` | 400 | Missing or invalid panel/judge (or `fusion` alias without route) |
| `fusion_streaming_unsupported` | 400 | `stream: true` |
| `fusion_strategy_unsupported` | 501 | `strategy: "best_of"` (v1 supports only `synthesize`) |

Scopes: the key must include `fusion` (or the requested alias) or `*`. Checked
against `request.model` **before** dispatch.

Metering: `consumeBudget` + `usage_log` for each successful 2xx hop (N proposers +
1 judge). Failed hops are not metered. If proposers exhaust the token budget
and revoke the key, the judge is **not** called (`budget_exceeded`) — no further
provider calls are made after revocation.

USD/expiry: the card-key pre-loop in `routeCompletion` (`findActiveKeyByHash`
for `expires_at`; already spent `budget_usd_limit` -> 402) runs **before**
Fusion dispatch. The hop metering in `fusion.ts` mirrors sequential token
metering and does **not** increment USD. Hop-level USD is not part of this
feature.

UI: none. `frontend/src/pages/Router.tsx` exists (JWT dashboard for sequential
routes); Fusion routes are not edited there.

## Why

The router already supported sequential failover (try one hop, on failure try the
next). Mixture of Agents requires different semantics: multiple parallel drafts
and one synthesis, not "the first one that responds". Reusing `fallback_chain`
as an object avoids a migration and keeps the alias (`fusion`, `mix`, ...) as a
shareable source of truth — the client requests a virtual model without configuring
the panel in the request body.

## Decisions

- Config in `fallback_chain` as a JSON object vs new columns: no migration.
  Pure arrays = sequential; object with `mode: "fusion"` = Fusion.
- Fan-out + judge vs failover: two distinct paths. Sequential remains unchanged.
- `stream: true` -> explicit 400; flag is not ignored nor answered with silent JSON.
- `best_of` -> 501, not implemented. v1 only supports `synthesize`.
- Duplicated helpers in `fusion.ts` (`meterSuccess`, usage parsing, `model` rewrite)
  to avoid importing `router.ts` (circular dependency).
- Abort judge invocation if proposer metering revoked the key due to token budget.
- Seed Fusion outside `upsertModelRoute` (which remains typed to hop arrays).
- Fusion tests mock upstream on port **18998**; sequential remains on **18999**.

## Alternatives Considered

- **`kind` column in `model_routes`:** rejected. Extra migration for a
  discriminator already expressed by `mode` in JSON.
- **Extra config in request body without DB:** less shareable. The DB alias is the
  source of truth; per-request config is out of scope for v1.
- **Ignore `stream: true` and return JSON:** rejected. Explicit 400
  (`fusion_streaming_unsupported`) rather than faking SSE.
- **Fusion editor in `/router` dashboard:** deferred. The route UI is sequential;
  Fusion is seeded via SQL.

## Files

- Created: `packages/router/src/fusion.ts`,
  `packages/router/src/fusion.test.ts`.
- Modified: `packages/router/src/router.ts` (dispatch after
  auth/scope/budget/usd), `packages/router/src/error.ts`,
  `backend/src/api/router.ts` (400/501 mapping).
- Docs: `docs/features/2026-09-03-router-fusion.md`. One-line reference in
  `docs/roadmap/fase-2.md` and `docs/guides/router-usage.md`.
- Untouched: `frontend/src/pages/Router.tsx`, `package.json` (no bump),
  SOULs.

## Verification

- Parent: `bun test packages/router` -> **22 pass / 0 fail** (11 Fusion + 11
  sequential, including card-keys USD/expiry tests).
- Unified suite (parent, 2026-09-03): **417 pass / 0 fail**.

## Related

Index: [`2026-09-03-router-surface.md`](./2026-09-03-router-surface.md).
Dashboard: [`2026-09-03-router-dashboard.md`](./2026-09-03-router-dashboard.md).
Keys: [`2026-09-03-key-create-limits.md`](./2026-09-03-key-create-limits.md).
Version: **0.2.5**.

# Key create + expiry/USD limits (2026-09-03)

The `/keys` dashboard now creates persistent keys (`sk-cardinal-*`) with scopes,
token budget, expiration, and USD cap. The router enforces expiry and USD limits.
Plaintext is displayed only once.

## What was done

The protected `/keys` page is no longer list/revoke only: it now creates persistent
keys with scopes, token budget limit, expiration date, and USD cap. The plaintext
(`sk-cardinal-*`) is displayed once in a copyable banner; it never reappears in the
list.

The JWT API adds `POST /api/keys` (same cookie as `GET`). The body is
`{ agentName, scopes?, budgetLimit?, expiresAt?, budgetUsdLimit? }`. Returns
200 `{ key: plaintext, item: KeyItem }` or 400 `agent_not_found` /
`invalid_payload`. `created_by=human`. A past or unparseable `expiresAt` returns
400. Unlike the CLI `keygen`, the endpoint does **not** register the agent:
returns 400 if it does not exist.

`KeyItem` (camelCase) adds `expiresAt`, `budgetUsdLimit`, and `budgetUsdUsed`.

Schema: migration 14 on `agent_keys` adds `expires_at TEXT NULL`,
`budget_usd_limit REAL NULL`, and `budget_usd_used REAL NOT NULL DEFAULT 0`.
`createAgentKey` accepts `expiresAt` / `budgetUsdLimit`.
`findActiveKeyByHash` rejects past `expires_at` (`Date.parse <= now`) in addition
to revoked keys. `consumeBudgetUsd` only increments if a limit exists; fails if the
increment would exceed the cap; does not increment if limit is null.

The router, before the hop loop: expired key -> `unauthorized`;
`budget_usd_used >= budget_usd_limit` -> `budget_exceeded` (HTTP 402 already
existed). USD metering: `(totalTokens/1e6)*hop.costPerMtok`. Cost 0 does not
increment; keys without a USD limit do not increment. USD overshoot (`consumeBudgetUsd`
false) revokes the key, mirroring token overshoot behavior.

UI: form (agent + roster datalist, comma-separated scopes, tokens,
datetime-local, USD), plaintext banner + copy button, rows displaying expiration and
USD used/limit.

The CLI `bun run keygen` still exists; it was not rewritten.

## Why

Spec 2026-08-20 intentionally excluded key creation (CLI only): plaintext is
printed once and there was no creation UI. Creation is now required from the
dashboard with real limits. Tokens were already enforced; expiry and USD did not
exist in schema or router. `providers.cost_per_mtok` already existed
(default 0) but did not revoke keys.

## Decisions

- Create does **not** pre-register the agent: 400 if it does not exist. CLI keygen
  does. The dashboard operates on known agents.
- Response `{ key, item }` to avoid colliding with revoke `{ key: KeyItem }`.
- Expiry compared in JS (`Date.parse`) because SQLite `datetime('now')` is not
  ISO with T/Z.
- USD increments only when `budget_usd_limit` is set; `cost_per_mtok` 0 does not
  change used amount.
- Post-success USD overshoot revokes the key (like tokens), preventing fail-open states.
- No `/router` page in this slice (handled by the dashboard slice). No Fusion.

## Alternatives Considered

- **Pre-register agent like keygen:** rejected — spec requires 400 if agent does
  not exist.
- **Filter expired keys in SQL vs JS:** JS, due to the ISO wire format.
- **402 pre-flight estimating tokens:** impossible without usage; checked via
  `used >= limit` before the loop and overshoot afterwards.
- **Include plaintext in listing:** no — shown once in the create banner.

## Files

- Created: `docs/features/2026-09-03-key-create-limits.md`.
- Modified: `packages/db/src/schema.ts`, `packages/db/src/repos.ts`,
  `packages/db/src/index.ts`, `packages/db/src/db.test.ts`,
  `packages/core/src/types.ts`, `packages/router/src/resolve.ts`,
  `packages/router/src/router.ts`, `packages/router/src/router.test.ts`,
  `backend/src/api/keys.ts`, `backend/src/api/keys.test.ts`,
  `backend/src/server.ts`, `backend/src/server.test.ts`,
  `frontend/src/pages/Keys.tsx`, `frontend/src/lib/types.ts` (`KeyItem`).
- Note: Fusion hop mapper received `costPerMtok` because the `ResolvedHop`
  type requires it; not a functional part of this slice.

## Verification

- Slice: 146 pass in db + router + keys + server; frontend build exit 0.
- Unified suite (parent, 2026-09-03): **417 pass / 0 fail**.

## Related

Index: [`2026-09-03-router-surface.md`](./2026-09-03-router-surface.md).
Dashboard `/router`: [`2026-09-03-router-dashboard.md`](./2026-09-03-router-dashboard.md).
Fusion: [`2026-09-03-router-fusion.md`](./2026-09-03-router-fusion.md).
Version: **0.2.5**.

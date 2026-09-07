# Operational Dashboard `/router` (JWT) (2026-09-03)

Pillar 2 of Cardinal v2. The JWT dashboard displays already-persisted router
providers, models, and aliases. Not dual-auth: uses the same cookie pattern as
`/api/keys`.

## What was done

- JWT dashboard API (session cookie, **not** agent Bearer):
  - `GET /api/router/providers` -> `{ providers, models }` in snake_case. Public
    rows; **never** `api_key_enc`.
  - `GET /api/router/routes` -> `{ routes }` with `fallback_chain` parsed into
    `{ provider, model }[]`.
  - `PATCH /api/router/providers/:id` body `{ status: "active" | "disabled" }`
    (numeric id).
  - `PUT /api/router/routes/:alias` body `{ fallback_chain: hops }` (upsert).
- Handlers in `backend/src/api/router-dashboard.ts`, isolated from public `/v1`
  (`backend/src/api/router.ts`). `packages/router/src/router.ts` was not touched.
- Robustness: `decodeAlias` with try/catch preventing raw `%` in alias from throwing
  `URIError`; malformed JSON in `fallback_chain` -> empty hops, not 500.
- Frontend `/router`: dense SAO tables (routes + providers), search filter,
  persisted provider status, note `no live probe — stored provider status`.
  The UI is **read-only** (does not invoke PATCH/PUT). Those endpoints exist to
  complete the v1 API surface.
- Settings: the MODEL ROUTER placeholder was replaced by the link `open router ->`.
  Layout navigation: Router placed after Tasks. Keys remain at `/keys`.
- Out of scope for this slice: Fusion/MoA, health cron, mutations from UI.

Live DB (`cardinal-backend` `/data/cardinal.db`) already includes provider `mock-local`
(active, cost 0) and alias `fast` -> `mock-local/test-model`.

## Why

The router and key factory were already in local production (`/v1/chat/completions`,
`/keys`). Settings retained a placeholder MODEL ROUTER; there was no operational
surface to inspect aliases, hops, and provider status without querying SQL directly.
This slice closes that gap using the same JWT authentication as the rest of the dashboard.

## Decisions

- JWT cookie **only**, matching the `/api/keys` pattern. No dual-auth with
  `sk-cardinal-*`: configuring providers/routes is an admin operation, not an agent operation.
- Handlers in dedicated file (`router-dashboard.ts`), without mixing into public
  `/v1` completions. Routing core in `packages/router` remains unchanged.
- Responses in snake_case (public rows), aligned with DB columns rather than camelCase
  in `/api/keys`.
- `PATCH` by numeric id; `PUT` by alias (upsert). Provider status is persisted
  `active` | `disabled` — no live probing or health cron.
- Read-only UI: GET is sufficient for visual operations; PATCH/PUT remain available
  for API clients, not this page.
- `decodeAlias` fail-safe and fail-soft `fallback_chain` parsing (hops `[]`) preventing
  500 errors on raw `%` or corrupted JSON. Standard review HIGH findings on double-decode
  and parsing addressed.
- Keys are not mixed into `/router`; they live in `/keys`.

## Alternatives Considered

- **Dual-auth JWT or agent Bearer:** rejected. An agent key must not mutate providers
  or routes. The keys dashboard already established the JWT-only pattern for administration.
- **Mutate from UI (PATCH/PUT):** deferred. Completing the v1 API does not mandate
  forms in this slice; the operational screen is read-only.
- **Live probe / health cron:** out of scope. Status reflects what is persisted in DB.
- **Fusion editor in `/router`:** deferred to consolidation with
  [`2026-09-03-router-fusion.md`](./2026-09-03-router-fusion.md). GET parses only
  arrays; a Fusion object renders as empty hops.
- **Reuse `backend/src/api/router.ts`:** rejected. That file serves the public
  `/v1` wire (Bearer). Mixing JWT dashboard logic couples two distinct surfaces.

## Files

- Created: `backend/src/api/router-dashboard.ts`,
  `backend/src/api/router-dashboard.test.ts`, `frontend/src/pages/Router.tsx`,
  `docs/features/2026-09-03-router-dashboard.md`.
- Modified: `backend/src/server.ts`, `backend/src/server.test.ts`,
  `frontend/src/App.tsx`, `frontend/src/components/Layout.tsx`,
  `frontend/src/lib/types.ts`, `frontend/src/pages/Settings.tsx`,
  `docs/roadmap/fase-2.md`,
  `docs/superpowers/plans/2026-08-17-cardinal-v2-backlog.md`.
- Untouched: `packages/router/src/router.ts`, `backend/src/api/router.ts`
  (`/v1` handlers), `package.json` (no bump).

## Verification

- Parent: `bun test backend/src/api/router-dashboard.test.ts backend/src/server.test.ts`
  -> **42 pass / 0 fail** (slice).
- Unified suite (parent, 2026-09-03): **417 pass / 0 fail**; frontend build exit 0.
- Security review: no confirmed findings.
- Standard review HIGH (double-decode and parse): resolved prior to this doc.

## Related

Index: [`2026-09-03-router-surface.md`](./2026-09-03-router-surface.md).
Keys create: [`2026-09-03-key-create-limits.md`](./2026-09-03-key-create-limits.md).
Fusion: [`2026-09-03-router-fusion.md`](./2026-09-03-router-fusion.md).
Version: **0.2.5**.

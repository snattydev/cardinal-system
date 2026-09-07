# Live Catalog Discovery & Mandatory Model on Key Creation (2026-09-07)

Completes the operational flow for pillar 2 (Key Pool & Router): configure a real provider, discover its upstream models, and mint a `sk-cardinal-*` key scoped to a confirmed identifier (model, alias, or Fusion).

## What Was Done

- **Discovery (`packages/router/src/discover.ts`):** `GET .../models` per `wire_format` (OpenAI, Anthropic, Gemini). Provider creation (`POST /api/router/providers`) discovers models upstream via fetch and persists them with `replaceProviderModels`. If the upstream call fails or returns empty, the provider creation is rolled back (502 `model_fetch_failed`).
- **Provider PATCH & Lifecycle:** `base_url`, `wire_format`, `cost_per_mtok`, `api_key`, `status`, and `sync_models`. Re-fetches catalog if URL, wire format, API key, or `sync_models: true` changes.
- **Provider Sync & Deletion:** `POST /api/router/providers/:id/sync-models` and `DELETE /api/router/providers/:id`.
- **Catalog Endpoint (`GET /api/router/catalog`):** Authenticated via JWT session cookie. Returns `{ items: [{ id, kind }] }` where `kind` is `"model" | "alias" | "fusion"`. Filters for `active` providers only. Deduplicates model IDs across providers. Collisions between aliases and model IDs prioritize `"model"`.
- **UI `/keys` Form:** The free-text scopes input (previously defaulting to `*`) is replaced with a `CatalogSearcher` dropdown/search component. Selecting a model, alias, or Fusion target is mandatory before submission (`scopes: [selectedModel]`). Empty catalog disables submission and prompts the user to configure a provider on `/router`.

## Why

Without a live catalog endpoint, keys were minted with loose `*` scopes or manually typed strings, and provider registration required tedious manual CSV input. The searcher ensures created keys carry valid, resolvable scopes that the router can dispatch immediately.

## Decisions

- **Dedicated JWT Endpoint (`/api/router/catalog`):** Kept separate from `GET /v1/models` (which is public Bearer-token authenticated and unclassified) and avoided assembling providers and routes on the client.
- **Mandatory Single Target in Dashboard UI:** The `/keys` UI requires selecting one confirmed target. Multi-scope and wildcard `*` creation remain available via CLI and direct API calls.
- **Non-blocking Backend Key Creation:** `handleCreateKey` in the backend does not reject arbitrary scopes to maintain compatibility with existing keygen CLI workflows and automated test fixtures.

## Alternatives Considered

- **Joining `GET /api/router/providers` and `GET /api/router/routes` on client:** Rejected. Fusion routes do not expose standard hop lists and client-side classification creates UI coupling.
- **Reusing `GET /v1/models`:** Rejected. It lacks `kind` classification and requires an existing agent key rather than the user's JWT session cookie.

## Modified & Created Files

- `packages/router/src/discover.ts`
- `packages/router/src/discover.test.ts`
- `packages/router/src/index.ts`
- `packages/db/src/repos.ts`
- `packages/db/src/index.ts`
- `backend/src/api/router-dashboard.ts`
- `backend/src/api/router-dashboard.test.ts`
- `backend/src/server.ts`
- `backend/src/server.test.ts`
- `frontend/src/lib/types.ts`
- `frontend/src/pages/Keys.tsx`
- `frontend/src/pages/Router.tsx`
- `docs/features/2026-09-07-router-catalog-key-scope.md`

## Verification

- `bun test` → **457 pass / 0 fail** across 24 files.
- `bun run typecheck` → **0 errors** (backend + frontend).
- `bun run build` (frontend/) → Vite production bundle built cleanly in ~160ms.

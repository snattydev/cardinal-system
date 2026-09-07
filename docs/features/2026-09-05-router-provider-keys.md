# Register provider keys from `/router` + Keys nav under Router (2026-09-05)

Follow-up to Pillar 2's JWT dashboard. The `/router` catalog is no longer
read-only: upstream provider API keys (OpenRouter, Groq, etc.) can be loaded
without the seed CLI. Agent keys (`sk-cardinal-*`) move under the Router dropdown.

## What was done

- `POST /api/router/providers` (JWT cookie, not agent Bearer):
  body `{ name, base_url, api_key, models[], wire_format?, cost_per_mtok? }`.
  Upsert by `name`. `api_key` is encrypted with `encryptSecret` / `POOL_SECRET`
  (AES-256-GCM) and stored in `api_key_enc`. The response is
  `{ provider, models }` via `toPublicProvider`: **never** `api_key` or
  `api_key_enc`.
- UI `/router`: ADD PROVIDER KEY form (name, base url, api key password,
  models CSV, wire format, cost/mtok). After saving, the key input is cleared
  and the catalog reloads.
- Nav: **Router** dropdown -> Catalog (`/router`) + Keys (`/keys`). Agents
  returns to a direct link (Hub was the only child).
- TDD tests in `router-dashboard.test.ts` + `server.test.ts` (401 without cookie,
  200 with session, plaintext leak, rotation via upsert).

## Why

During manual testing, the dashboard displayed providers but provided no way to
paste an upstream API key. The seed CLI covered the e2e happy path, not daily
usage. Agent keys lived under Agents even though they represent router identity.

## Decisions

- JWT cookie **only**, matching the rest of the router dashboard. An agent with
  `sk-cardinal-*` must not write providers.
- Upsert by `name` (same as CLI): resubmitting the form rotates the encrypted
  key and adds models; deletion is out of scope for this slice.
- `models` is an array of non-empty strings, at least one required. UI parses CSV.
- Input `type=password` + `autoComplete=off`; plaintext only travels in the POST
  and is never rendered back.
- Agents without single-item dropdown: fewer clicks to reach the roster.

## Alternatives Considered

- **Keep using only `seed-provider` / `seed-router.ts`:** rejected. Manual testing
  demanded creation directly from the UI.
- **Create-only (409 if name exists):** rejected. Rotating an OpenRouter key is a
  standard use case; CLI was already an upsert.
- **Embed Keys directly into the `/router` page:** rejected. They represent two
  distinct resources (provider credentials vs `sk-cardinal-*`). The dropdown groups them.

## Files

- Modified: `backend/src/api/router-dashboard.ts`,
  `backend/src/api/router-dashboard.test.ts`, `backend/src/server.ts`,
  `backend/src/server.test.ts`, `frontend/src/pages/Router.tsx`,
  `frontend/src/components/Layout.tsx`, `docs/guides/router-usage.md`.
- Created: `docs/features/2026-09-05-router-provider-keys.md`.

## Verification

- `bun test` -> **423 pass / 0 fail**.
- `bun run build` (frontend/) -> exit 0.
- Security review (uncommitted): CRITICAL/HIGH/LOW none.

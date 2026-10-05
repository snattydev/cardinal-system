# Playwright E2E Expansion — Tasks & Overview

## What was done

The Playwright E2E suite was run against the local stack (Bun backend `:8787` + Vite `:5173`) and coverage was expanded beyond authentication:

- **Auth & redirects** (`frontend/e2e/auth-and-dashboard.e2e.ts`): SAO login, invalid credentials, protected routes → `/login`.
- **Tasks** (`frontend/e2e/tasks-and-overview.e2e.ts`): admin login, task creation with a unique goal, `open` badge and `by admin` on the task card.
- **Overview** (`frontend/e2e/tasks-and-overview.e2e.ts`): metric cards (`Agents Online`, `Keys Active`, `DB Size`, `Uptime`) hydrated from `/api/system`.

Shared helper: `frontend/e2e/helpers/auth.ts` (`loginAsAdmin`; credentials via `E2E_ADMIN_USER` / `E2E_ADMIN_PASSWORD` or defaults `admin` / `cardinal-dev`).

## Why

Backlog **N7** (automated UI testing) required Playwright specs that run in Cloud Agent and post-login flows (tasks + overview), not only the login screen.

## Decisions

| Decision | Alternative rejected | Rationale |
|----------|---------------------|-----------|
| Default `baseURL` `http://127.0.0.1:5173` | Keep `:8080` | Local dev uses Vite on 5173; 8080 is the Caddy/prod pod. Override with `PLAYWRIGHT_BASE_URL` for prod. |
| `loginAsAdmin` in `e2e/helpers/` | Duplicate login in each spec | DRY; env-configurable credentials for CI. |
| Asserts scoped to the task card | Global `getByText(/by admin/)` | Avoids strict-mode violations when the DB already has tasks. |
| No `webServer` in Playwright config | Auto-start backend + frontend | Cloud Agent already starts services via `.cursor/start.sh`; less coupling. |

## Files created or modified

| File | Change |
|------|--------|
| `frontend/e2e/helpers/auth.ts` | **New** — E2E login helper |
| `frontend/e2e/tasks-and-overview.e2e.ts` | **New** — Tasks + Overview specs |
| `frontend/playwright.config.ts` | Default `baseURL` → `:5173` for local dev |

## How to run

```bash
# Terminal 1: backend (.env must include POOL_SECRET)
bun run dev:backend

# Terminal 2: frontend
VITE_HOST=0.0.0.0 bun run dev:frontend

# E2E (5 tests)
bun run test:e2e

# Unit regressions
bun test
bun run build
```

Dev credentials: `admin` / `cardinal-dev` (from `.cursor/start.sh` or your `.env` hash).

Against the **production pod** (Caddy on `:8080`):

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:8080 bun run test:e2e
```

## Verification evidence

- `bun run test:e2e`: **5 passed** (3 auth + 2 tasks/overview), stable across three consecutive runs.
- `bun test`: **461 pass**, 0 fail (at time of merge).
- `bun run build`: OK.

## Cross-references

- Config: `frontend/playwright.config.ts` (`testMatch: *.e2e.ts`).
- Backlog: [`docs/superpowers/plans/2026-09-07-cardinal-v3-backlog.md`](../superpowers/plans/2026-09-07-cardinal-v3-backlog.md) (N7).
- Issue: [#18](https://github.com/snattydev/cardinal-system/issues/18) (remaining `/keys`, `/router` coverage).

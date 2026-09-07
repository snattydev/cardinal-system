# Sprint Log — Router Surface (dashboard + keys + fusion), 2026-09-03

> Three Cursor agents in parallel, Background tab of the Herdr workspace
> `cardinal-system` (`w4:t8`). Parent: Composer in Work. No commit in the
> agents. Unification and docs: parent, same day.

## Executive Summary

Closes the operational gap in pillar 2 (pool/router) left after the
20–21/08 sprint (engine + `/keys` list/revoke):

- **Dashboard `/router`** — SAO table of aliases/providers; JWT API for
  read + mutation (the UI does not mutate).
- **Key create** — `POST /api/keys` + form: tokens, scopes, expiration,
  USD cap. Enforcement in the router.
- **Fusion / MoA** — virtual model `fusion`: N proposers in parallel +
  judge `synthesize`. Sequential failover intact.

Inspiration: FreeLLMAPI (operational table, Fusion). No unified key,
public catalog, or Premium is copied.

**Version:** 0.2.4 (mailbox MCP, same working tree) → **0.2.5** this sprint.

## Timeline

| Time (approx.) | Who | What |
|---------------|-------|-----|
| 01:33 | Parent | Local router state (engine ok, UI no, MoA no) |
| 01:39 | Parent | Confirmation: router lives in `cardinal-backend` |
| 01:47 | Parent | Scope: the three features, one Cursor session each, Herdr Background |
| 01:49 | Orchestrator | Split `w4:pK` → `w4:pM` → `w4:pN`; start three workers in Background |
| ~02:27 | Three Cursor | `idle`; did not notify the parent |
| 02:27 | Parent | Pane read + unified suite **417 pass / 0 fail**, frontend build OK |
| 02:30 | Parent | Docs unification + bump 0.2.5 |

## Agents (Herdr Background `w4:t8`)

| pane | description | type | DoD |
|------|-------------|------|-----|
| `w4:pK` | Router UI | cursor | `/router` + JWT `/api/router/*` |
| `w4:pM` | Keys Factory | cursor | `POST /api/keys` + expiry/USD |
| `w4:pN` | Fusion MoA | cursor | `fusion.ts` + dispatch |

Ownership: dashboard did not touch `packages/router/src/router.ts`; keys only
pre-loop auth/budget; Fusion in `fusion.ts` + ~10 dispatch lines.

## Numbers

- Unified parent suite: **417 pass / 0 fail**, 23 files, ~4s
- Frontend `bun run build`: Vite 8.1.5, **exit 0**
- Feature docs: 3 slices + 1 index
- Version: `package.json` **0.2.5**

## Feature Docs

- [`docs/features/2026-09-03-router-surface.md`](../features/2026-09-03-router-surface.md) — index
- [`docs/features/2026-09-03-router-dashboard.md`](../features/2026-09-03-router-dashboard.md)
- [`docs/features/2026-09-03-key-create-limits.md`](../features/2026-09-03-key-create-limits.md)
- [`docs/features/2026-09-03-router-fusion.md`](../features/2026-09-03-router-fusion.md)

## State at Close

- Working tree unified, **no commit** (the human requests it).
- Frontend Vite on `:5173` (raised by `card-router-ui`); backend was already up.
- Gaps: UI `/router` read-only and blind to Fusion JSON; Fusion seed via SQL;
  USD hop-level in Fusion; backlog #5 (e2e zen), #11 (bootstrap password),
  #10 (PR `dev→main`), #13 (one-shot keys).

## Lessons

1. Three features in the same tree work if file ownership is
   explicit in the prompt. The single shared point (`router.ts` pre-loop +
   dispatch) resolved without a merge conflict.
2. Background agents did not notify the parent when going `idle`. Need to
   read `herdr agent list` / `herdr agent read` and verify in the parent.
3. Each slice ran its subset of tests; the unified suite is the source of truth.

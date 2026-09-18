# Review leftovers — PR #12 / #13 / #5 follow-ups (2026-09-18)

## Context

Pre-freeze review on `dev` (PR [#12](https://github.com/snattydev/cardinal-system/pull/12) `dev → main`, issue [#16](https://github.com/snattydev/cardinal-system/issues/16)) and carry-over notes from PR [#5](https://github.com/snattydev/cardinal-system/pull/5) and [#13](https://github.com/snattydev/cardinal-system/pull/13) left small correctness and hygiene gaps. Issue [#32](https://github.com/snattydev/cardinal-system/issues/32) tracks this cleanup on branch `fix/#32-review-leftovers` (PR to `dev`). No version bump.

## What was done

1. **USD micro rounding** — `consumeBudgetUsd` compares limits in integer micro-USD (`Math.round(n * 1e6)`) so floating-point drift cannot grant extra spend. On failure the UPDATE does not run; `budget_usd_used` stays unchanged (existing cap-at-10 test still holds).
2. **Expired keys out of active counts** — `listHumanKeys("active")` and `getSystemCounts().keysActive` require `expires_at IS NULL OR expires_at > datetime('now')` in addition to `revoked_at IS NULL` and `created_by = 'human'`. Expired human keys no longer inflate dashboard counts or the active keys list.
3. **Keys UI datetime-local validation** — `/keys` create form rejects an invalid or unparseable `datetime-local` value with an inline error and does not POST.
4. **Cookie `Secure` on TLS/production** — shared helper returns true when `NODE_ENV === "production"` or `X-Forwarded-Proto` is `https`. Login and logout set/clear the session cookie with matching `Secure` flags; `backend` logout passes the request into `handleLogout(req)`.
5. **OpenCode SDLC alignment** — OpenCode path docs match Cardinal GitHub flow: open an issue, branch, PR to `dev`, English commit bodies, `git diff --cached` before commit.
6. **Stale typecheck note** — `docs/features/2026-08-24-cloud-agent-environment.md`: typecheck passes; `maxPayloadLength` belongs on the websocket handler.
7. **MCP initialize version** — MCP `initialize` `serverInfo.version` reads root `package.json` (`../../../package.json` from `packages/mcp/src/server.ts`), not hardcoded `0.1.0`.

## Why

These items were flagged during freeze review but were out of scope for the larger README/setup PR and the `dev → main` merge. Shipping them on `dev` closes the loop before human merge of #12 without mixing N1 worker work or reopening #13.

## Decisions

- **True overshoot unchanged** — a single hop whose USD cost exceeds the entire remaining cap still revokes the key with `budget_usd_used` at 0 (no partial record-on-revoke). Only compare precision and fail-without-increment behavior were tightened.
- **Do not merge #12 or #13** in this PR; human still merges #12 when ready.
- **No N1** — `feature/#20-cardinal-worker` stays out of this branch.
- **No cooldown UX, no full Spanish sweep (#31), no root `package.json` version bump.**

## Alternatives considered

- **Record partial USD on overshoot revoke** — rejected; preserves existing revoke semantics from the 2026-09-03 key-limits slice.
- **Filter expired keys only in the API layer** — rejected; counts and list must agree at the repo SQL layer.
- **Secure cookie from `req.url` scheme alone** — rejected; reverse-proxy TLS terminates at Caddy/Quadlet; `X-Forwarded-Proto` is required behind TLS termination.

## Verification

- `bun test packages/db/src/db.test.ts` — micro-USD cap, fail-without-increment, expired keys excluded from `listHumanKeys("active")` and `getSystemCounts().keysActive`.
- `bun test packages/auth/src/auth.test.ts` — `Secure` on production and on `X-Forwarded-Proto: https`; logout clears with matching flags.
- `bun test packages/mcp/src/server.test.ts` — `initialize` `serverInfo.version` equals root `package.json` `version` (`0.2.6`).
- Manual: `/keys` with garbage datetime-local → error, no network POST.
- `bun run typecheck` — backend + frontend.

## Files created or modified

| File | Change |
|------|--------|
| `packages/db/src/repos.ts` | Micro-USD compare in `consumeBudgetUsd`; expiry filter on active human keys and `keysActive` count |
| `packages/db/src/db.test.ts` | Tests for rounding, no-increment-on-fail, expired excluded from active |
| `packages/auth/src/session.ts` | `cookieSecure(req)` helper |
| `packages/auth/src/routes.ts` | Login/logout use secure helper; `handleLogout(req)` |
| `packages/auth/src/auth.test.ts` | Secure flag cases |
| `backend/src/server.ts` | Pass `req` to `handleLogout` |
| `frontend/src/pages/Keys.tsx` | Validate `datetime-local` before POST |
| `packages/mcp/src/server.ts` | `serverInfo.version` from root `package.json` |
| `docs/features/2026-08-24-cloud-agent-environment.md` | Typecheck note no longer stale |
| `.opencode/agents/orchestrator.md` | PR to `dev`; English commit body |
| `.opencode/agents/docs.md` | English commit body |
| `.opencode/commands/feature.md` | Issue + branch + PR to `dev`; `git diff --cached` |
| `docs/features/2026-09-18-review-leftovers.md` | This file |

## Cross-references

- Prior key limits: [`2026-09-03-key-create-limits.md`](./2026-09-03-key-create-limits.md)
- PR #5 pre-merge fixes (typecheck / Secure cookie origin): [`2026-07-29-pr-5-pre-merge-fixes.md`](./2026-07-29-pr-5-pre-merge-fixes.md)
- Freeze context: PR [#12](https://github.com/snattydev/cardinal-system/pull/12), [`AGENTS/prs.md`](../../AGENTS/prs.md)

Closes [#32](https://github.com/snattydev/cardinal-system/issues/32).

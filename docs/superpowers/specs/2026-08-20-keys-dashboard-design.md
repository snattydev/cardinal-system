# Keys Dashboard — Design (list + revoke)

> Date: 2026-08-20
> Status: **implemented** (plan `2026-08-21-keys-dashboard.md`, 2026-08-21).
> Relationship: closes the UI gap from FASE 0 ("Keys → FASE 2") now that the keys backend exists.
> Out of this slice (noted, do not implement): live one-shot block and hard-delete of one-shot keys.

---

## 0. Brainstorm Decisions

| Question | Choice |
|----------|----------|
| First UI gap task | Keys (not router, not global Overview, not Hub) |
| Scope | View + revoke. Creation stays in `bun run keygen` |
| Revoke granularity | One key by `id` (not all keys of an agent) |
| Where it lives | `/keys` page (item already listed in the Agents dropdown) |
| History | Outside the live list: minimal control with **log icon** |
| One-shot on this screen | **Not built now.** Agreed layout: compact block **bottom left**. When done: hard-delete + trace in the one-shot log |

---

## 1. Problem

The backend has `agent_keys` (FASE 0 + factory: scopes, budget, revoke). The CLI
`bun run keygen` lists / creates / revokes. The dashboard does not: the Keys item is
disabled with badge "FASE 2", Settings says "coming in FASE 2", and Overview
shows "Keys Active" with nowhere to go.

Key creation stays in the CLI (plaintext printed once). This spec does not
add create in the UI.

---

## 2. Scope of This Slice

**In scope:**

- `/keys` page (enable the NavLink in the Agents dropdown).
- `GET /api/keys` and `GET /api/keys?status=revoked` (JWT).
- `POST /api/keys/:id/revoke` (JWT) — one row, not all keys of an agent.
- Main list: **active** persistent agent keys (`created_by=human`).
- History: **very small** control (log icon) that reveals revoked human keys.
  Does not coexist in the same list as live keys.
- Overview "Keys Active" links to `/keys` and counts only active persistent keys.
- Settings: remove the placeholder "API KEYS MANAGEMENT coming in FASE 2";
  link to `/keys`.

**Not in scope (noted — future architecture):**

See section 6.

---

## 3. Persistent vs One-Shot

Existing marker: `agent_keys.created_by`.

| | Persistent (`human`) | One-shot (`system`) |
|--|----------------------|---------------------|
| Where shown (this slice) | Main list if active; history (log icon) if revoked | Not listed |
| Revoke | Human, explicit, by `id` | Auto / pipeline (no UI now) |
| When done | `revoked_at` — stays in history | **Hard delete** of the row (future). No history in `/keys`. Trace lives in the **one-shot log** |

FASE 0 rule intact: `human` keys are never touched automatically. Revoking from the
dashboard **is** an explicit human action.

---

## 4. API

Auth: JWT cookie, same as `/api/system`. Never agent Bearer.

The JSON **does not include** `key_hash` or plaintext.

### `GET /api/keys`

Default `status=active`.

Query:

- `status=active` (default) → `revoked_at IS NULL AND created_by='human'`
- `status=revoked` → `revoked_at IS NOT NULL AND created_by='human'`
- other value → 400

Item (camelCase, dashboard wire):

```
id, agentName, createdBy, scopes[],
budgetLimit, budgetUsed, createdAt, lastUsedAt, revokedAt
```

`scopes` already parsed (array). `budgetLimit` / `revokedAt` / `lastUsedAt` can be `null`.

Order: `id` descending (most recent first).

### `POST /api/keys/:id/revoke`

Sets `revoked_at = datetime('now')` on **that** row (`revokeKeyById`).

| Code | When |
|--------|--------|
| 200 | Row updated; body = the revoked item |
| 401 | No session |
| 404 | id does not exist |
| 409 | Already revoked |
| 400 | id is not numeric |

No HTTP DELETE. The CLI `keygen --revoke <agent>` (all active keys for a
name) **does not change**.

Mandatory TDD (`packages/db` + `backend/src/api/keys`).

---

## 5. UI

Route `/keys`, current layout (SAO sidebar).

**Main area — live persistent keys.**
Table or row stack at useful width: agent, scopes, budget
(`used / limit` or `used / ∞`), created, last used, Revoke button.
Short confirmation before revoking (no heavy modal). Empty state: copy pointing to
`bun run keygen -- --agent <name>` (creation stays in CLI).

**History — minimal component.**
Not a second always-visible table. A small control (log icon + short
label or icon-only) opens/closes the list of revoked human keys. No revoke. If
there are none, the control may still exist (empty history).

**Sidebar.**
The disabled span "Keys / FASE 2" becomes `NavLink to="/keys"`.

**Overview.**
Card "Keys Active" is a link to `/keys`. The number is active persistent keys, not
one-shot — `getSystemCounts().keysActive` must be adjusted (currently counts all
non-revoked).

**Settings.**
Replace the "coming in FASE 2" paragraph under API KEYS MANAGEMENT with a link to
`/keys`. The MODEL ROUTER placeholder is left (another slice).

Frontend: `bun run build` (no component TDD).

---

## 6. Out of Scope — Architecture Decisions (do not implement now)

Noted 2026-08-20 to avoid reopening the debate when one-shots exist.

### 6.1 Live One-Shot Block in `/keys`

When `created_by=system` keys are **active**, they do not go in the main list.
They go in a **separate, compact component, bottom left** of `/keys`:
title like `one-shot · N`, one line/chip per key (name + remaining budget),
revoke possible but the block does not reserve the persistent layout. If
N=0, the block takes no space.

This slice **does not** render that block. `GET /api/keys` also does not return system
keys yet; it will be added when the component exists.

### 6.2 One-Shot Key Lifecycle

Today the router **auto-revokes** when `budget_limit` is exhausted (leaves a row with
`revoked_at`). That works for persistent keys and for e2e.

When the one-shot pipeline exists:

1. When the agent finishes (done / budget / timeout) → **delete** the row from
   `agent_keys` (hard delete), do not revoke.
2. Does not enter the `/keys` history.
3. The concrete trace (key id, tokens, cause of death) lives in the **log of that
   one-shot** — its own architecture piece, not this dashboard.

Until that exists, a `system` key revoked by budget may remain in DB; the UI
of this slice ignores it (`created_by='human'` in both GETs).

---

## 7. Security

- JWT admin only.
- Never `key_hash` or `sk-cardinal-*` in responses or in the DOM.
- Revoke is an explicit human action; no `human` keys are touched in the background.
- Pre-push audit: zero `sk-cardinal-` in frontend.

---

## 8. Planned Files (implementation)

| Area | Files |
|------|----------|
| DB | `packages/db/src/repos.ts` (`revokeKeyById`; `keysActive` human-only) + `db.test.ts` |
| API | `backend/src/api/keys.ts` + `keys.test.ts`; registered in `server.ts` |
| UI | `frontend/src/pages/Keys.tsx`, `App.tsx`, `Layout.tsx`; link in `Overview.tsx` and `Settings.tsx` |

---

## 9. Verification

- `bun test` — cases: list active/revoked filters human; revoke 200/404/409;
  list response without `key_hash`; 401 without cookie.
- `bun run build` — frontend typecheck + Vite.
- Smoke: sidebar Keys opens `/keys`; revoke a test key; log icon shows
  history; Overview card navigates.

---

*Slice design. The one-shot block and hard-delete live in a future spec once the one-shot pipeline exists.*

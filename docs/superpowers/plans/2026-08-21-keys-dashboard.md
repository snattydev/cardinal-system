# Keys Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable dashboard page `/keys` so the human can list and revoke persistent (`created_by=human`) agent keys, with revoked keys behind a tiny log-icon history control.

**Architecture:** Repos in `packages/db` filter human keys and revoke by `id`. JWT-only REST in `backend/src/api/keys.ts` maps `AgentKeyRow` (snake_case, includes `key_hash`) to camelCase `KeyItem` (never `key_hash`). Frontend page `/keys` consumes that JSON 1:1. `getSystemCounts().keysActive` / `keysRevoked` count only human keys so Overview/Settings match the page.

**Tech Stack:** TypeScript, Bun (`bun:sqlite`, `bun test`), React + Vite + Tailwind v4, react-router-dom v6. No new dependencies.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-20-keys-dashboard-design.md` — follow it. Do not implement §6 (one-shot live block, hard-delete).
- TDD mandatory for db + keys API (`packages/db`, `backend/src/api/keys`). Frontend: `bun run build` only (no component tests).
- JWT cookie session only, same as `/api/system`. Never accept agent Bearer on these routes.
- JSON wire **never** includes `key_hash` or `sk-cardinal-*`. Audit before claiming done.
- Create stays in `bun run keygen`. No POST-to-create. No DELETE HTTP. CLI `keygen --revoke <agent>` (all active keys of a name) does not change.
- `listKeys` (all rows, including system + `key_hash`) stays for the CLI. Dashboard uses `listHumanKeys`.
- Envelope: `GET` → `{ keys: KeyItem[] }`; `POST .../revoke` → `{ key: KeyItem }`. Errors: `{ error: string }` with the codes below.
- `getSystemCounts` counts **human only** for both `keysActive` and `keysRevoked` (Settings `AGENT KEYS` must not mix system auto-revokes).
- Commits: Conventional Commits, English subject ≤72 chars, English body. Do not commit unless the user asked to execute this plan (this file still lists commit steps for the executor).
- Version: bump PATCH `0.2.1` → `0.2.2` only in the docs task, after tests+build pass.
- Swarm (when executing via subagents): tester RED (tasks 1–3) → builder GREEN → frontend (task 4) → verifier (`bun test` + `bun run build`) → reviewer ∥ security-reviewer → docs (task 5).

---

## File map

| Path | Role |
|------|------|
| `packages/db/src/repos.ts` | `listHumanKeys`, `getKeyById`, `revokeKeyById`; human-only counts |
| `packages/db/src/index.ts` | Re-export the three new functions |
| `packages/db/src/db.test.ts` | RED/GREEN for repo + counts |
| `backend/src/api/keys.ts` | `KeyItem`, `toKeyItem`, `handleListKeys`, `handleRevokeKey` |
| `backend/src/api/keys.test.ts` | Handler unit tests (no JWT) |
| `backend/src/server.ts` | Register `GET /api/keys` and `POST /api/keys/:id/revoke` |
| `backend/src/server.test.ts` | 401 without cookie |
| `frontend/src/lib/types.ts` | `KeyItem` 1:1 with JSON |
| `frontend/src/pages/Keys.tsx` | Page: live list + revoke confirm + log-icon history |
| `frontend/src/App.tsx` | Route `/keys` |
| `frontend/src/components/Layout.tsx` | Enable Keys NavLink |
| `frontend/src/pages/Overview.tsx` | Keys Active → link |
| `frontend/src/pages/Settings.tsx` | Replace “coming in Fase 2” with link |
| `docs/features/2026-08-21-keys-dashboard.md` | Feature doc |
| `package.json` | PATCH bump |
| `docs/superpowers/plans/2026-08-17-cardinal-v2-backlog.md` | Mark item 12 done |
| `docs/superpowers/specs/2026-08-20-keys-dashboard-design.md` | Status → implemented |

**Do not touch:** `packages/keys/src/cli.ts`, one-shot pipeline, MODEL ROUTER placeholder, `listKeys` / `revokeKeysForAgent` signatures.

---

## Contrato (nombres y firmas EXACTAS)

### Repo (`packages/db/src/repos.ts`)

```ts
export function listHumanKeys(db: Database, status: "active" | "revoked"): AgentKeyRow[]
export function getKeyById(db: Database, id: number): AgentKeyRow | null
export function revokeKeyById(db: Database, id: number): AgentKeyRow | null
```

- `listHumanKeys`: `created_by = 'human'` + `revoked_at IS NULL` (active) or `IS NOT NULL` (revoked). `ORDER BY id DESC`. Still returns full `AgentKeyRow` (includes `key_hash`) — stripping is the API’s job.
- `getKeyById`: any row by numeric `id`, or `null`.
- `revokeKeyById`: if missing or already revoked → `null`. Else set `revoked_at = datetime('now')` on **that** `id` only and return the updated row. Does **not** filter `created_by`; the handler 404s system keys.

### Wire `KeyItem`

```ts
export interface KeyItem {
  id: number;
  agentName: string;
  createdBy: string;
  scopes: string[];
  budgetLimit: number | null;
  budgetUsed: number;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}
```

Defined in `backend/src/api/keys.ts` **and** duplicated in `frontend/src/lib/types.ts` (frontend does not import `@cardinal/core`). Fields must match 1:1.

### HTTP

| Request | Success | Errors |
|---------|---------|--------|
| `GET /api/keys` (`status` omitted = `active`) | 200 `{ keys: KeyItem[] }` | 401 `unauthorized`; 400 `invalid_status` |
| `GET /api/keys?status=revoked` | 200 `{ keys: KeyItem[] }` | same |
| `POST /api/keys/:id/revoke` | 200 `{ key: KeyItem }` (revoked) | 401 `unauthorized`; 400 `invalid_id`; 404 `not_found`; 409 `already_revoked` |

`status` other than `active`/`revoked` → 400. `:id` not matching `/^\d+$/` → 400. Missing id **or** `created_by !== "human"` → 404 (system keys are invisible to this API). Already revoked human → 409.

---

### Task 1: DB — list human keys, get by id, revoke by id, counts

**Files:**
- Modify: `packages/db/src/repos.ts` (after `listKeys`, around line 373; `getSystemCounts` around 517–531)
- Modify: `packages/db/src/index.ts` (exports)
- Test: `packages/db/src/db.test.ts`

**Interfaces:**
- Consumes: `createAgentKey`, `AgentKeyRow`, existing `listKeys` (unchanged)
- Produces: `listHumanKeys`, `getKeyById`, `revokeKeyById`; `getSystemCounts` human-only

- [ ] **Step 1: Write the failing tests**

In `packages/db/src/db.test.ts`:

1. Add `getKeyById`, `listHumanKeys`, `revokeKeyById` to the import from `"./repos"`.
2. Append these tests **inside** `describe("keys repo", …)` (after the existing scopes/budget test):

```ts
  test("listHumanKeys returns only human keys, newest id first, filtered by status", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    registerAgent(db, "kirito", "agent");
    createAgentKey(db, { keyHash: "h-old", agentName: "shinon" });
    createAgentKey(db, { keyHash: "h-new", agentName: "kirito" });
    createAgentKey(db, { keyHash: "sys", agentName: "shinon", createdBy: "system" });
    const older = findActiveKeyByHash(db, "h-old")!;
    revokeKeyById(db, older.id);

    const active = listHumanKeys(db, "active");
    expect(active.map((k) => k.key_hash)).toEqual(["h-new"]);
    expect(active.every((k) => k.created_by === "human")).toBe(true);

    const revoked = listHumanKeys(db, "revoked");
    expect(revoked.map((k) => k.key_hash)).toEqual(["h-old"]);
    expect(revoked[0]!.revoked_at).not.toBeNull();

    expect(listKeys(db)).toHaveLength(3);
    db.close();
  });

  test("getKeyById returns the row or null", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "h-1", agentName: "shinon" });
    const id = findActiveKeyByHash(db, "h-1")!.id;
    expect(getKeyById(db, id)?.key_hash).toBe("h-1");
    expect(getKeyById(db, 99999)).toBeNull();
    db.close();
  });

  test("revokeKeyById revokes one row and leaves sibling keys of the same agent active", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "keep", agentName: "shinon" });
    createAgentKey(db, { keyHash: "drop", agentName: "shinon" });
    const dropId = findActiveKeyByHash(db, "drop")!.id;
    const keepId = findActiveKeyByHash(db, "keep")!.id;

    const revoked = revokeKeyById(db, dropId);
    expect(revoked).not.toBeNull();
    expect(revoked!.id).toBe(dropId);
    expect(revoked!.revoked_at).not.toBeNull();
    expect(findActiveKeyByHash(db, "drop")).toBeNull();
    expect(findActiveKeyByHash(db, "keep")!.id).toBe(keepId);

    expect(revokeKeyById(db, dropId)).toBeNull();
    expect(revokeKeyById(db, 99999)).toBeNull();
    db.close();
  });
```

3. In `describe("getSystemCounts", …)` add:

```ts
  test("keysActive and keysRevoked count only created_by=human", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "human-live", agentName: "shinon" });
    createAgentKey(db, { keyHash: "human-dead", agentName: "shinon" });
    createAgentKey(db, { keyHash: "sys-live", agentName: "shinon", createdBy: "system" });
    createAgentKey(db, { keyHash: "sys-dead", agentName: "shinon", createdBy: "system" });
    revokeKeyById(db, findActiveKeyByHash(db, "human-dead")!.id);
    revokeKeyById(db, findActiveKeyByHash(db, "sys-dead")!.id);

    expect(getSystemCounts(db)).toEqual({
      agentsTotal: 1,
      agentsOnline: 0,
      keysActive: 1,
      keysRevoked: 1,
    });
    db.close();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test packages/db/src/db.test.ts
```

Expected: FAIL — `listHumanKeys` / `getKeyById` / `revokeKeyById` are not defined (or counts still include system keys).

- [ ] **Step 3: Minimal implementation**

In `packages/db/src/repos.ts`, **after** `listKeys`:

```ts
export function listHumanKeys(db: Database, status: "active" | "revoked"): AgentKeyRow[] {
  const revokedClause = status === "active" ? "revoked_at IS NULL" : "revoked_at IS NOT NULL";
  return db
    .query(
      `SELECT * FROM agent_keys
       WHERE created_by = 'human' AND ${revokedClause}
       ORDER BY id DESC`,
    )
    .all() as AgentKeyRow[];
}

export function getKeyById(db: Database, id: number): AgentKeyRow | null {
  return (db.query("SELECT * FROM agent_keys WHERE id = ?").get(id) as AgentKeyRow | null) ?? null;
}

export function revokeKeyById(db: Database, id: number): AgentKeyRow | null {
  const existing = getKeyById(db, id);
  if (existing === null || existing.revoked_at !== null) return null;
  db.run("UPDATE agent_keys SET revoked_at = datetime('now') WHERE id = ?", [id]);
  return getKeyById(db, id);
}
```

In `getSystemCounts`, replace the two key count queries:

```ts
    keysActive: count(
      "SELECT COUNT(*) AS count FROM agent_keys WHERE revoked_at IS NULL AND created_by = 'human'",
    ),
    keysRevoked: count(
      "SELECT COUNT(*) AS count FROM agent_keys WHERE revoked_at IS NOT NULL AND created_by = 'human'",
    ),
```

In `packages/db/src/index.ts`, add to the value export list (next to `listKeys`):

```ts
  getKeyById,
  listHumanKeys,
  revokeKeyById,
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test packages/db/src/db.test.ts
```

Expected: PASS (including the pre-existing keys/counts tests).

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/repos.ts packages/db/src/index.ts packages/db/src/db.test.ts
git commit -m "$(cat <<'EOF'
feat(db): list and revoke human keys by id

Repos para el dashboard /keys: listHumanKeys filtra persistentes,
revokeKeyById toca una sola fila, y Overview cuenta solo human.
EOF
)"
```

---

### Task 2: API handlers — list + revoke, no hashes on the wire

**Files:**
- Create: `backend/src/api/keys.ts`
- Create: `backend/src/api/keys.test.ts`

**Interfaces:**
- Consumes: `listHumanKeys`, `getKeyById`, `revokeKeyById`, `toKeyItem` contract above
- Produces: `handleListKeys(db, req)`, `handleRevokeKey(db, idRaw)`, exported `KeyItem` / `toKeyItem`

- [ ] **Step 1: Write the failing tests**

Create `backend/src/api/keys.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { createAgentKey, createDb, findActiveKeyByHash, registerAgent } from "@cardinal/db";
import { handleListKeys, handleRevokeKey } from "./keys";

function getReq(url: string): Request {
  return new Request(url);
}

describe("handleListKeys", () => {
  test("empty db → {keys: []}", async () => {
    const db = createDb(":memory:");
    const res = handleListKeys(db, getReq("http://localhost/api/keys"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ keys: [] });
    db.close();
  });

[Showing lines 1-300 of 1003. Use :301 to continue]
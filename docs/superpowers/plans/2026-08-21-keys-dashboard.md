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
- Commits: Conventional Commits, subject English ≤72 chars, body Spanish. Do not commit unless the user asked to execute this plan (this file still lists commit steps for the executor).
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

  test("default lists human active newest-first and omits key_hash and system keys", async () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "hash-old", agentName: "shinon", scopes: ["fast"], budgetLimit: 1000 });
    createAgentKey(db, { keyHash: "hash-new", agentName: "shinon" });
    createAgentKey(db, { keyHash: "hash-sys", agentName: "shinon", createdBy: "system" });
    const res = handleListKeys(db, getReq("http://localhost/api/keys"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { keys: Array<Record<string, unknown>> };
    expect(body.keys).toHaveLength(2);
    expect(body.keys[0]!.agentName).toBe("shinon");
    expect(body.keys[0]!.createdBy).toBe("human");
    expect(body.keys[0]!.scopes).toEqual(["*"]);
    expect(body.keys[1]!.scopes).toEqual(["fast"]);
    expect(body.keys[1]!.budgetLimit).toBe(1000);
    expect(body.keys[1]!.budgetUsed).toBe(0);
    expect(body.keys.every((k) => !("key_hash" in k) && !("keyHash" in k))).toBe(true);
    expect(JSON.stringify(body).includes("hash-")).toBe(false);
    db.close();
  });

  test("?status=revoked lists only revoked human keys", async () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "live", agentName: "shinon" });
    createAgentKey(db, { keyHash: "dead", agentName: "shinon" });
    const deadId = findActiveKeyByHash(db, "dead")!.id;
    const revokeRes = handleRevokeKey(db, String(deadId));
    expect(revokeRes.status).toBe(200);

    const res = handleListKeys(db, getReq("http://localhost/api/keys?status=revoked"));
    const body = (await res.json()) as { keys: Array<{ id: number; revokedAt: string | null }> };
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0]!.id).toBe(deadId);
    expect(body.keys[0]!.revokedAt).not.toBeNull();
    db.close();
  });

  test("?status=garbage → 400 invalid_status", async () => {
    const db = createDb(":memory:");
    const res = handleListKeys(db, getReq("http://localhost/api/keys?status=garbage"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_status" });
    db.close();
  });
});

describe("handleRevokeKey", () => {
  test("revokes one human key → 200 {key} with revokedAt set", async () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "keep", agentName: "shinon" });
    createAgentKey(db, { keyHash: "drop", agentName: "shinon" });
    const dropId = findActiveKeyByHash(db, "drop")!.id;

    const res = handleRevokeKey(db, String(dropId));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { key: Record<string, unknown> };
    expect(body.key.id).toBe(dropId);
    expect(body.key.revokedAt).not.toBeNull();
    expect("key_hash" in body.key).toBe(false);
    expect(findActiveKeyByHash(db, "drop")).toBeNull();
    expect(findActiveKeyByHash(db, "keep")).not.toBeNull();
    db.close();
  });

  test("unknown id → 404 not_found", async () => {
    const db = createDb(":memory:");
    const res = handleRevokeKey(db, "99999");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    db.close();
  });

  test("system key id → 404 and row stays active", async () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "sys", agentName: "shinon", createdBy: "system" });
    const id = findActiveKeyByHash(db, "sys")!.id;
    const res = handleRevokeKey(db, String(id));
    expect(res.status).toBe(404);
    expect(findActiveKeyByHash(db, "sys")).not.toBeNull();
    db.close();
  });

  test("already revoked → 409 already_revoked", async () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "once", agentName: "shinon" });
    const id = findActiveKeyByHash(db, "once")!.id;
    expect(handleRevokeKey(db, String(id)).status).toBe(200);
    const res = handleRevokeKey(db, String(id));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "already_revoked" });
    db.close();
  });

  test("non-numeric id → 400 invalid_id", async () => {
    const db = createDb(":memory:");
    const res = handleRevokeKey(db, "abc");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_id" });
    db.close();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test backend/src/api/keys.test.ts
```

Expected: FAIL — `./keys` does not exist.

- [ ] **Step 3: Minimal implementation**

Create `backend/src/api/keys.ts`:

```ts
import type { Database } from "bun:sqlite";
import type { AgentKeyRow } from "@cardinal/core";
import { json } from "@cardinal/core";
import { getKeyById, listHumanKeys, revokeKeyById } from "@cardinal/db";

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

export function toKeyItem(row: AgentKeyRow): KeyItem {
  let scopes: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.scopes);
    if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) {
      scopes = parsed;
    }
  } catch {
    scopes = [];
  }
  return {
    id: row.id,
    agentName: row.agent_name,
    createdBy: row.created_by,
    scopes,
    budgetLimit: row.budget_limit,
    budgetUsed: row.budget_used,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

export function handleListKeys(db: Database, req: Request): Response {
  const statusParam = new URL(req.url).searchParams.get("status") ?? "active";
  if (statusParam !== "active" && statusParam !== "revoked") {
    return json({ error: "invalid_status" }, 400);
  }
  return json({ keys: listHumanKeys(db, statusParam).map(toKeyItem) });
}

export function handleRevokeKey(db: Database, idRaw: string): Response {
  if (!/^\d+$/.test(idRaw)) return json({ error: "invalid_id" }, 400);
  const id = Number(idRaw);
  const existing = getKeyById(db, id);
  if (existing === null || existing.created_by !== "human") {
    return json({ error: "not_found" }, 404);
  }
  if (existing.revoked_at !== null) {
    return json({ error: "already_revoked" }, 409);
  }
  const row = revokeKeyById(db, id);
  if (row === null) return json({ error: "not_found" }, 404);
  return json({ key: toKeyItem(row) });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test backend/src/api/keys.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/keys.ts backend/src/api/keys.test.ts
git commit -m "$(cat <<'EOF'
feat(api): add JWT keys list and revoke-by-id handlers

GET /api/keys y POST /api/keys/:id/revoke. El wire es camelCase
y nunca incluye key_hash; las keys system son 404.
EOF
)"
```

---

### Task 3: Wire routes + 401 without session cookie

**Files:**
- Modify: `backend/src/server.ts`
- Modify: `backend/src/server.test.ts`

**Interfaces:**
- Consumes: `handleListKeys`, `handleRevokeKey`
- Produces: `GET /api/keys` and `POST /api/keys/:id/revoke` behind `getSessionUser`

- [ ] **Step 1: Write the failing integration test**

Append to `backend/src/server.test.ts` (uses existing `login()` helper and `port`):

```ts
test("GET /api/keys and POST /api/keys/:id/revoke require a session cookie", async () => {
  const anonGet = await fetch(`http://localhost:${port}/api/keys`);
  expect(anonGet.status).toBe(401);
  expect(await anonGet.json()).toEqual({ error: "unauthorized" });

  const anonPost = await fetch(`http://localhost:${port}/api/keys/1/revoke`, { method: "POST" });
  expect(anonPost.status).toBe(401);

  const cookie = await login();
  const res = await fetch(`http://localhost:${port}/api/keys`, { headers: { cookie } });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { keys: unknown[] };
  expect(Array.isArray(body.keys)).toBe(true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun test backend/src/server.test.ts
```

Expected: FAIL — anonymous GET `/api/keys` is 404 `not_found` (catch-all `pathname.startsWith("/api/")`), not 401.

- [ ] **Step 3: Register routes**

In `backend/src/server.ts`:

1. Import next to `handleSystem`:

```ts
import { handleListKeys, handleRevokeKey } from "./api/keys";
```

2. Insert **after** the `/api/system` block and **before** `soulMatch`:

```ts
      if (pathname === "/api/keys" && method === "GET") {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        return handleListKeys(db, req);
      }

      const keyRevokeMatch = pathname.match(/^\/api\/keys\/([^/]+)\/revoke$/);
      if (keyRevokeMatch && method === "POST") {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        return handleRevokeKey(db, decodeURIComponent(keyRevokeMatch[1]!));
      }
```

Do not add a DELETE route. Do not accept `Authorization: Bearer`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test backend/src/server.test.ts backend/src/api/keys.test.ts packages/db/src/db.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/server.ts backend/src/server.test.ts
git commit -m "$(cat <<'EOF'
feat(api): expose /api/keys behind JWT session cookie

Listar y revocar keys persistentes exige la cookie de dashboard,
igual que /api/system. Sin sesión es 401.
EOF
)"
```

---

### Task 4: Frontend — page `/keys`, nav, Overview, Settings

**Files:**
- Create: `frontend/src/pages/Keys.tsx`
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Layout.tsx`
- Modify: `frontend/src/pages/Overview.tsx`
- Modify: `frontend/src/pages/Settings.tsx`

**Interfaces:**
- Consumes: `{ keys: KeyItem[] }` and `{ key: KeyItem }` from Task 2
- Produces: working `/keys` UI; no `key_hash` / `sk-cardinal-` in source

No component tests. Verification is `bun run build`.

- [ ] **Step 1: Add `KeyItem` to frontend types**

In `frontend/src/lib/types.ts`, after `SystemInfo`:

```ts
/** Raw shape from GET /api/keys and POST /api/keys/:id/revoke */
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

- [ ] **Step 2: Create `frontend/src/pages/Keys.tsx`**

Match existing SAO pages (`Agents.tsx`, `AgentDetail.tsx`): `font-mono`, `text-sao-accent`, `border-sao-accent/20`, `bg-sao-panel/60`. No icon library.

Behavior:
- On mount, `GET /api/keys` (active). Empty copy points to `bun run keygen -- --agent <name>` (same phrasing as Agent Hub).
- Rows: agent, scopes (comma-joined), budget `used / limit` or `used / ∞`, created, last used (`never` if null), Revoke.
- Revoke is **inline confirm**, not a modal: first click sets `pendingId`; second (“sí”) `POST /api/keys/${id}/revoke`; “no” clears. On 200, drop the row from the live list; if history is open, prepend the returned `key`.
- History: tiny button (log SVG + `aria-label="pasadas"` / `title="pasadas"`) in the header. Always visible even if history is empty. Toggle reveals revoked list **below** the live list. Lazy-fetch `GET /api/keys?status=revoked` on first open. History rows have **no** revoke button.
- Leave space conceptually for a future one-shot block bottom-left — **do not render it**.

```tsx
import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { KeyItem } from "../lib/types";

function fmtBudget(used: number, limit: number | null): string {
  return limit === null ? `${used} / ∞` : `${used} / ${limit}`;
}

function fmtWhen(value: string | null): string {
  return value ?? "never";
}

export default function Keys() {
  const [keys, setKeys] = useState<KeyItem[]>([]);
  const [history, setHistory] = useState<KeyItem[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ keys: KeyItem[] }>("/api/keys")
      .then((res) => {
        if (!cancelled) setKeys(res.keys);
      })
      .catch(() => {
        if (!cancelled) setError("failed to load keys");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadHistory(): Promise<void> {
    const res = await api<{ keys: KeyItem[] }>("/api/keys?status=revoked");
    setHistory(res.keys);
  }

  async function toggleHistory(): Promise<void> {
    const next = !showHistory;
    setShowHistory(next);
    if (next && history === null) {
      try {
        await loadHistory();
      } catch {
        setError("failed to load history");
      }
    }
  }

  async function confirmRevoke(id: number): Promise<void> {
    try {
      const res = await api<{ key: KeyItem }>(`/api/keys/${id}/revoke`, { method: "POST" });
      setKeys((prev) => prev.filter((k) => k.id !== id));
      setHistory((prev) => (prev === null ? prev : [res.key, ...prev]));
      setPendingId(null);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "revoke failed";
      setError(message);
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg tracking-widest text-sao-accent">KEYS</h1>
        <button
          type="button"
          onClick={() => void toggleHistory()}
          aria-label="pasadas"
          title="pasadas"
          className={`rounded border p-1.5 text-slate-500 transition-colors hover:border-sao-accent/40 hover:text-sao-accent ${
            showHistory ? "border-sao-accent/60 text-sao-accent" : "border-transparent"
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="3" y="2" width="10" height="12" rx="1" stroke="currentColor" strokeWidth="1.25" />
            <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" stroke="currentColor" strokeWidth="1.25" />
          </svg>
        </button>
      </div>

      {error && <p className="font-mono text-sm text-red-400">{error}</p>}

      {keys.length === 0 ? (
        <p className="rounded-lg border border-sao-accent/20 bg-sao-panel/60 p-6 font-mono text-sm text-slate-500">
          no persistent keys — create one with{" "}
          <span className="text-sao-accent">bun run keygen -- --agent &lt;name&gt;</span>
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-sao-accent/10 rounded-lg border border-sao-accent/20 bg-sao-panel/60">
          {keys.map((key) => (
            <div key={key.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 font-mono text-sm">
              <span className="text-sao-accent">{key.agentName}</span>
              <span className="text-slate-400">{key.scopes.join(", ")}</span>
              <span className="text-slate-400">{fmtBudget(key.budgetUsed, key.budgetLimit)}</span>
              <span className="text-slate-500">created {fmtWhen(key.createdAt)}</span>
              <span className="text-slate-500">last used {fmtWhen(key.lastUsedAt)}</span>
              <span className="ml-auto">
                {pendingId === key.id ? (
                  <span className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void confirmRevoke(key.id)}
                      className="text-red-400 hover:text-red-300"
                    >
                      sí
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingId(null)}
                      className="text-slate-500 hover:text-sao-accent"
                    >
                      no
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPendingId(key.id)}
                    className="text-sao-violet hover:text-sao-accent"
                  >
                    revocar
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {showHistory && (
        <section className="flex flex-col gap-2">
          <h2 className="font-mono text-xs tracking-widest text-slate-500">PASADAS</h2>
          {history === null ? (
            <p className="font-mono text-sm text-slate-600">loading…</p>
          ) : history.length === 0 ? (
            <p className="font-mono text-sm text-slate-600">no revoked keys</p>
          ) : (
            <div className="flex flex-col divide-y divide-sao-accent/10 rounded-lg border border-sao-accent/20 bg-sao-panel/40">
              {history.map((key) => (
                <div key={key.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 font-mono text-sm text-slate-500">
                  <span>{key.agentName}</span>
                  <span>{key.scopes.join(", ")}</span>
                  <span>{fmtBudget(key.budgetUsed, key.budgetLimit)}</span>
                  <span>revoked {fmtWhen(key.revokedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Route, nav, Overview link, Settings link**

`frontend/src/App.tsx` — import `Keys` and add the route next to the other Layout children:

```tsx
import Keys from "./pages/Keys";
```

```tsx
            <Route path="/keys" element={<Keys />} />
```

(Keep it under `<Route element={<Layout />}>` so it stays behind `ProtectedRoute`.)

`frontend/src/components/Layout.tsx` — replace the disabled Keys span with a NavLink. Initialize the Agents dropdown open when the path is `/keys` or `/agents`:

```tsx
  const [agentsOpen, setAgentsOpen] = useState(
    () => location.pathname.startsWith("/agents") || location.pathname.startsWith("/keys"),
  );
```

Replace:

```tsx
                <span className="flex items-center justify-between rounded border border-transparent px-3 py-2 font-mono text-sm text-slate-600 select-none">
                  Keys
                  <span className="text-xs text-slate-600">Fase 2</span>
                </span>
```

with:

```tsx
                <NavLink to="/keys" className={linkClass}>
                  Keys
                </NavLink>
```

`frontend/src/pages/Overview.tsx` — import `Link` from `react-router-dom`. Change `StatCard` to take optional `to` and wrap in `Link` when present. Pass `to="/keys"` on Keys Active:

```tsx
import { Link } from "react-router-dom";
```

```tsx
        <StatCard label="Keys Active" value={String(info.keys_active)} to="/keys" />
```

```tsx
function StatCard({ label, value, to }: { label: string; value: string; to?: string }) {
  const card = (
    <div
      className={`flex flex-col gap-2 rounded-lg border bg-sao-panel/60 p-5 ${
        to
          ? "border-sao-accent/20 transition-colors hover:border-sao-accent/50"
          : "border-sao-accent/20"
      }`}
    >
      <span className="font-mono text-xs text-slate-500">{label}</span>
      <span className="font-mono text-2xl text-sao-accent">{value}</span>
    </div>
  );
  if (!to) return card;
  return (
    <Link to={to} className="block">
      {card}
    </Link>
  );
}
```

`frontend/src/pages/Settings.tsx` — import `Link`. Replace the API KEYS MANAGEMENT placeholder only (leave MODEL ROUTER):

```tsx
import { Link } from "react-router-dom";
```

```tsx
      <Section title="API KEYS MANAGEMENT">
        <Link
          to="/keys"
          className="font-mono text-xs text-sao-accent transition-colors hover:text-white"
        >
          manage keys →
        </Link>
      </Section>
```

- [ ] **Step 4: Build**

```bash
bun run build
```

Expected: Vite build succeeds (typecheck included). Fail the task if `KeyItem` fields drift from the API.

Grep the frontend for leaks:

```bash
rg -n "sk-cardinal-|key_hash|keyHash" frontend/src
```

Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Keys.tsx frontend/src/lib/types.ts frontend/src/App.tsx \
  frontend/src/components/Layout.tsx frontend/src/pages/Overview.tsx frontend/src/pages/Settings.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add /keys page to list and revoke persistent keys

Habilita el ítem Keys del sidebar, historial detrás de un icono
de log, y enlaza Overview/Settings. Crear sigue en la CLI.
EOF
)"
```

---

### Task 5: Feature doc, version bump, spec/backlog status

**Files:**
- Create: `docs/features/2026-08-21-keys-dashboard.md`
- Modify: `package.json` (`version`: `0.2.1` → `0.2.2`)
- Modify: `docs/superpowers/specs/2026-08-20-keys-dashboard-design.md` (header estado)
- Modify: `docs/superpowers/plans/2026-08-17-cardinal-v2-backlog.md` (item 12)

**Interfaces:**
- Consumes: verified `bun test` + `bun run build` from prior tasks
- Produces: feature doc with qué / por qué / decisiones / alternativas / archivos

Only run this task **after** verifier evidence. Do not bump version if tests/build failed.

- [ ] **Step 1: Confirm suite + build**

```bash
bun test
bun run build
```

Expected: all packages + backend pass; frontend Vite build passes. Record the pass count in the feature doc.

- [ ] **Step 2: Write `docs/features/2026-08-21-keys-dashboard.md`**

Must include: qué se hizo, por qué, decisiones, alternativas consideradas, archivos creados/modificados, verificación. Mirror the shape of `docs/features/2026-08-17-task-board-ws-broadcast.md`.

Required decisions to record (already made in the spec — do not reopen):

- Create stays in CLI (plaintext printed once).
- Revoke is per `id`, not per agent name.
- History is a log icon, not a second always-on table.
- One-shot live block + hard-delete are **out of this slice**.
- System key ids 404 on revoke so the dashboard API never mutates them.
- `keysActive` / `keysRevoked` count human only.

- [ ] **Step 3: Status pointers + PATCH bump**

Spec header: change “Sin implementar” / “Próxima sesión: plan…” to **implementado** (this plan, this date). Leave §6 as future.

Backlog item 12: mark done; item 13 stays deferred.

`package.json` root: `"version": "0.2.2"`.

- [ ] **Step 4: Commit**

```bash
git add docs/features/2026-08-21-keys-dashboard.md package.json \
  docs/superpowers/specs/2026-08-20-keys-dashboard-design.md \
  docs/superpowers/plans/2026-08-17-cardinal-v2-backlog.md
git commit -m "$(cat <<'EOF'
docs(keys): record /keys dashboard and bump to 0.2.2

Cierra el hueco UI de keys persistentes. One-shot sigue fuera
de alcance hasta el pipeline.
EOF
)"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| `GET /api/keys` + `?status=revoked`, human only, id DESC, camelCase, no hash | 1 + 2 |
| `POST /api/keys/:id/revoke` 200/401/404/409/400 | 2 + 3 |
| JWT cookie, never Bearer | 3 |
| Page `/keys`, live table, inline confirm, CLI empty copy | 4 |
| Log-icon history, no revoke in history, control exists if empty | 4 |
| Sidebar NavLink, Overview link + human `keysActive`, Settings link | 1 (counts) + 4 |
| No create UI, no DELETE, CLI revoke-by-name unchanged | Global + file map |
| One-shot block / hard-delete **not** built | Global; Task 4 explicitly skips |
| `bun test` + `bun run build` + leak grep | 4–5 |
| Feature doc | 5 |

No TBD/TODO left in tasks. Signatures are used consistently (`listHumanKeys`, `revokeKeyById`, `KeyItem`, `{ keys }` / `{ key }`).

# Pre-Fase 1: Bun Workspaces Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the `backend/src/` monolith into 5 Bun workspace packages (`core`, `db`, `auth`, `keys`, `ws`), keeping `backend/src/` as a thin composition layer.

**Architecture:** Extract shared types/config into `@cardinal/core`, DB schema/repos into `@cardinal/db`, auth into `@cardinal/auth`, key mgmt into `@cardinal/keys`, WS protocol+hub into `@cardinal/ws`. Each package is a self-contained Bun workspace with its own `package.json`, `tsconfig.json`, source, and tests. Backend imports from packages, not from local relative paths.

**Tech Stack:** Bun (workspaces, `bun:sqlite`), TypeScript (`verbatimModuleSyntax`), Zod, `jose`, `bun test`

## Global Constraints

- Each package gets its own `tsconfig.json` (mirrors `backend/tsconfig.json` with `verbatimModuleSyntax`)
- `backend/tsconfig.json` references packages via `"references"` and `"paths"`
- Root `package.json` gains `"workspaces": ["packages/*", "backend", "frontend"]`
- Root test script becomes `bun test packages/*/src backend/src`
- `bun test` must pass at every commit boundary (TDD scope: db, auth, keys, ws)
- Source code moves, not copies — after migration, old files in `backend/src/` are deleted
- All test files move with their source to the corresponding package
- Tests that exercise multiple packages (server.test.ts, api.test.ts) stay in `backend/src/`

---

## File Structure (After Migration)

```
packages/
├── core/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts           (barrel: re-export config + types + protocol)
│       ├── config.ts          ← backend/src/config.ts
│       ├── types.ts           ← AgentKind, AgentRow, AgentKeyRow, AgentEventRow from db/repos.ts
│       ├── protocol.ts        ← backend/src/ws/protocol.ts (zod schemas, parseClientMessage, resolveKind)
│       ├── config.test.ts     ← backend/src/config.test.ts
│       └── protocol.test.ts   ← backend/src/ws/protocol.test.ts
│
├── db/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts           ← backend/src/db/index.ts (MIGRATIONS, migrate, createDb)
│       ├── repos.ts           ← backend/src/db/repos.ts (imports types from @cardinal/core)
│       └── db.test.ts         ← backend/src/db/db.test.ts
│
├── auth/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts           (barrel: re-export jwt + session + routes)
│       ├── jwt.ts             ← backend/src/auth/jwt.ts
│       ├── session.ts         ← backend/src/auth/session.ts
│       ├── routes.ts          ← backend/src/auth/routes.ts
│       └── auth.test.ts       ← backend/src/auth/auth.test.ts
│
├── keys/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts           ← backend/src/keys/index.ts
│       ├── cli.ts             ← backend/src/keys/cli.ts (imports @cardinal/db)
│       └── keys.test.ts       ← backend/src/keys/keys.test.ts
│
└── ws/
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── index.ts           (barrel: re-export hub)
        ├── hub.ts             ← backend/src/ws/hub.ts (imports @cardinal/core, @cardinal/db, @cardinal/keys)
        └── hub.test.ts        ← backend/src/ws/hub.test.ts

backend/src/
├── index.ts                   (unchanged structurally, imports from @cardinal/*)
├── server.ts                  (imports from @cardinal/* + local api/auth modules)
├── http.ts                    (unchanged)
├── static.ts                  (unchanged)
├── api/
│   ├── health.ts              (unchanged, imports @cardinal/core for version)
│   ├── agents.ts              (imports @cardinal/core for types, @cardinal/ws for agentToPayload)
│   ├── system.ts              (imports @cardinal/db)
│   └── api.test.ts            (unchanged location)
├── static.test.ts             (unchanged location)
└── server.test.ts             (unchanged location)
```

---

### Task 1: Configure Bun Workspaces at Root

**Files:**
- Modify: `package.json` (root)
- Create: none yet (scaffolding in Task 2)

**Interfaces:**
- Produces: `workspaces` field in root `package.json`, updated test script

- [ ] **Step 1: Add workspaces field and update test script**

Update root `package.json`:
```jsonc
{
  "name": "cardinal-system",
  "version": "0.1.0",
  "private": true,
  "workspaces": ["packages/*", "backend", "frontend"],
  "scripts": {
    "dev:backend": "bun --watch backend/src/index.ts",
    "dev:frontend": "bun --cwd frontend run dev",
    "build": "bun --cwd frontend run build",
    "start": "bun backend/src/index.ts",
    "test": "bun test --timeout 30000 packages/*/src backend/src",
    "typecheck": "bun x tsc --noEmit -p backend/tsconfig.json && bun x tsc --noEmit -p frontend/tsconfig.json",
    "keygen": "bun packages/keys/src/cli.ts"
  }
}
```

Also update `backend/package.json` to add workspace dependencies:
```json
{
  "name": "cardinal-backend",
  "private": true,
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "test": "bun test"
  },
  "dependencies": {
    "@cardinal/core": "workspace:*",
    "@cardinal/db": "workspace:*",
    "@cardinal/auth": "workspace:*",
    "@cardinal/keys": "workspace:*",
    "@cardinal/ws": "workspace:*",
    "jose": "^6.2.4",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "bun-types": "^1.3.14",
    "typescript": "^7.0.2"
  }
}
```

- [ ] **Step 2: Verify existing tests still pass before any refactor**

Run: `bun test backend/src`
Expected: all 78 tests pass

- [ ] **Step 3: Run `bun install` to register workspace symlinks**

Run: `bun install`
Expected: no errors, `node_modules/@cardinal` should eventually appear after packages are created (not yet)

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: configure Bun workspaces in root package.json"
```

---

### Task 2: Create `packages/core/` — Types, Config, Protocol

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/src/config.ts` (from `backend/src/config.ts`)
- Create: `packages/core/src/types.ts` (AgentKind, AgentRow, AgentKeyRow, AgentEventRow extracted from `backend/src/db/repos.ts`)
- Create: `packages/core/src/protocol.ts` (from `backend/src/ws/protocol.ts`, updates imports to local)
- Create: `packages/core/src/config.test.ts` (from `backend/src/config.test.ts`)
- Create: `packages/core/src/protocol.test.ts` (from `backend/src/ws/protocol.test.ts`)
- Modify: `backend/src/db/repos.ts` — remove type definitions, import from `@cardinal/core`
- Modify: `backend/src/ws/hub.ts` — import types from `@cardinal/core` instead of `../db/repos`
- Modify: `backend/src/ws/protocol.ts` — becomes re-export from `@cardinal/core`
- Delete: `backend/src/config.ts` (moved)
- Delete: `backend/src/config.test.ts` (moved)
- Delete: `backend/src/ws/protocol.ts` (moved)
- Delete: `backend/src/ws/protocol.test.ts` (moved)

**Interfaces:**
- Produces:
  - `Config` interface, `loadConfig(env?)` → Config
  - `AgentKind = "agent" | "subagent"`
  - `AgentRow`, `AgentKeyRow`, `AgentEventRow` interfaces
  - `clientMessageSchema`, `ClientMessage`, `ParseResult`, `parseClientMessage(raw)`, `resolveKind(device, override)`
  - Barrel via `packages/core/src/index.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@cardinal/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "zod": "^4.4.3"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "types": ["bun-types"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Copy config.ts from backend**

Copy `backend/src/config.ts` → `packages/core/src/config.ts` verbatim (no import changes needed — it has zero internal imports)

- [ ] **Step 4: Create types.ts with extracted DB types**

```typescript
// packages/core/src/types.ts
export type AgentKind = "agent" | "subagent";

export interface AgentRow {
  name: string;
  device: string;
  kind: AgentKind;
  status: string;
  connected: number;
  last_seen: string | null;
  created_at: string;
}

export interface AgentKeyRow {
  id: number;
  key_hash: string;
  agent_name: string;
  kind_override: AgentKind | null;
  created_by: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface AgentEventRow {
  id: number;
  agent_name: string;
  type: "connect" | "disconnect" | "status";
  meta: string | null;
  at: string;
}
```

- [ ] **Step 5: Copy protocol.ts from backend with updated imports**

Copy `backend/src/ws/protocol.ts` → `packages/core/src/protocol.ts`

Change the import:
```typescript
// BEFORE (in backend/src/ws/protocol.ts):
import type { AgentKind } from "../db/repos";

// AFTER (in packages/core/src/protocol.ts):
import type { AgentKind } from "./types";
```

The rest of the file is identical.

- [ ] **Step 6: Create barrel index.ts**

```typescript
// packages/core/src/index.ts
export type { Config } from "./config";
export { loadConfig } from "./config";
export type { AgentKind, AgentRow, AgentKeyRow, AgentEventRow } from "./types";
export type { ClientMessage, ParseResult } from "./protocol";
export { clientMessageSchema, parseClientMessage, resolveKind } from "./protocol";
```

- [ ] **Step 7: Copy test files**

Copy:
- `backend/src/config.test.ts` → `packages/core/src/config.test.ts` (no import changes needed)
- `backend/src/ws/protocol.test.ts` → `packages/core/src/protocol.test.ts`

Update protocol.test.ts imports:
```typescript
// BEFORE:
import { parseClientMessage, resolveKind } from "./protocol";
import type { AgentKind } from "../db/repos";

// AFTER:
import { parseClientMessage, resolveKind } from "./protocol";
import type { AgentKind } from "./types";
```

- [ ] **Step 8: Run tests for the new package**

Run: `bun test packages/core/src`
Expected: all 15 tests pass (5 config + 10 protocol)

- [ ] **Step 9: Update backend imports to use @cardinal/core**

Update `backend/src/db/repos.ts`:
- Remove lines 3-32 (type definitions for AgentKind, AgentRow, AgentKeyRow, AgentEventRow)
- Add at top: `import type { AgentKind, AgentRow, AgentKeyRow, AgentEventRow } from "@cardinal/core";`

Update `backend/src/ws/protocol.ts` to become a re-export shim:
```typescript
export { clientMessageSchema, parseClientMessage, resolveKind } from "@cardinal/core";
export type { ClientMessage, ParseResult } from "@cardinal/core";
```

Update `backend/src/ws/hub.ts`:
- Change `import type { AgentKind } from "../db/repos"` → `import type { AgentKind } from "@cardinal/core"`
- Change `import { parseClientMessage, resolveKind } from "./protocol"` → `import { parseClientMessage, resolveKind } from "./protocol"` (no change, still resolves through shim)

Update `backend/src/index.ts`:
- Change `import { loadConfig } from "./config"` → `import { loadConfig } from "@cardinal/core"`

Update `backend/src/auth/routes.ts`:
- Change `import type { Config } from "../config"` → `import type { Config } from "@cardinal/core"`

Update `backend/src/auth/session.ts`:
- Change `import type { Config } from "../config"` → `import type { Config } from "@cardinal/core"`

Update `backend/src/server.ts`:
- Change import of Config type to use `@cardinal/core`

- [ ] **Step 10: Delete old source files from backend**

```bash
rm backend/src/config.ts
rm backend/src/config.test.ts
rm backend/src/ws/protocol.ts
rm backend/src/ws/protocol.test.ts
```

- [ ] **Step 11: Run full test suite to verify nothing broke**

Run: `bun test packages/core/src backend/src`
Expected: all tests pass

- [ ] **Step 12: Commit**

```bash
git add packages/core/ backend/src/
git commit -m "feat(core): extract shared types, config, and protocol to @cardinal/core"
```

---

### Task 3: Create `packages/db/` — Schema, Migrations, Repos

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/src/index.ts` (from `backend/src/db/index.ts`)
- Create: `packages/db/src/repos.ts` (from `backend/src/db/repos.ts`, updated imports)
- Create: `packages/db/src/db.test.ts` (from `backend/src/db/db.test.ts`, updated imports)
- Modify: `backend/src/db/index.ts` → re-export shim
- Modify: `backend/src/db/repos.ts` → re-export shim
- Modify: `backend/src/index.ts` → import createDb from `@cardinal/db`
- Modify: `backend/src/keys/cli.ts` → import from `@cardinal/db`
- Delete: `backend/src/db/db.test.ts` (moved)

**Interfaces:**
- Consumes: `@cardinal/core` (AgentKind, AgentRow, AgentKeyRow, AgentEventRow types)
- Produces: `MIGRATIONS`, `migrate(db)`, `createDb(path)` → Database, all 14 repo functions

- [ ] **Step 1: Create package.json and tsconfig.json**

```json
// packages/db/package.json
{
  "name": "@cardinal/db",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "@cardinal/core": "workspace:*"
  }
}
```

```json
// packages/db/tsconfig.json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "types": ["bun-types"]
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Run bun install to link workspace dependency**

Run: `bun install`
Expected: `@cardinal/db` resolves `@cardinal/core` via symlink

- [ ] **Step 3: Copy db/index.ts to packages/db/src/index.ts**

Copy `backend/src/db/index.ts` → `packages/db/src/index.ts`. No import changes needed — it only imports `Database` from `bun:sqlite`.

- [ ] **Step 4: Copy db/repos.ts to packages/db/src/repos.ts with updated imports**

Copy `backend/src/db/repos.ts` → `packages/db/src/repos.ts`

Change imports at top:
```typescript
// BEFORE:
import type { Database } from "bun:sqlite";
export type AgentKind = "agent" | "subagent";
// ... type definitions inline ...

// AFTER:
import type { Database } from "bun:sqlite";
import type { AgentKind, AgentRow, AgentKeyRow, AgentEventRow } from "@cardinal/core";
export type { AgentKind, AgentRow, AgentKeyRow, AgentEventRow };
```

The function implementations stay identical — they use `AgentRow[]`, etc. which are now imported.

- [ ] **Step 5: Create barrel index.ts for db**

```typescript
// packages/db/src/index.ts
export { MIGRATIONS, migrate, createDb } from "./index-impl";
// Wait — index.ts IS the implementation. Let me restructure:

// packages/db/src/index.ts — barrel
export { MIGRATIONS, migrate, createDb } from "./schema";
export * from "./repos";
```

Actually, to avoid circular issues and keep it simple, rename the schema file:

```bash
mv packages/db/src/index.ts packages/db/src/schema.ts
```

Then create `packages/db/src/index.ts`:
```typescript
export { MIGRATIONS, migrate, createDb } from "./schema";
export { registerAgent, upsertAgentOnConnect, markAgentDisconnected, updateAgentStatus, listAgents, getAgent, insertEvent, listEvents, createAgentKey, findActiveKeyByHash, touchKey, revokeKeysForAgent, listKeys } from "./repos";
```

- [ ] **Step 6: Copy and update db.test.ts**

Copy `backend/src/db/db.test.ts` → `packages/db/src/db.test.ts`

Update imports:
```typescript
// BEFORE:
import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createDb, MIGRATIONS, migrate } from "./index";
import { registerAgent, upsertAgentOnConnect, markAgentDisconnected, updateAgentStatus, listAgents, getAgent, insertEvent, listEvents, createAgentKey, findActiveKeyByHash, touchKey, revokeKeysForAgent, listKeys } from "./repos";

// AFTER:
import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createDb, MIGRATIONS, migrate } from "./schema";
import { registerAgent, upsertAgentOnConnect, markAgentDisconnected, updateAgentStatus, listAgents, getAgent, insertEvent, listEvents, createAgentKey, findActiveKeyByHash, touchKey, revokeKeysForAgent, listKeys } from "./repos";
```

- [ ] **Step 7: Run db package tests**

Run: `bun test packages/db/src`
Expected: all 12 tests pass

- [ ] **Step 8: Update backend imports to use @cardinal/db**

Update `backend/src/db/index.ts` → re-export shim:
```typescript
export { MIGRATIONS, migrate, createDb } from "@cardinal/db";
export type { AgentKind, AgentRow, AgentKeyRow, AgentEventRow } from "@cardinal/db";
```

Update `backend/src/db/repos.ts` → re-export shim:
```typescript
export { registerAgent, upsertAgentOnConnect, markAgentDisconnected, updateAgentStatus, listAgents, getAgent, insertEvent, listEvents, createAgentKey, findActiveKeyByHash, touchKey, revokeKeysForAgent, listKeys } from "@cardinal/db";
```

Update `backend/src/ws/hub.ts`:
- Change `import * as R from "../db/repos"` → `import * as R from "@cardinal/db"`

Update `backend/src/api/agents.ts`:
- Already imports from `../db/repos` and `../ws/hub` — update to use `@cardinal/db` and `@cardinal/ws`

Update `backend/src/api/system.ts`:
- Already uses raw SQL, but imports should be from `@cardinal/db`

Update `backend/src/keys/cli.ts`:
- Change `import { createDb } from "../db/index"` → `import { createDb } from "@cardinal/db"`
- Change `import * as R from "../db/repos"` → `import * as R from "@cardinal/db"`

- [ ] **Step 9: Delete moved test file**

```bash
rm backend/src/db/db.test.ts
```

- [ ] **Step 10: Run full test suite**

Run: `bun test packages/core/src packages/db/src backend/src`
Expected: all tests pass

- [ ] **Step 11: Commit**

```bash
git add packages/db/ backend/src/db/ backend/src/
git commit -m "feat(db): extract schema, migrations, and repos to @cardinal/db"
```

---

### Task 4: Create `packages/auth/` — JWT, Session, Routes

**Files:**
- Create: `packages/auth/package.json`
- Create: `packages/auth/tsconfig.json`
- Create: `packages/auth/src/index.ts` (barrel)
- Create: `packages/auth/src/jwt.ts` (from `backend/src/auth/jwt.ts`)
- Create: `packages/auth/src/session.ts` (from `backend/src/auth/session.ts`, updated imports)
- Create: `packages/auth/src/routes.ts` (from `backend/src/auth/routes.ts`, updated imports)
- Create: `packages/auth/src/auth.test.ts` (from `backend/src/auth/auth.test.ts`, updated imports)
- Modify: `backend/src/auth/jwt.ts` → re-export shim
- Modify: `backend/src/auth/session.ts` → re-export shim
- Modify: `backend/src/auth/routes.ts` → re-export shim
- Delete: `backend/src/auth/auth.test.ts` (moved)

**Interfaces:**
- Consumes: `@cardinal/core` (Config type), `jose` library
- Produces: `signSession(secret, user, expiresIn?)` → string, `verifySession(secret, token)` → payload|null, `SESSION_COOKIE`, `SESSION_MAX_AGE`, `sessionCookie(token)`, `clearSessionCookie()`, `readCookie(header, name)`, `getSessionUser(req, jwtSecret)`, `handleLogin(req, config)`, `handleLogout()`, `handleMe(req, config)`

- [ ] **Step 1: Create package.json and tsconfig.json**

```json
// packages/auth/package.json
{
  "name": "@cardinal/auth",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "@cardinal/core": "workspace:*",
    "jose": "^6.2.4"
  }
}
```

tsconfig.json is identical to `packages/db/tsconfig.json`.

- [ ] **Step 2: Run bun install**

Run: `bun install`

- [ ] **Step 3: Copy auth source files**

Copy `backend/src/auth/jwt.ts` → `packages/auth/src/jwt.ts` (no import changes — only imports from `jose`)

Copy `backend/src/auth/session.ts` → `packages/auth/src/session.ts`

Update imports in session.ts:
```typescript
// BEFORE:
import type { Config } from "../config";
import { verifySession } from "./jwt";

// AFTER:
import type { Config } from "@cardinal/core";
import { verifySession } from "./jwt";
```

Copy `backend/src/auth/routes.ts` → `packages/auth/src/routes.ts`

Update imports in routes.ts:
```typescript
// BEFORE:
import type { Config } from "../config";
import { json } from "../http";
import { signSession } from "./jwt";
import { clearSessionCookie, sessionCookie } from "./session";

// AFTER:
import type { Config } from "@cardinal/core";
import { json } from "../../../backend/src/http"; // cross-package import — keep relative to backend
import { signSession } from "./jwt";
import { clearSessionCookie, sessionCookie } from "./session";
```

Wait — `json()` from `http.ts` is a simple helper (10 lines). Rather than creating a dependency from auth → backend, let's either:
1. Move `json()` to `@cardinal/core` (it's a pure utility, no deps)
2. Or inline/redefine it in routes

Option 1 is cleaner. Let's move `json()` to `@cardinal/core`.

Actually, `http.ts` is literally:
```typescript
export function json(data: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}
```

This is a pure utility with zero dependencies. It belongs in `@cardinal/core`. Let's add it to Task 2's file list.

I'll update Task 2 to include `http.ts` → `packages/core/src/http.ts`.

Actually, let me revise: add `http.ts` to core in this task (Task 4), since it's needed for auth routes.

- [ ] **Step 3b: Move http.ts to @cardinal/core**

Create `packages/core/src/http.ts`:
```typescript
export function json(data: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}
```

Update `packages/core/src/index.ts` to export:
```typescript
export { json } from "./http";
```

Update `backend/src/http.ts` → re-export shim:
```typescript
export { json } from "@cardinal/core";
```

Update `packages/auth/src/routes.ts`:
```typescript
import type { Config } from "@cardinal/core";
import { json } from "@cardinal/core";
import { signSession } from "./jwt";
import { clearSessionCookie, sessionCookie } from "./session";
```

- [ ] **Step 4: Create barrel index.ts for auth**

```typescript
// packages/auth/src/index.ts
export { signSession, verifySession } from "./jwt";
export { SESSION_COOKIE, SESSION_MAX_AGE, sessionCookie, clearSessionCookie, readCookie, getSessionUser } from "./session";
export { handleLogin, handleLogout, handleMe } from "./routes";
```

- [ ] **Step 5: Copy and update auth.test.ts**

Copy `backend/src/auth/auth.test.ts` → `packages/auth/src/auth.test.ts`

Update imports:
```typescript
// BEFORE:
import { verifySession, signSession } from "./jwt";
import { SESSION_COOKIE, sessionCookie, clearSessionCookie, readCookie } from "./session";
import { handleLogin, handleMe, handleLogout } from "./routes";
import { loadConfig } from "../config";

// AFTER:
import { verifySession, signSession } from "./jwt";
import { SESSION_COOKIE, sessionCookie, clearSessionCookie, readCookie } from "./session";
import { handleLogin, handleMe, handleLogout } from "./routes";
import { loadConfig } from "@cardinal/core";
```

Also check the test for `handleLogin` which calls `req.json()` — this uses Bun's native `Request.json()`, not the `json()` helper. That should still work since tests create real `Request` objects.

- [ ] **Step 6: Run auth package tests**

Run: `bun test packages/auth/src`
Expected: all 15 auth tests pass. If `jose` import fails, check that `packages/auth/node_modules/jose` is symlinked from root. Run `bun install` from root.

- [ ] **Step 7: Create re-export shims in backend**

`backend/src/auth/jwt.ts`:
```typescript
export { signSession, verifySession } from "@cardinal/auth";
```

`backend/src/auth/session.ts`:
```typescript
export { SESSION_COOKIE, SESSION_MAX_AGE, sessionCookie, clearSessionCookie, readCookie, getSessionUser } from "@cardinal/auth";
```

`backend/src/auth/routes.ts`:
```typescript
export { handleLogin, handleLogout, handleMe } from "@cardinal/auth";
```

Delete `backend/src/auth/auth.test.ts`.

- [ ] **Step 8: Run full test suite**

Run: `bun test packages/core/src packages/auth/src backend/src`
Expected: all tests pass

- [ ] **Step 9: Commit**

```bash
git add packages/auth/ packages/core/src/http.ts packages/core/src/index.ts backend/src/auth/ backend/src/http.ts
git commit -m "feat(auth): extract JWT, session, and routes to @cardinal/auth"
```

---

### Task 5: Create `packages/keys/` — Key Generation, Hashing, CLI

**Files:**
- Create: `packages/keys/package.json`
- Create: `packages/keys/tsconfig.json`
- Create: `packages/keys/src/index.ts` (from `backend/src/keys/index.ts`)
- Create: `packages/keys/src/cli.ts` (from `backend/src/keys/cli.ts`, updated imports)
- Create: `packages/keys/src/keys.test.ts` (from `backend/src/keys/keys.test.ts`)
- Modify: `backend/src/keys/index.ts` → re-export shim
- Modify: `backend/src/keys/cli.ts` → re-export shim
- Delete: `backend/src/keys/keys.test.ts` (moved)

**Interfaces:**
- Consumes: `@cardinal/db` (createDb, repos for CLI), Bun APIs (`crypto.getRandomValues`, `Bun.CryptoHasher`)
- Produces: `KEY_PREFIX`, `generateKey()`, `hashKey(key)`, `isKeyFormat(key)`, CLI commands

- [ ] **Step 1: Create package.json and tsconfig.json**

```json
// packages/keys/package.json
{
  "name": "@cardinal/keys",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "@cardinal/core": "workspace:*",
    "@cardinal/db": "workspace:*"
  }
}
```

tsconfig.json identical to other packages.

- [ ] **Step 2: Run bun install**

Run: `bun install`

- [ ] **Step 3: Copy keys/index.ts**

Copy `backend/src/keys/index.ts` → `packages/keys/src/index.ts`. No import changes — it only uses `crypto.getRandomValues` and `Bun.CryptoHasher`.

- [ ] **Step 4: Copy keys/cli.ts with updated imports**

Copy `backend/src/keys/cli.ts` → `packages/keys/src/cli.ts`

Update imports:
```typescript
// BEFORE:
import { createDb } from "../db/index";
import * as R from "../db/repos";
import { generateKey, hashKey, KEY_PREFIX } from "./index";

// AFTER:
import { createDb } from "@cardinal/db";
import * as R from "@cardinal/db";
import { generateKey, hashKey, KEY_PREFIX } from "./index";
```

Note: `createDb` was already moved in Task 3 to `@cardinal/db`. The import path just changes from `../db/index` to `@cardinal/db`.

- [ ] **Step 5: Copy and update keys.test.ts**

Copy `backend/src/keys/keys.test.ts` → `packages/keys/src/keys.test.ts`

Update imports:
```typescript
// BEFORE:
import { describe, it, expect } from "bun:test";
import { generateKey, hashKey, isKeyFormat, KEY_PREFIX } from "./index";

// AFTER: (no changes needed — imports are local)
import { describe, it, expect } from "bun:test";
import { generateKey, hashKey, isKeyFormat, KEY_PREFIX } from "./index";
```

- [ ] **Step 6: Run keys package tests**

Run: `bun test packages/keys/src`
Expected: all 10 keys tests pass

- [ ] **Step 7: Create re-export shims in backend**

`backend/src/keys/index.ts`:
```typescript
export { generateKey, hashKey, isKeyFormat, KEY_PREFIX } from "@cardinal/keys";
```

`backend/src/keys/cli.ts`:
```typescript
export { generateKey, hashKey, isKeyFormat, KEY_PREFIX } from "@cardinal/keys";
```

Delete `backend/src/keys/keys.test.ts`.

- [ ] **Step 8: Run full test suite**

Run: `bun test packages/core/src packages/db/src packages/auth/src packages/keys/src backend/src`
Expected: all tests pass

- [ ] **Step 9: Commit**

```bash
git add packages/keys/ backend/src/keys/
git commit -m "feat(keys): extract key generation, hashing, and CLI to @cardinal/keys"
```

---

### Task 6: Create `packages/ws/` — Hub, Agent Lifecycle

**Files:**
- Create: `packages/ws/package.json`
- Create: `packages/ws/tsconfig.json`
- Create: `packages/ws/src/index.ts` (barrel)
- Create: `packages/ws/src/hub.ts` (from `backend/src/ws/hub.ts`, updated imports)
- Create: `packages/ws/src/hub.test.ts` (from `backend/src/ws/hub.test.ts`, updated imports)
- Modify: `backend/src/ws/hub.ts` → re-export shim
- Delete: `backend/src/ws/hub.test.ts` (moved)

**Interfaces:**
- Consumes: `@cardinal/core` (AgentKind, AgentRow, AgentKeyRow, ParseResult, ClientMessage, parseClientMessage, resolveKind), `@cardinal/db` (registerAgent, upsertAgentOnConnect, markAgentDisconnected, updateAgentStatus, listAgents, getAgent, insertEvent, findActiveKeyByHash, touchKey), `@cardinal/keys` (hashKey, isKeyFormat)
- Produces: `Hub` class, `ConnData` type, `AgentPayload` type, `agentToPayload(row)` function

- [ ] **Step 1: Create package.json and tsconfig.json**

```json
// packages/ws/package.json
{
  "name": "@cardinal/ws",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "@cardinal/core": "workspace:*",
    "@cardinal/db": "workspace:*",
    "@cardinal/keys": "workspace:*"
  }
}
```

- [ ] **Step 2: Run bun install**

- [ ] **Step 3: Copy ws/hub.ts with updated imports**

Copy `backend/src/ws/hub.ts` → `packages/ws/src/hub.ts`

Update imports:
```typescript
// BEFORE:
import type { ServerWebSocket, Server } from "bun";
import type { Database } from "bun:sqlite";
import * as R from "../db/repos";
import type { AgentKind } from "../db/repos";
import { hashKey, isKeyFormat } from "../keys/index";
import { parseClientMessage, resolveKind } from "./protocol";

// AFTER:
import type { ServerWebSocket, Server } from "bun";
import type { Database } from "bun:sqlite";
import * as R from "@cardinal/db";
import type { AgentKind } from "@cardinal/core";
import { hashKey, isKeyFormat } from "@cardinal/keys";
import { parseClientMessage, resolveKind } from "@cardinal/core";
```

- [ ] **Step 4: Create barrel index.ts for ws**

```typescript
// packages/ws/src/index.ts
export { Hub, agentToPayload } from "./hub";
export type { ConnData, AgentPayload } from "./hub";
```

- [ ] **Step 5: Copy and update hub.test.ts**

Copy `backend/src/ws/hub.test.ts` → `packages/ws/src/hub.test.ts`

Update imports:
```typescript
// BEFORE:
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createDb } from "../db/index";
import { createAgentKey } from "../db/repos";
import { hashKey, generateKey } from "../keys/index";
import { Hub } from "./hub";

// AFTER:
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createDb, createAgentKey } from "@cardinal/db";
import { hashKey, generateKey } from "@cardinal/keys";
import { Hub } from "./hub";
```

Also check that the test uses `generateKey` which stays in `@cardinal/keys`.

- [ ] **Step 6: Run ws package tests**

Run: `bun test packages/ws/src`
Expected: all 9 hub tests pass

- [ ] **Step 7: Create re-export shim in backend**

`backend/src/ws/hub.ts`:
```typescript
export { Hub, agentToPayload } from "@cardinal/ws";
export type { ConnData, AgentPayload } from "@cardinal/ws";
```

Delete `backend/src/ws/hub.test.ts`.

- [ ] **Step 8: Run full test suite**

Run: `bun test packages/core/src packages/db/src packages/auth/src packages/keys/src packages/ws/src backend/src`
Expected: all tests pass (all ~78 tests)

- [ ] **Step 9: Commit**

```bash
git add packages/ws/ backend/src/ws/hub.ts
git commit -m "feat(ws): extract Hub and agent lifecycle to @cardinal/ws"
```

---

### Task 7: Slim `backend/src/` — Clean Composition

**Files:**
- Modify: `backend/src/server.ts` — update all imports to use packages
- Modify: `backend/src/index.ts` — ensure only composition remains
- Modify: `backend/src/api/agents.ts` — update imports
- Modify: `backend/src/api/system.ts` — update imports
- Delete: `backend/src/ws/protocol.ts` (already a shim, now unused — hub.ts in ws package imports from @cardinal/core directly)
- Clean up any remaining stale local imports

**Interfaces:**
- All backend files should import from `@cardinal/*`, not from relative paths to extracted code

- [ ] **Step 1: Review and clean backend/src/server.ts imports**

Ensure `server.ts` imports only from `@cardinal/*` packages:
```typescript
import { json, loadConfig } from "@cardinal/core";
import { createDb } from "@cardinal/db";
import { getSessionUser } from "@cardinal/auth";
import { handleLogin, handleLogout, handleMe } from "@cardinal/auth";
import { Hub } from "@cardinal/ws";
import type { ConnData } from "@cardinal/ws";
// Local imports (not in any package):
import { handleHealth } from "./api/health";
import { handleListAgents, handleGetAgent } from "./api/agents";
import { handleSystem } from "./api/system";
import { serveStatic } from "./static";
```

- [ ] **Step 2: Update api/agents.ts**

```typescript
// BEFORE:
import { listAgents, getAgent, listEvents } from "../db/repos";
import { agentToPayload } from "../ws/hub";

// AFTER:
import { listAgents, getAgent, listEvents } from "@cardinal/db";
import { agentToPayload } from "@cardinal/ws";
```

- [ ] **Step 3: Update api/system.ts**

```typescript
// Uses direct SQL (db.run, db.query). DB refs stay as-is since Database type comes from bun:sqlite.
// Import types from @cardinal/core if needed.
```

- [ ] **Step 4: Update api/health.ts**

The health handler imports `rootPkg` from `../../../package.json`. Update path:
```typescript
// BEFORE:
import rootPkg from "../../../package.json";

// AFTER (backend is at root level workspace, so):
import rootPkg from "../../package.json";
```

- [ ] **Step 5: Clean up stale shim files**

These shim files in `backend/src/` are no longer needed since the remaining backend code directly imports from packages:
- `backend/src/db/index.ts` — remove shim, backend imports directly from `@cardinal/db`
- `backend/src/db/repos.ts` — remove shim
- `backend/src/auth/jwt.ts` — remove shim
- `backend/src/auth/session.ts` — remove shim
- `backend/src/auth/routes.ts` — remove shim
- `backend/src/keys/index.ts` — remove shim
- `backend/src/keys/cli.ts` — remove shim
- `backend/src/ws/protocol.ts` — remove shim
- `backend/src/ws/hub.ts` — remove shim

Wait — `backend/src/index.ts` calls `createDb(config.dbPath)` and `createServer(config, db)`. If we remove the shims, `createDb` comes from `@cardinal/db` and `createServer` is internal to backend. `server.ts` already imports Hub from `@cardinal/ws`. Let me trace through the import chain:

`backend/src/index.ts`:
```typescript
import { loadConfig } from "@cardinal/core";
import { createDb } from "@cardinal/db";
import { createServer } from "./server";
```

`backend/src/server.ts`:
```typescript
import { json } from "@cardinal/core";
import { handleHealth } from "./api/health";
import { handleListAgents, handleGetAgent } from "./api/agents";
import { handleSystem } from "./api/system";
import { handleLogin, handleLogout, handleMe, getSessionUser } from "@cardinal/auth";
import { Hub } from "@cardinal/ws";
import type { ConnData } from "@cardinal/ws";
import { serveStatic } from "./static";
```

Yes, no shims needed in this final state. Backend imports directly from packages.

But let me be careful: If I delete the shim files, I need to make sure no other file (tests, etc.) still imports from them.

- [ ] **Step 6: Update backend tsconfig.json for references**

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "types": ["bun-types"],
    "paths": {
      "@cardinal/core": ["../packages/core/src"],
      "@cardinal/db": ["../packages/db/src"],
      "@cardinal/auth": ["../packages/auth/src"],
      "@cardinal/keys": ["../packages/keys/src"],
      "@cardinal/ws": ["../packages/ws/src"]
    }
  },
  "include": ["src"],
  "references": [
    { "path": "../packages/core/tsconfig.json" },
    { "path": "../packages/db/tsconfig.json" },
    { "path": "../packages/auth/tsconfig.json" },
    { "path": "../packages/keys/tsconfig.json" },
    { "path": "../packages/ws/tsconfig.json" }
  ]
}
```

Actually, for Bun, the `"paths"` and `"references"` may not be needed since `bun install` creates symlinks in `node_modules/@cardinal/`. But adding them helps the TypeScript language server and `tsc --noEmit` typecheck work correctly.

Let me include them.

- [ ] **Step 7: Delete shim files from backend**

```bash
rm -f backend/src/db/index.ts backend/src/db/repos.ts
rm -f backend/src/auth/jwt.ts backend/src/auth/session.ts backend/src/auth/routes.ts
rm -f backend/src/keys/index.ts backend/src/keys/cli.ts
rm -f backend/src/ws/protocol.ts backend/src/ws/hub.ts
```

- [ ] **Step 8: Run full test suite**

Run: `bun test packages/core/src packages/db/src packages/auth/src packages/keys/src packages/ws/src backend/src`
Expected: all tests pass

- [ ] **Step 9: Run typecheck**

Run: `bun x tsc --noEmit -p backend/tsconfig.json`
Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add -A backend/src/
git commit -m "refactor(backend): slim to composition-only — all logic in packages"
```

---

### Task 8: Final Verification and Cleanup

**Files:**
- Verify: `backend/src/index.ts` is pure composition
- Verify: All `bun test` pass
- Verify: `bun x tsc --noEmit` passes for backend
- Verify: Frontend build still works (`bun run build`)

- [ ] **Step 1: Verify backend/src/index.ts is minimal**

Expected (should look like):
```typescript
import { loadConfig } from "@cardinal/core";
import { createDb } from "@cardinal/db";
import { createServer } from "./server";

const config = loadConfig();
const db = createDb(config.dbPath);
createServer(config, db);
```

- [ ] **Step 2: Run ALL tests from root**

Run: `bun test --timeout 30000 packages/*/src backend/src`
Expected: all ~78 tests pass across all packages

- [ ] **Step 3: Typecheck both backend and frontend**

Run: `bun run typecheck`
Expected: no errors

- [ ] **Step 4: Build frontend**

Run: `bun run build`
Expected: Vite build succeeds

- [ ] **Step 5: Verify backend starts**

Run: `timeout 5 bun run start 2>&1 || true`
Expected: Server starts (may fail on missing env vars if .env not sourced — that's OK. The key is: it imports all packages without runtime errors.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: final cleanup — all packages extracted, verify build + tests"
```

---

## Skipped Tasks

### Task 7: `tools/agy-acp-bridge.py` — wrapper ACP para ZED
**Status: Blocked** — Requires ACP protocol spec and ZED editor integration details. Not available in current codebase. Defer to manual/Antigravity implementation.

### Task 8: Registrar bridge en `~/.config/zed/settings.json`
**Status: Manual** — Edit outside the repo. Defer to human.

---

## Dependency Graph

```
@cardinal/core (zero deps)
    │
    ├──► @cardinal/db
    │       │
    │       ├──► @cardinal/auth
    │       │
    │       ├──► @cardinal/keys
    │       │       │
    │       │       ▼
    │       └──► @cardinal/ws
    │               │
    ▼               ▼
    backend/src/ (composition only)
```

## Commit Sequence

```
59cd281  (already committed — docs restructure)
0bcf925  (already committed — depersonalization)
   ↓
1. chore: configure Bun workspaces in root package.json
2. feat(core): extract shared types, config, and protocol to @cardinal/core
3. feat(db): extract schema, migrations, and repos to @cardinal/db
4. feat(auth): extract JWT, session, and routes to @cardinal/auth
5. feat(keys): extract key generation, hashing, and CLI to @cardinal/keys
6. feat(ws): extract Hub and agent lifecycle to @cardinal/ws
7. refactor(backend): slim to composition-only — all logic in packages
8. chore: final cleanup — all packages extracted, verify build + tests
```

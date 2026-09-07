# Cardinal System — Fase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the living skeleton of the Cardinal System: human login (JWT), SAO dashboard, Agent Hub with real-time roster via WebSocket, API keys per agent (`sk-cardinal-*`), and containerized deploy — all on Bun.

**Architecture:** Monolithic Bun backend (`Bun.serve` HTTP+WS, `bun:sqlite`) serving REST API + a single WS endpoint multiplexed by role (agent by key / dashboard by JWT cookie) + Vite build statics. Cardinal is passive: receives `hello/pong/bye`, never initiates work on agents. Frontend React + Tailwind v4 with SAO theme.

**Tech Stack:** Bun 1.3+ (runtime, sqlite, test, password), TypeScript, jose (JWT), zod (protocol), React 18, react-router-dom v6, Vite, Tailwind CSS v4, Podman (deploy).

**Reference spec:** `docs/superpowers/specs/2026-07-23-cardinal-fase-0-design.md` (approved). This plan is faithful to that spec; when in doubt, the spec governs.

---

## Plan Conventions

- **Language:** English only (prose, code, comments). See `AGENTS/docs.md`.
- **No workspaces:** `backend/` and `frontend/` are independent packages, each with its own `package.json` and `bun.lock`. The root `package.json` only carries `version` (source of truth: **0.0.1**) and scripts.
- **TDD with `bun test`:** tests placed alongside code as `*.test.ts`. From the root, run everything with `bun test backend/src`.
- **Strict TypeScript:** backend uses `verbatimModuleSyntax` → type-only imports MUST use `import type`.
- **Commits:** one commit per task, conventional commits style (`feat:`, `test:`, `chore:`, `docs:`).
- **Environment variables:** Bun loads `.env` automatically from cwd. Dev uses `.env` at the root (already gitignored).
- **Paths in this plan are relative to the repo root.**

## Final File Structure

```
cardinal-system/
├── package.json                  # version 0.0.1 + root scripts
├── .gitignore                    # already exists
├── backend/
│   ├── package.json              # deps: jose, zod | dev: bun-types, typescript
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts              # entry: loadConfig → createDb → createServer
│       ├── config.ts             # + config.test.ts
│       ├── http.ts               # helper json()
│       ├── config.test.ts
│       ├── db/
│       │   ├── index.ts          # createDb + migrate (PRAGMA user_version)
│       │   ├── repos.ts          # queries agents/keys/events
│       │   └── db.test.ts
│       ├── keys/
│       │   ├── index.ts          # generateKey/hashKey/isKeyFormat
│       │   ├── keys.test.ts
│       │   └── cli.ts            # keygen CLI
│       ├── auth/
│       │   ├── jwt.ts            # signSession/verifySession (jose)
│       │   ├── session.ts        # cookie helpers + getSessionUser
│       │   ├── routes.ts         # handleLogin/handleLogout/handleMe
│       │   └── auth.test.ts
│       ├── ws/
│       │   ├── protocol.ts       # zod schemas + parseClientMessage + resolveKind
│       │   ├── protocol.test.ts
│       │   ├── hub.ts            # Hub: registry, hello/pong/bye, ping, broadcast
│       │   └── hub.test.ts
│       ├── api/
│       │   ├── health.ts         # version desde package.json raíz
│       │   ├── agents.ts         # roster REST + detalle
│       │   └── api.test.ts
│       ├── static.ts             # + static.test.ts
│       ├── server.ts             # createServer: routing + upgrade WS
│       └── server.test.ts        # integración end-to-end
├── frontend/
│   ├── package.json              # react, react-dom, react-router-dom@6 | dev: vite, @vitejs/plugin-react, typescript, tailwindcss@4, @tailwindcss/vite, @types/*
│   ├── tsconfig.json
│   ├── vite.config.ts            # proxy /api y /ws → localhost:8787
│   ├── index.html                # fonts JetBrains Mono + Inter
│   └── src/
│       ├── index.css             # tailwind v4 + @theme tokens SAO
│       ├── main.tsx
│       ├── App.tsx
│       ├── lib/{types.ts, api.ts, ws.ts}
│       ├── hooks/{useAuth.tsx, useRoster.ts}
│       ├── components/{ProtectedRoute.tsx, Layout.tsx, AgentCard.tsx}
│       └── pages/{Login.tsx, Home.tsx, AgentDetail.tsx, Settings.tsx}
├── examples/
│   └── ws-agent.ts               # cliente WS genérico de referencia
├── deploy/
│   ├── Containerfile             # multi-stage oven/bun
│   ├── Caddyfile.example
│   ├── env.example
│   └── quadlet/{cardinal.container, cardinal-data.volume}
└── README.md                     # quickstart dev + deploy
```

## Shared Contract (EXACT names and signatures)

All tasks MUST use these names, signatures, and payloads literally. If a task references a symbol from another, this is the source of truth.

### `backend/src/http.ts`
```ts
export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response
// → new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } })
```

### `backend/src/config.ts`
```ts
export interface Config {
  port: number;              // env PORT, default 8787
  dbPath: string;            // env DB_PATH, default "./cardinal.db"
  adminUser: string;         // env ADMIN_USER (requerido)
  adminPasswordHash: string; // env ADMIN_PASSWORD_HASH (requerido)
  jwtSecret: string;         // env JWT_SECRET (requerido)
  staticDir: string;         // env STATIC_DIR, default "frontend/dist"
  pingIntervalMs: number;    // env PING_INTERVAL_MS, default 30000
}
export function loadConfig(env?: NodeJS.ProcessEnv): Config // throw Error si falta algún requerido
```

### `backend/src/db/index.ts`
```ts
import { Database } from "bun:sqlite";
export function createDb(path: string): Database  // PRAGMA journal_mode=WAL, foreign_keys=ON, luego migrate()
export function migrate(db: Database): void       // loop PRAGMA user_version con BEGIN/COMMIT
// MIGRATIONS[0] = schema inicial (ver SQL abajo)
```

### SQL Schema (migration 1, EXACT)
```sql
CREATE TABLE agents (
  name       TEXT PRIMARY KEY,
  device     TEXT NOT NULL DEFAULT 'unknown',
  kind       TEXT NOT NULL DEFAULT 'agent' CHECK (kind IN ('agent','subagent')),
  status     TEXT NOT NULL DEFAULT 'idle',
  connected  INTEGER NOT NULL DEFAULT 0,
  last_seen  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE agent_keys (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  key_hash      TEXT NOT NULL UNIQUE,
  agent_name    TEXT NOT NULL REFERENCES agents(name),
  kind_override TEXT CHECK (kind_override IN ('agent','subagent') OR kind_override IS NULL),
  created_by    TEXT NOT NULL DEFAULT 'human',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at  TEXT,
  revoked_at    TEXT
);
CREATE TABLE agent_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('connect','disconnect','status')),
  meta       TEXT,
  at         TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `backend/src/db/repos.ts`
```ts
import type { Database } from "bun:sqlite";
export type AgentKind = "agent" | "subagent";
export interface AgentRow { name: string; device: string; kind: AgentKind; status: string; connected: number; last_seen: string | null; created_at: string; }
export interface AgentKeyRow { id: number; key_hash: string; agent_name: string; kind_override: AgentKind | null; created_by: string; created_at: string; last_used_at: string | null; revoked_at: string | null; }
export interface AgentEventRow { id: number; agent_name: string; type: "connect" | "disconnect" | "status"; meta: string | null; at: string; }

export function registerAgent(db: Database, name: string, kind: AgentKind): void
// INSERT INTO agents (name, kind) VALUES (?, ?) ON CONFLICT(name) DO NOTHING

export function upsertAgentOnConnect(db: Database, args: { name: string; device: string; kind: AgentKind; status: string }): void
// INSERT ... ON CONFLICT(name) DO UPDATE SET device/kind/status=excluded.*, connected=1, last_seen=datetime('now')

export function markAgentDisconnected(db: Database, name: string): void
// UPDATE agents SET connected=0, last_seen=datetime('now') WHERE name=?

export function updateAgentStatus(db: Database, name: string, status: string): void
// UPDATE agents SET status=?, last_seen=datetime('now') WHERE name=?

export function listAgents(db: Database): AgentRow[]              // ORDER BY name
export function getAgent(db: Database, name: string): AgentRow | null
export function insertEvent(db: Database, args: { agentName: string; type: "connect" | "disconnect" | "status"; meta?: string }): void
export function listEvents(db: Database, agentName: string, limit?: number): AgentEventRow[] // default 20, ORDER BY id DESC
export function createAgentKey(db: Database, args: { keyHash: string; agentName: string; kindOverride?: AgentKind; createdBy?: "human" | "system" }): void
export function findActiveKeyByHash(db: Database, keyHash: string): AgentKeyRow | null // WHERE key_hash=? AND revoked_at IS NULL
export function touchKey(db: Database, id: number): void           // last_used_at=datetime('now')
export function revokeKeysForAgent(db: Database, agentName: string): void // revoked_at=datetime('now') WHERE activa
export function listKeys(db: Database): AgentKeyRow[]              // ORDER BY id
```

### `backend/src/keys/index.ts`
```ts
export const KEY_PREFIX = "sk-cardinal-";
export function generateKey(): string            // KEY_PREFIX + 32 bytes random en hex (64 chars) via crypto.getRandomValues
export function hashKey(key: string): string     // new Bun.CryptoHasher("sha256").update(key).digest("hex")
export function isKeyFormat(key: unknown): key is string // startsWith KEY_PREFIX && length === prefix + 64
```

### `backend/src/keys/cli.ts` (keygen)
```
Uso:
  bun run keygen -- --agent <name> [--kind agent|subagent]   → imprime la key UNA vez (stdout), guarda solo el hash; pre-registra el agente (registerAgent)
  bun run keygen -- --revoke <name>                          → revoca todas las keys activas del agente
  bun run keygen -- --list                                   → lista keys con [active]/[revoked], agent, created_by, fechas
DB: env DB_PATH o default ./cardinal.db
```

### `backend/src/auth/jwt.ts`
```ts
export async function signSession(secret: string, user: string, expiresIn?: string): Promise<string>
// jose SignJWT({sub:user}), alg HS256, issuedAt, exp default "12h", secret = new TextEncoder().encode(secret)
export async function verifySession(secret: string, token: string): Promise<{ user: string } | null>
// jwtVerify; null ante cualquier error (expirado, firma inválida, sin sub)
```

### `backend/src/auth/session.ts`
```ts
export const SESSION_COOKIE = "cardinal_session";
export const SESSION_MAX_AGE = 43200; // 12h en segundos
export function sessionCookie(token: string): string   // `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${SESSION_MAX_AGE}`
export function clearSessionCookie(): string           // mismo con Max-Age=0 y valor vacío
export function readCookie(header: string | null, name: string): string | null
export async function getSessionUser(req: Request, jwtSecret: string): Promise<string | null>
```

### `backend/src/auth/routes.ts`
```ts
export async function handleLogin(req: Request, config: Config): Promise<Response>
// body {user, password}; 400 bad_request si JSON inválido; verifica user===config.adminUser y Bun.password.verify(password, config.adminPasswordHash).catch(()=>false)
// falla → 401 {error:"invalid_credentials"} (genérico); ok → 200 {user} + header set-cookie: sessionCookie(token)
export function handleLogout(): Response               // 200 {ok:true} + clearSessionCookie()
export async function handleMe(req: Request, config: Config): Promise<Response> // 401 {error:"unauthorized"} o 200 {user}
```

### `backend/src/ws/protocol.ts`
```ts
import { z } from "zod";
// helloSchema:    { type: z.literal("hello"), key: z.string().min(1), device: z.string().min(1).default("unknown"), status: z.enum(["idle","busy"]).default("idle") }
// pongSchema:     { type: z.literal("pong"), status: z.enum(["idle","busy"]).optional() }
// byeSchema:      { type: z.literal("bye") }
// subscribeSchema:{ type: z.literal("subscribe") }
export const clientMessageSchema = z.discriminatedUnion("type", [helloSchema, pongSchema, byeSchema, subscribeSchema]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ParseResult = { ok: true; msg: ClientMessage } | { ok: false };
export function parseClientMessage(raw: string): ParseResult // JSON.parse guard + safeParse
export function resolveKind(device: string, override: AgentKind | null): AgentKind
// override ?? (device === "localhost" ? "subagent" : "agent")
```

### `backend/src/ws/hub.ts`
```ts
import type { ServerWebSocket } from "bun";
export interface ConnData { dashboardAuthed: boolean; role: "agent" | "dashboard" | null; agentName: string | null; }
export interface AgentPayload { name: string; device: string; kind: string; status: string; connected: boolean; lastSeen: string | null; }
export function agentToPayload(row: AgentRow): AgentPayload // connected: row.connected === 1, lastSeen: row.last_seen

export class Hub {
  constructor(db: Database, opts: { pingIntervalMs: number })
  readonly websocket: { message(ws, raw: string | Buffer): void; close(ws): void }  // handlers para Bun.serve
  dispose(): void // limpia todos los intervalos y mapas (para tests/shutdown)
}
```

Hub behavior (EXACT):
- Internal maps: `agents: Map<string, WS>` (by name), `timers`, `missed: Map<string, number>`, `dashboards: Set<WS>`.
- Invalid message (parse fails) → `{type:"error", reason:"invalid_message"}` + `ws.close(4400, "invalid_message")`.
- `hello`: if already has role → error `already_identified`. Validates `isKeyFormat` + `findActiveKeyByHash(hashKey(key))`; invalid → `{type:"error", reason:"auth_failed"}` + close 4401. Valid → `touchKey`, `kind = resolveKind(device, keyRow.kind_override)`, agent role. If there is already an active session with that name → `teardownAgent(name)` + close 4000 "replaced" on the old one. `upsertAgentOnConnect`, `insertEvent connect` (meta=device), sends `{type:"welcome", agent, kind}`, broadcast `agent_update`, starts ping timer.
- `subscribe`: requires `ws.data.dashboardAuthed` (cookie validated at upgrade) if not → error `auth_failed` + close 4401. Ok → dashboard role, adds to `dashboards`, sends `{type:"roster", agents:[...]}` (snapshot of `listAgents` mapped with `agentToPayload`).
- `pong`: only if agent role. `missed=0`; if status changes → `updateAgentStatus` + `insertEvent status` (meta=status) + broadcast; otherwise, refreshes `last_seen` (same status, no event).
- `bye`: only if agent role → `disconnectAgent(name)` + `ws.close(1000, "bye")`.
- `close` handler: dashboard → removed from set; agent → only if `agents.get(name) === ws` (anti-replace guard) → `disconnectAgent(name)`.
- `disconnectAgent(name)`: teardown + `markAgentDisconnected` + `insertEvent disconnect` + broadcast `agent_update`.
- Ping timer (per agent, `setInterval` every `opts.pingIntervalMs`): `missed++`; if `missed >= 2` → `disconnectAgent` + close 4000 "ping_timeout"; otherwise → sends `{type:"ping"}`.
- Broadcast: JSON `{type:"agent_update", agent: AgentPayload}` to all dashboards.

### `backend/src/api/health.ts`
```ts
import rootPkg from "../../../package.json"; // version = "0.0.1" (source of truth)
export function handleHealth(): Response // json({ status: "ok", version: rootPkg.version })
```

### `backend/src/api/agents.ts`
```ts
export function handleListAgents(db: Database): Response            // json({ agents: listAgents(db).map(agentToPayload) })
export function handleGetAgent(db: Database, name: string): Response // 404 {error:"not_found"} o json({ agent, events: listEvents(db, name, 20) })
```

### `backend/src/static.ts`
```ts
export async function serveStatic(req: Request, staticDir: string): Promise<Response>
// path normalizado anti-traversal; Bun.file(join(staticDir, path)) si existe → Response
// fallback SPA: staticDir/index.html con content-type text/html; si no existe → 404 "not found"
```

### `backend/src/server.ts`
```ts
export function createServer(config: Config, db: Database): Server
// Bun.serve<ConnData>({ port: config.port, async fetch(req, server){...}, websocket: hub.websocket })
// Routing EN ESTE ORDEN:
//   GET /ws            → getSessionUser → server.upgrade(req, { data: { dashboardAuthed: !!user, role: null, agentName: null } })
//   /api/health        → handleHealth()
//   POST /api/auth/login → handleLogin | POST /api/auth/logout → handleLogout | GET /api/auth/me → handleMe
//   GET /api/agents    → requiere sesión (401 {error:"unauthorized"}) → handleListAgents
//   GET /api/agents/:name → requiere sesión → handleGetAgent
//   /api/*             → 404 {error:"not_found"}
//   GET resto          → serveStatic
//   otro método        → 405
```

### Payload WS servidor → cliente (EXACTOS)
```

[Showing lines 1-300 of 302. Use :301 to continue]
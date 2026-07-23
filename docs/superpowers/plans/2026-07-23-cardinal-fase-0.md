# Cardinal System — Fase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levantar el esqueleto vivo del Cardinal System: login humano (JWT), dashboard SAO, Agent Hub con roster en tiempo real vía WebSocket, API keys por agente (`sk-cardinal-*`), y deploy containerizado — todo sobre Bun.

**Architecture:** Backend Bun monolítico (`Bun.serve` HTTP+WS, `bun:sqlite`) que sirve API REST + un único endpoint WS multiplexado por rol (agente por key / dashboard por cookie JWT) + estáticos del build de Vite. El Cardinal es pasivo: recibe `hello/pong/bye`, nunca inicia trabajo en los agentes. Frontend React + Tailwind v4 con tema SAO.

**Tech Stack:** Bun 1.3+ (runtime, sqlite, test, password), TypeScript, jose (JWT), zod (protocolo), React 18, react-router-dom v6, Vite, Tailwind CSS v4, Podman (deploy).

**Spec de referencia:** `docs/superpowers/specs/2026-07-23-cardinal-fase-0-design.md` (aprobado). Este plan es fiel a ese spec; ante cualquier duda, el spec manda.

---

## Convenciones del plan

- **Idioma:** prosa en español, código en inglés.
- **Sin workspaces:** `backend/` y `frontend/` son paquetes independientes, cada uno con su `package.json` y `bun.lock`. El `package.json` raíz solo tiene `version` (source of truth: **0.0.1**) y scripts.
- **TDD con `bun test`:** tests colocados junto al código como `*.test.ts`. Desde la raíz se corre todo con `bun test backend/src`.
- **TypeScript estricto:** backend usa `verbatimModuleSyntax` → los imports de solo-tipos DEBEN usar `import type`.
- **Commits:** un commit por tarea, estilo conventional commits (`feat:`, `test:`, `chore:`, `docs:`).
- **Variables de entorno:** Bun carga `.env` automáticamente desde el cwd. Dev usa `.env` en la raíz (ya gitignored).
- **Rutas en este plan son relativas a la raíz del repo** (`/home/snatty/Data/Projects/agents/cardinal-system`).

## Estructura de archivos final

```
cardinal-system/
├── package.json                  # version 0.0.1 + scripts raíz
├── .gitignore                    # ya existe
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

## Contrato compartido (nombres y firmas EXACTAS)

Todas las tareas DEBEN usar estos nombres, firmas y payloads literalmente. Si una tarea referencia un símbolo de otra, esta es la fuente de verdad.

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

### Schema SQL (migración 1, EXACTO)
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

Comportamiento del Hub (EXACTO):
- Mapas internos: `agents: Map<string, WS>` (por nombre), `timers`, `missed: Map<string, number>`, `dashboards: Set<WS>`.
- Mensaje inválido (parse falla) → `{type:"error", reason:"invalid_message"}` + `ws.close(4400, "invalid_message")`.
- `hello`: si ya tiene rol → error `already_identified`. Valida `isKeyFormat` + `findActiveKeyByHash(hashKey(key))`; inválida → `{type:"error", reason:"auth_failed"}` + close 4401. Válida → `touchKey`, `kind = resolveKind(device, keyRow.kind_override)`, rol agente. Si ya hay sesión activa con ese nombre → `teardownAgent(name)` + close 4000 "replaced" a la vieja. `upsertAgentOnConnect`, `insertEvent connect` (meta=device), envía `{type:"welcome", agent, kind}`, broadcast `agent_update`, inicia ping timer.
- `subscribe`: requiere `ws.data.dashboardAuthed` (cookie validada en el upgrade) si no → error `auth_failed` + close 4401. Ok → rol dashboard, agrega a `dashboards`, envía `{type:"roster", agents:[...]}` (snapshot de `listAgents` mapeado con `agentToPayload`).
- `pong`: solo si rol agente. `missed=0`; si cambia status → `updateAgentStatus` + `insertEvent status` (meta=status) + broadcast; si no, refresca `last_seen` (mismo status, sin evento).
- `bye`: solo si rol agente → `disconnectAgent(name)` + `ws.close(1000, "bye")`.
- `close` handler: dashboard → se quita del set; agente → solo si `agents.get(name) === ws` (guardia anti-replace) → `disconnectAgent(name)`.
- `disconnectAgent(name)`: teardown + `markAgentDisconnected` + `insertEvent disconnect` + broadcast `agent_update`.
- Ping timer (por agente, `setInterval` cada `opts.pingIntervalMs`): `missed++`; si `missed >= 2` → `disconnectAgent` + close 4000 "ping_timeout"; si no → envía `{type:"ping"}`.
- Broadcast: JSON `{type:"agent_update", agent: AgentPayload}` a todos los dashboards.

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
{type:"welcome", agent: string, kind: "agent"|"subagent"}
{type:"error", reason: "auth_failed"|"invalid_message"|"already_identified"}
{type:"ping"}
{type:"roster", agents: AgentPayload[]}
{type:"agent_update", agent: AgentPayload}
```

### Frontend — contratos
```ts
// frontend/src/lib/types.ts — espejo del backend
export interface AgentPayload { name: string; device: string; kind: "agent" | "subagent"; status: string; connected: boolean; lastSeen: string | null; }
export interface AgentEvent { id: number; agent_name: string; type: "connect" | "disconnect" | "status"; meta: string | null; at: string; }
export type ServerEvent = { type: "roster"; agents: AgentPayload[] } | { type: "agent_update"; agent: AgentPayload };
```
- `lib/api.ts`: `export class ApiError extends Error { constructor(public status: number, msg: string) }`; `export async function api<T>(path: string, init?: RequestInit): Promise<T>` — fetch con `credentials: "include"` y header content-type json; `!res.ok` → throw ApiError.
- `lib/ws.ts`: `export function connectRoster(onEvent: (ev: ServerEvent) => void): () => void` — WS a `ws(s)://location.host/ws`, al abrir envía `{type:"subscribe"}`, parsea mensajes, reconnect con backoff `min(15000, 1000 * attempt)`, devuelve cleanup.
- `hooks/useAuth.tsx`: context `{ user: string | null | undefined, login(user, password), logout() }` (`undefined` = cargando); al montar llama `/api/auth/me`.
- `hooks/useRoster.ts`: `useRoster(): Map<string, AgentPayload>` — aplica `roster` (reemplaza) y `agent_update` (upsert).
- Rutas: `/login`, `/` (Home, Agent Hub), `/agents/:name` (AgentDetail), `/settings`. `ProtectedRoute` redirige a `/login` si `user === null`, muestra "loading…" si `undefined`.
- `Layout`: sidebar (nav Home/Settings, botón logout, footer con `v{version}` de `/api/health`) + `<Outlet/>`.
- `Home`: grilla con `AgentCard` SOLO `kind === "agent"` (online primero), sección colapsable "subagents (n)", empty state sugiriendo `bun run keygen -- --agent <name>`.
- `AgentCard`: avatar circular con glow HSL derivado de `hueFor(name)` (hash simple), offline → `opacity-40 grayscale`, link a `/agents/:name`.
- `AgentDetail`: info en vivo desde `useRoster` + eventos de `/api/agents/:name` (refetch cuando cambian `connected`/`status`).
- `Settings`: usuario, versión, nota de que la password se cambia por env + restart.
- Tema SAO en `index.css` (Tailwind v4):
```css
@import "tailwindcss";
@theme {
  --color-sao-bg: #08070c;
  --color-sao-panel: #0a0e27;
  --color-sao-accent: #00d4ff;
  --color-sao-mint: #7ed3c1;
  --color-sao-violet: #8b5cf6;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
}
body { background-color: var(--color-sao-bg); color: #e2e8f0; font-family: var(--font-sans); }
```

### Verificación frontend (no hay suite de tests en Fase 0)
- `bun x tsc --noEmit -p frontend/tsconfig.json` → sin errores
- `bun --cwd frontend run build` → genera `frontend/dist/`

---
### Task 1: Scaffold del monorepo

**Files:**
- Create: `package.json`
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`

Sin workspaces: `backend/` y `frontend/` son paquetes independientes, cada uno con su propio `bun.lock`. El `package.json` raíz solo lleva `version` (source of truth: **0.0.1**) y scripts de orquestación. Todavía no se crea código fuente — solo manifiestos, configs y dependencias.

- [ ] **Step 1: Crear el package.json raíz**

Crear `package.json` en la raíz del repo con este contenido exacto:

```json
{
  "name": "cardinal-system",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev:backend": "bun --watch backend/src/index.ts",
    "dev:frontend": "bun --cwd frontend run dev",
    "build": "bun --cwd frontend run build",
    "start": "bun backend/src/index.ts",
    "test": "bun test backend/src",
    "typecheck": "bun x tsc --noEmit -p backend/tsconfig.json && bun x tsc --noEmit -p frontend/tsconfig.json",
    "keygen": "bun backend/src/keys/cli.ts"
  }
}
```

- [ ] **Step 2: Crear backend/package.json y backend/tsconfig.json**

Crear `backend/package.json`:

```json
{
  "name": "cardinal-backend",
  "private": true,
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "test": "bun test"
  }
}
```

Crear `backend/tsconfig.json` (`verbatimModuleSyntax` obliga a usar `import type` para imports de solo-tipos; `types: ["bun-types"]` habilita los tipos de Bun y `NodeJS.ProcessEnv`):

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

- [ ] **Step 3: Instalar dependencias del backend**

```bash
# workdir: backend/
bun add jose zod
bun add -d bun-types typescript
```

Esperado: dependencias instaladas (`+ jose@...`, `+ zod@...`, `+ bun-types@...`, `+ typescript@...`) y `backend/bun.lock` generado.

- [ ] **Step 4: Crear frontend/package.json y frontend/tsconfig.json**

Crear `frontend/package.json`:

```json
{
  "name": "cardinal-frontend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  }
}
```

Crear `frontend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 5: Instalar dependencias del frontend**

```bash
# workdir: frontend/
bun add react react-dom "react-router-dom@^6"
bun add -d vite @vitejs/plugin-react typescript tailwindcss @tailwindcss/vite @types/react @types/react-dom
```

Esperado: dependencias instaladas y `frontend/bun.lock` generado.

- [ ] **Step 6: Verificar que TypeScript quedó instalado en ambos paquetes**

```bash
# workdir: backend/
bun x tsc --version
```

```bash
# workdir: frontend/
bun x tsc --version
```

Esperado (en ambos): `Version 5.x.y`. Nota: **NO** correr `typecheck` ni `tsc --noEmit -p ...` todavía — ambos tsconfig incluyen `src`/`vite.config.ts` que aún no existen y fallarían con `error TS18003: No inputs were found in config file`. El script `typecheck` raíz pasa a partir del Task 2 (backend) y queda completo cuando exista el frontend.

- [ ] **Step 7: Commit**

```bash
git add package.json backend/package.json backend/tsconfig.json backend/bun.lock frontend/package.json frontend/tsconfig.json frontend/bun.lock
git commit -m "chore: scaffold monorepo (root, backend, frontend packages)"
```

---

### Task 2: Config module (TDD)

**Files:**
- Create: `backend/src/config.ts`
- Test: `backend/src/config.test.ts`

El módulo de config valida las variables de entorno requeridas al arranque y aplica defaults. El test inyecta un `env` falso vía parámetro para no depender del entorno real ni mutar `process.env`.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/src/config.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { loadConfig } from "./config";

const requiredEnv: Record<string, string> = {
  ADMIN_USER: "admin",
  ADMIN_PASSWORD_HASH: "argon2:fakehash",
  JWT_SECRET: "test-secret",
};

describe("loadConfig", () => {
  test("throws when ADMIN_USER is missing", () => {
    const env = { ...requiredEnv };
    delete env.ADMIN_USER;
    expect(() => loadConfig(env)).toThrow("ADMIN_USER is required");
  });

  test("throws when ADMIN_PASSWORD_HASH is missing", () => {
    const env = { ...requiredEnv };
    delete env.ADMIN_PASSWORD_HASH;
    expect(() => loadConfig(env)).toThrow("ADMIN_PASSWORD_HASH is required");
  });

  test("throws when JWT_SECRET is missing", () => {
    const env = { ...requiredEnv };
    delete env.JWT_SECRET;
    expect(() => loadConfig(env)).toThrow("JWT_SECRET is required");
  });

  test("returns defaults when only the required vars are present", () => {
    const config = loadConfig({ ...requiredEnv });
    expect(config.port).toBe(8787);
    expect(config.dbPath).toBe("./cardinal.db");
    expect(config.staticDir).toBe("frontend/dist");
    expect(config.pingIntervalMs).toBe(30000);
    expect(config.adminUser).toBe("admin");
    expect(config.adminPasswordHash).toBe("argon2:fakehash");
    expect(config.jwtSecret).toBe("test-secret");
  });

  test("respects explicit overrides", () => {
    const config = loadConfig({
      ...requiredEnv,
      PORT: "9999",
      DB_PATH: "/tmp/cardinal-test.db",
      STATIC_DIR: "public",
      PING_INTERVAL_MS: "5000",
    });
    expect(config.port).toBe(9999);
    expect(config.dbPath).toBe("/tmp/cardinal-test.db");
    expect(config.staticDir).toBe("public");
    expect(config.pingIntervalMs).toBe(5000);
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

```bash
bun test backend/src/config.test.ts
```

Esperado: FAIL — `error: Cannot find module "./config" from ".../backend/src/config.test.ts"`, resumen `0 pass / 1 fail`.

- [ ] **Step 3: Implementar backend/src/config.ts**

Crear `backend/src/config.ts` (interfaz `Config` y firma `loadConfig` EXACTAS del contrato; coerción con `Number()` para los valores numéricos):

```ts
export interface Config {
  port: number;
  dbPath: string;
  adminUser: string;
  adminPasswordHash: string;
  jwtSecret: string;
  staticDir: string;
  pingIntervalMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (!env.ADMIN_USER) {
    throw new Error("ADMIN_USER is required");
  }
  if (!env.ADMIN_PASSWORD_HASH) {
    throw new Error("ADMIN_PASSWORD_HASH is required");
  }
  if (!env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required");
  }
  return {
    port: Number(env.PORT ?? 8787),
    dbPath: env.DB_PATH ?? "./cardinal.db",
    adminUser: env.ADMIN_USER,
    adminPasswordHash: env.ADMIN_PASSWORD_HASH,
    jwtSecret: env.JWT_SECRET,
    staticDir: env.STATIC_DIR ?? "frontend/dist",
    pingIntervalMs: Number(env.PING_INTERVAL_MS ?? 30000),
  };
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

```bash
bun test backend/src/config.test.ts
```

Esperado: `5 pass / 0 fail`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/config.ts backend/src/config.test.ts
git commit -m "feat(backend): add config module with env validation"
```

---

### Task 3: DB layer — migrations + repos (TDD)

**Files:**
- Create: `backend/src/db/index.ts`
- Create: `backend/src/db/repos.ts`
- Test: `backend/src/db/db.test.ts`

Capa de persistencia sobre `bun:sqlite`: `createDb` aplica PRAGMAs y corre `migrate()` (loop de `PRAGMA user_version` con transacciones), y `repos.ts` concentra todas las queries de `agents`, `agent_keys` y `agent_events`. Los tests usan bases en memoria (`createDb(":memory:")`), una nueva por test.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/src/db/db.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { createDb, migrate } from "./index";
import {
  createAgentKey,
  findActiveKeyByHash,
  getAgent,
  insertEvent,
  listAgents,
  listEvents,
  listKeys,
  markAgentDisconnected,
  registerAgent,
  revokeKeysForAgent,
  touchKey,
  updateAgentStatus,
  upsertAgentOnConnect,
} from "./repos";

function tableNames(db: ReturnType<typeof createDb>): string[] {
  const rows = db
    .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

describe("migrations", () => {
  test("migrate creates the 3 tables and sets user_version to 1", () => {
    const db = createDb(":memory:");
    expect(tableNames(db)).toEqual(["agent_events", "agent_keys", "agents"]);
    const row = db.query("PRAGMA user_version").get() as { user_version: number };
    expect(row.user_version).toBe(1);
    db.close();
  });

  test("createDb + migrate are idempotent", () => {
    const db = createDb(":memory:");
    migrate(db); // re-run on an already-migrated database
    migrate(db);
    const row = db.query("PRAGMA user_version").get() as { user_version: number };
    expect(row.user_version).toBe(1);
    expect(tableNames(db)).toHaveLength(3);
    db.close();
  });
});

describe("agents repo", () => {
  test("registerAgent inserts once and starts disconnected", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    registerAgent(db, "shinon", "agent"); // ON CONFLICT(name) DO NOTHING
    const agents = listAgents(db);
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe("shinon");
    expect(agents[0].kind).toBe("agent");
    expect(agents[0].connected).toBe(0);
    db.close();
  });

  test("upsertAgentOnConnect inserts a new agent as connected", () => {
    const db = createDb(":memory:");
    upsertAgentOnConnect(db, { name: "kirito", device: "laptop", kind: "agent", status: "idle" });
    const agent = getAgent(db, "kirito");
    expect(agent).not.toBeNull();
    expect(agent!.connected).toBe(1);
    expect(agent!.device).toBe("laptop");
    expect(agent!.status).toBe("idle");
    expect(agent!.last_seen).not.toBeNull();
    db.close();
  });

  test("upsertAgentOnConnect updates an existing agent and reconnects it", () => {
    const db = createDb(":memory:");
    upsertAgentOnConnect(db, { name: "kirito", device: "laptop", kind: "agent", status: "idle" });
    markAgentDisconnected(db, "kirito");
    expect(getAgent(db, "kirito")!.connected).toBe(0);
    upsertAgentOnConnect(db, { name: "kirito", device: "pc", kind: "agent", status: "busy" });
    expect(listAgents(db)).toHaveLength(1);
    const agent = getAgent(db, "kirito");
    expect(agent!.connected).toBe(1);
    expect(agent!.device).toBe("pc");
    expect(agent!.status).toBe("busy");
    db.close();
  });

  test("updateAgentStatus changes status and refreshes last_seen", () => {
    const db = createDb(":memory:");
    registerAgent(db, "asuna", "agent");
    updateAgentStatus(db, "asuna", "busy");
    const agent = getAgent(db, "asuna");
    expect(agent!.status).toBe("busy");
    expect(agent!.last_seen).not.toBeNull();
    db.close();
  });

  test("markAgentDisconnected sets connected to 0", () => {
    const db = createDb(":memory:");
    upsertAgentOnConnect(db, { name: "eugeo", device: "pc", kind: "agent", status: "idle" });
    markAgentDisconnected(db, "eugeo");
    expect(getAgent(db, "eugeo")!.connected).toBe(0);
    db.close();
  });

  test("listAgents is ordered by name and getAgent returns null for unknown", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    registerAgent(db, "asuna", "agent");
    registerAgent(db, "kirito", "subagent");
    expect(listAgents(db).map((a) => a.name)).toEqual(["asuna", "kirito", "shinon"]);
    expect(getAgent(db, "nobody")).toBeNull();
    db.close();
  });
});

describe("events repo", () => {
  test("insertEvent + listEvents returns newest first and respects limit", () => {
    const db = createDb(":memory:");
    insertEvent(db, { agentName: "shinon", type: "connect", meta: "pc" });
    insertEvent(db, { agentName: "shinon", type: "status", meta: "busy" });
    insertEvent(db, { agentName: "shinon", type: "disconnect" });
    const events = listEvents(db, "shinon");
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.type)).toEqual(["disconnect", "status", "connect"]);
    expect(events[0].meta).toBeNull();
    expect(events[2].meta).toBe("pc");
    const limited = listEvents(db, "shinon", 2);
    expect(limited).toHaveLength(2);
    expect(limited[0].type).toBe("disconnect");
    db.close();
  });
});

describe("keys repo", () => {
  test("createAgentKey + findActiveKeyByHash + touchKey", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "hash-1", agentName: "shinon" });
    const key = findActiveKeyByHash(db, "hash-1");
    expect(key).not.toBeNull();
    expect(key!.agent_name).toBe("shinon");
    expect(key!.created_by).toBe("human");
    expect(key!.kind_override).toBeNull();
    expect(key!.last_used_at).toBeNull();
    touchKey(db, key!.id);
    const touched = findActiveKeyByHash(db, "hash-1");
    expect(touched!.last_used_at).not.toBeNull();
    db.close();
  });

  test("revokeKeysForAgent makes findActiveKeyByHash return null", () => {
    const db = createDb(":memory:");
    registerAgent(db, "kirito", "agent");
    createAgentKey(db, { keyHash: "hash-2", agentName: "kirito" });
    expect(findActiveKeyByHash(db, "hash-2")).not.toBeNull();
    revokeKeysForAgent(db, "kirito");
    expect(findActiveKeyByHash(db, "hash-2")).toBeNull();
    expect(listKeys(db)[0].revoked_at).not.toBeNull();
    db.close();
  });

  test("listKeys returns all keys ordered by id", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    registerAgent(db, "kirito", "agent");
    createAgentKey(db, { keyHash: "hash-1", agentName: "shinon", kindOverride: "agent" });
    createAgentKey(db, { keyHash: "hash-2", agentName: "kirito", createdBy: "system" });
    const keys = listKeys(db);
    expect(keys).toHaveLength(2);
    expect(keys[0].key_hash).toBe("hash-1");
    expect(keys[0].kind_override).toBe("agent");
    expect(keys[1].key_hash).toBe("hash-2");
    expect(keys[1].created_by).toBe("system");
    db.close();
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

```bash
bun test backend/src/db/db.test.ts
```

Esperado: FAIL — `error: Cannot find module "./index" from ".../backend/src/db/db.test.ts"` (también `"./repos"`), resumen `0 pass / 1 fail`.

- [ ] **Step 3: Implementar backend/src/db/index.ts (createDb + migrate)**

Crear `backend/src/db/index.ts`. `MIGRATIONS[0]` contiene el SQL EXACTO del contrato (migración 1). `migrate` lee `PRAGMA user_version` y aplica las migraciones pendientes en transacción (`BEGIN`/`COMMIT`, `ROLLBACK` ante error). `createDb` aplica los PRAGMAs y corre `migrate()`:

```ts
import { Database } from "bun:sqlite";

export const MIGRATIONS: string[] = [
  `
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
`,
];

export function migrate(db: Database): void {
  const row = db.query("PRAGMA user_version").get() as { user_version: number };
  let version = row.user_version;
  while (version < MIGRATIONS.length) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[version]);
      version += 1;
      db.exec(`PRAGMA user_version = ${version}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

export function createDb(path: string): Database {
  const db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}
```

Nota: `PRAGMA user_version = N` no admite parámetros bindeados; se interpola un entero controlado por el loop (seguro).

- [ ] **Step 4: Implementar backend/src/db/repos.ts**

Crear `backend/src/db/repos.ts` con todos los tipos y funciones EXACTOS del contrato (`db.query`/`db.run` de bun:sqlite preparan y cachean los statements internamente):

```ts
import type { Database } from "bun:sqlite";

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

export function registerAgent(db: Database, name: string, kind: AgentKind): void {
  db.run("INSERT INTO agents (name, kind) VALUES (?, ?) ON CONFLICT(name) DO NOTHING", [name, kind]);
}

export function upsertAgentOnConnect(
  db: Database,
  args: { name: string; device: string; kind: AgentKind; status: string },
): void {
  db.run(
    `INSERT INTO agents (name, device, kind, status, connected, last_seen)
     VALUES (?, ?, ?, ?, 1, datetime('now'))
     ON CONFLICT(name) DO UPDATE SET
       device = excluded.device,
       kind = excluded.kind,
       status = excluded.status,
       connected = 1,
       last_seen = datetime('now')`,
    [args.name, args.device, args.kind, args.status],
  );
}

export function markAgentDisconnected(db: Database, name: string): void {
  db.run("UPDATE agents SET connected = 0, last_seen = datetime('now') WHERE name = ?", [name]);
}

export function updateAgentStatus(db: Database, name: string, status: string): void {
  db.run("UPDATE agents SET status = ?, last_seen = datetime('now') WHERE name = ?", [status, name]);
}

export function listAgents(db: Database): AgentRow[] {
  return db.query("SELECT * FROM agents ORDER BY name").all() as AgentRow[];
}

export function getAgent(db: Database, name: string): AgentRow | null {
  return (db.query("SELECT * FROM agents WHERE name = ?").get(name) as AgentRow | null) ?? null;
}

export function insertEvent(
  db: Database,
  args: { agentName: string; type: "connect" | "disconnect" | "status"; meta?: string },
): void {
  db.run("INSERT INTO agent_events (agent_name, type, meta) VALUES (?, ?, ?)", [
    args.agentName,
    args.type,
    args.meta ?? null,
  ]);
}

export function listEvents(db: Database, agentName: string, limit = 20): AgentEventRow[] {
  return db
    .query("SELECT * FROM agent_events WHERE agent_name = ? ORDER BY id DESC LIMIT ?")
    .all(agentName, limit) as AgentEventRow[];
}

export function createAgentKey(
  db: Database,
  args: { keyHash: string; agentName: string; kindOverride?: AgentKind; createdBy?: "human" | "system" },
): void {
  db.run("INSERT INTO agent_keys (key_hash, agent_name, kind_override, created_by) VALUES (?, ?, ?, ?)", [
    args.keyHash,
    args.agentName,
    args.kindOverride ?? null,
    args.createdBy ?? "human",
  ]);
}

export function findActiveKeyByHash(db: Database, keyHash: string): AgentKeyRow | null {
  return (
    (db
      .query("SELECT * FROM agent_keys WHERE key_hash = ? AND revoked_at IS NULL")
      .get(keyHash) as AgentKeyRow | null) ?? null
  );
}

export function touchKey(db: Database, id: number): void {
  db.run("UPDATE agent_keys SET last_used_at = datetime('now') WHERE id = ?", [id]);
}

export function revokeKeysForAgent(db: Database, agentName: string): void {
  db.run("UPDATE agent_keys SET revoked_at = datetime('now') WHERE agent_name = ? AND revoked_at IS NULL", [
    agentName,
  ]);
}

export function listKeys(db: Database): AgentKeyRow[] {
  return db.query("SELECT * FROM agent_keys ORDER BY id").all() as AgentKeyRow[];
}
```

- [ ] **Step 5: Ejecutar el test y verificar que pasa**

```bash
bun test backend/src/db/db.test.ts
```

Esperado: `12 pass / 0 fail`. Verificación adicional de no-regresión:

```bash
bun test backend/src
```

Esperado: `17 pass / 0 fail` (5 de config + 12 de db).

- [ ] **Step 6: Commit**

```bash
git add backend/src/db/index.ts backend/src/db/repos.ts backend/src/db/db.test.ts
git commit -m "feat(backend): add sqlite db layer with migrations and repos"
```
### Task 4: Agent keys module + keygen CLI (TDD)

**Files:**
- Create: `backend/src/keys/keys.test.ts`
- Create: `backend/src/keys/index.ts`
- Create: `backend/src/keys/cli.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/src/keys/keys.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { generateKey, hashKey, isKeyFormat, KEY_PREFIX } from "./index";

describe("generateKey", () => {
  test("returns sk-cardinal- prefix plus 64 hex chars", () => {
    const key = generateKey();
    expect(typeof key).toBe("string");
    expect(key.startsWith("sk-cardinal-")).toBe(true);
    expect(key.length).toBe(12 + 64);
    expect(/^[0-9a-f]{64}$/.test(key.slice(KEY_PREFIX.length))).toBe(true);
  });

  test("two calls produce different keys", () => {
    expect(generateKey()).not.toBe(generateKey());
  });
});

describe("hashKey", () => {
  test("is deterministic and returns 64-char hex", () => {
    const key = generateKey();
    const h1 = hashKey(key);
    expect(h1).toBe(hashKey(key));
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  test("different keys produce different hashes", () => {
    expect(hashKey(generateKey())).not.toBe(hashKey(generateKey()));
  });
});

describe("isKeyFormat", () => {
  test("accepts a generated key", () => {
    expect(isKeyFormat(generateKey())).toBe(true);
  });

  test("rejects a short suffix", () => {
    expect(isKeyFormat("sk-cardinal-short")).toBe(false);
  });

  test("rejects a wrong prefix", () => {
    const key = generateKey();
    expect(isKeyFormat("sk-other-" + key.slice(KEY_PREFIX.length))).toBe(false);
  });

  test("rejects non-strings", () => {
    expect(isKeyFormat(42)).toBe(false);
    expect(isKeyFormat(null)).toBe(false);
    expect(isKeyFormat(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Ejecutar: `bun test backend/src/keys/keys.test.ts`
Esperado: FAIL con `error: Cannot find module "./index"` (el módulo aún no existe).

- [ ] **Step 3: Implementar el módulo de keys**

Crear `backend/src/keys/index.ts`:

```ts
export const KEY_PREFIX = "sk-cardinal-";

export function generateKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return KEY_PREFIX + hex;
}

export function hashKey(key: string): string {
  return new Bun.CryptoHasher("sha256").update(key).digest("hex");
}

export function isKeyFormat(key: unknown): key is string {
  return (
    typeof key === "string" &&
    key.startsWith(KEY_PREFIX) &&
    key.length === KEY_PREFIX.length + 64
  );
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Ejecutar: `bun test backend/src/keys/keys.test.ts`
Esperado: PASS — 8 tests, 0 fail.

- [ ] **Step 5: Implementar el CLI keygen (sin test unitario; se verifica manual)**

Crear `backend/src/keys/cli.ts` (ojo: vive en `backend/src/keys/`, por eso importa `./index` y `../db/...`):

```ts
import { createDb } from "../db/index";
import { createAgentKey, listKeys, registerAgent, revokeKeysForAgent } from "../db/repos";
import type { AgentKind } from "../db/repos";
import { generateKey, hashKey } from "./index";

function usage(): never {
  console.error(`Usage:
  bun run keygen -- --agent <name> [--kind agent|subagent]   create key, print it once
  bun run keygen -- --revoke <name>                          revoke all active keys of agent
  bun run keygen -- --list                                   list keys`);
  process.exit(1);
}

function main(): void {
  const args = process.argv.slice(2);
  const db = createDb(process.env.DB_PATH ?? "./cardinal.db");
  try {
    const cmd = args[0];
    if (cmd === "--agent") {
      const agent = args[1];
      if (!agent || agent.startsWith("--")) usage();
      let kind: AgentKind | undefined;
      const kindIdx = args.indexOf("--kind");
      if (kindIdx !== -1) {
        const value = args[kindIdx + 1];
        if (value !== "agent" && value !== "subagent") usage();
        kind = value;
      }
      registerAgent(db, agent, kind ?? "agent");
      const key = generateKey();
      createAgentKey(db, {
        keyHash: hashKey(key),
        agentName: agent,
        kindOverride: kind,
      });
      console.log(key); // la key se imprime UNA sola vez; en DB queda solo el hash
    } else if (cmd === "--revoke") {
      const agent = args[1];
      if (!agent || agent.startsWith("--")) usage();
      revokeKeysForAgent(db, agent);
    } else if (cmd === "--list") {
      for (const k of listKeys(db)) {
        const state = k.revoked_at ? "[revoked]" : "[active] ";
        console.log(`${state} ${k.agent_name} ${k.created_by} ${k.created_at} ${k.last_used_at ?? "-"}`);
      }
    } else {
      usage();
    }
  } finally {
    db.close();
  }
}

main();
```

- [ ] **Step 6: Verificación manual — crear key**

Ejecutar: `DB_PATH=/tmp/test-keygen.db bun backend/src/keys/cli.ts --agent shinon`
Esperado: una única línea en stdout con formato `sk-cardinal-<64 hex>`.

- [ ] **Step 7: Verificación manual — listar muestra la key activa**

Ejecutar: `DB_PATH=/tmp/test-keygen.db bun backend/src/keys/cli.ts --list`
Esperado: una línea `[active]  shinon human <created_at> -`.

- [ ] **Step 8: Verificación manual — revocar y limpiar**

Ejecutar: `DB_PATH=/tmp/test-keygen.db bun backend/src/keys/cli.ts --revoke shinon && DB_PATH=/tmp/test-keygen.db bun backend/src/keys/cli.ts --list && rm /tmp/test-keygen.db`
Esperado: la línea ahora muestra `[revoked] shinon human <created_at> -`; el archivo de test se elimina.

- [ ] **Step 9: Commit**

```bash
git add backend/src/keys/index.ts backend/src/keys/keys.test.ts backend/src/keys/cli.ts
git commit -m "feat: agent key module and keygen CLI"
```

---

### Task 5: JWT + session + auth route handlers (TDD)

**Files:**
- Create: `backend/src/http.ts`
- Create: `backend/src/auth/auth.test.ts`
- Create: `backend/src/auth/jwt.ts`
- Create: `backend/src/auth/session.ts`
- Create: `backend/src/auth/routes.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/src/auth/auth.test.ts` (usa el tipo `Config` de `../config`, creado en una tarea anterior; el hash de password se genera una sola vez en `beforeAll` porque `Bun.password.hash` es lento):

```ts
import { beforeAll, describe, expect, test } from "bun:test";
import { SignJWT } from "jose";
import type { Config } from "../config";
import { signSession, verifySession } from "./jwt";
import { clearSessionCookie, readCookie, sessionCookie } from "./session";
import { handleLogin, handleLogout, handleMe } from "./routes";

describe("jwt", () => {
  test("signSession/verifySession roundtrip returns the user", async () => {
    const token = await signSession("s1", "admin");
    expect(await verifySession("s1", token)).toEqual({ user: "admin" });
  });

  test("wrong secret returns null", async () => {
    const token = await signSession("s1", "admin");
    expect(await verifySession("other-secret", token)).toBeNull();
  });

  test("expired token returns null", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ sub: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(now - 7200)
      .setExpirationTime(now - 3600)
      .sign(new TextEncoder().encode("s1"));
    expect(await verifySession("s1", token)).toBeNull();
  });

  test("token without sub returns null", async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("s1"));
    expect(await verifySession("s1", token)).toBeNull();
  });
});

describe("session", () => {
  test("sessionCookie contains name and security flags", () => {
    const c = sessionCookie("tok");
    expect(c).toContain("cardinal_session=");
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Strict");
    expect(c).toContain("Max-Age=43200");
  });

  test("clearSessionCookie expires immediately", () => {
    expect(clearSessionCookie()).toContain("Max-Age=0");
  });

  test("readCookie parses the requested cookie", () => {
    expect(readCookie("a=1; cardinal_session=tok123; b=2", "cardinal_session")).toBe("tok123");
  });

  test("readCookie returns null when missing", () => {
    expect(readCookie("a=1; b=2", "cardinal_session")).toBeNull();
  });

  test("readCookie returns null for null header", () => {
    expect(readCookie(null, "cardinal_session")).toBeNull();
  });
});

describe("routes", () => {
  let config: Config;

  beforeAll(async () => {
    config = {
      port: 0,
      dbPath: ":memory:",
      adminUser: "admin",
      adminPasswordHash: await Bun.password.hash("sao123"),
      jwtSecret: "test-secret",
      staticDir: "x",
      pingIntervalMs: 1000,
    };
  });

  function loginReq(body: string): Request {
    return new Request("http://t/api/auth/login", { method: "POST", body });
  }

  test("handleLogin: correct credentials return 200 and set-cookie", async () => {
    const res = await handleLogin(
      loginReq(JSON.stringify({ user: "admin", password: "sao123" })),
      config,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: "admin" });
    expect(res.headers.get("set-cookie")).toContain("cardinal_session=");
  });

  test("handleLogin: wrong password returns 401", async () => {
    const res = await handleLogin(
      loginReq(JSON.stringify({ user: "admin", password: "nope" })),
      config,
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_credentials" });
  });

  test("handleLogin: wrong user returns 401", async () => {
    const res = await handleLogin(
      loginReq(JSON.stringify({ user: "root", password: "sao123" })),
      config,
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_credentials" });
  });

  test("handleLogin: invalid JSON body returns 400", async () => {
    const res = await handleLogin(loginReq("not-json"), config);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
  });

  test("handleMe: with session cookie returns 200", async () => {
    const login = await handleLogin(
      loginReq(JSON.stringify({ user: "admin", password: "sao123" })),
      config,
    );
    const cookie = login.headers.get("set-cookie")!;
    const req = new Request("http://t/api/auth/me", { headers: { cookie } });
    const res = await handleMe(req, config);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: "admin" });
  });

  test("handleMe: without cookie returns 401", async () => {
    const res = await handleMe(new Request("http://t/api/auth/me"), config);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  test("handleLogout: clears the session cookie", () => {
    const res = handleLogout();
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Ejecutar: `bun test backend/src/auth/auth.test.ts`
Esperado: FAIL con `error: Cannot find module "./jwt"` (los módulos aún no existen).

- [ ] **Step 3: Crear el helper `json()` (primer paso de implementación; ninguna tarea anterior lo crea)**

Crear `backend/src/http.ts` exactamente como dice el contrato:

```ts
export function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}
```

- [ ] **Step 4: Implementar jwt.ts**

Crear `backend/src/auth/jwt.ts`:

```ts
import { SignJWT, jwtVerify } from "jose";

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signSession(
  secret: string,
  user: string,
  expiresIn = "12h",
): Promise<string> {
  return new SignJWT({ sub: user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey(secret));
}

export async function verifySession(
  secret: string,
  token: string,
): Promise<{ user: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret));
    if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
    return { user: payload.sub };
  } catch {
    return null; // expirado, firma inválida, formato inválido
  }
}
```

- [ ] **Step 5: Implementar session.ts**

Crear `backend/src/auth/session.ts`:

```ts
import { verifySession } from "./jwt";

export const SESSION_COOKIE = "cardinal_session";
export const SESSION_MAX_AGE = 43200; // 12h en segundos

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${SESSION_MAX_AGE}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`;
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) {
      const value = rest.join("=");
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

export async function getSessionUser(req: Request, jwtSecret: string): Promise<string | null> {
  const token = readCookie(req.headers.get("cookie"), SESSION_COOKIE);
  if (!token) return null;
  const session = await verifySession(jwtSecret, token);
  return session?.user ?? null;
}
```

- [ ] **Step 6: Implementar routes.ts**

Crear `backend/src/auth/routes.ts`:

```ts
import type { Config } from "../config";
import { json } from "../http";
import { signSession } from "./jwt";
import { clearSessionCookie, getSessionUser, sessionCookie } from "./session";

export async function handleLogin(req: Request, config: Config): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const { user, password } = (body ?? {}) as { user?: unknown; password?: unknown };
  const passwordOk =
    typeof password === "string" &&
    (await Bun.password.verify(password, config.adminPasswordHash).catch(() => false));
  if (user !== config.adminUser || !passwordOk) {
    return json({ error: "invalid_credentials" }, 401);
  }
  const token = await signSession(config.jwtSecret, config.adminUser);
  return json({ user: config.adminUser }, 200, { "set-cookie": sessionCookie(token) });
}

export function handleLogout(): Response {
  return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
}

export async function handleMe(req: Request, config: Config): Promise<Response> {
  const user = await getSessionUser(req, config.jwtSecret);
  if (!user) return json({ error: "unauthorized" }, 401);
  return json({ user });
}
```

- [ ] **Step 7: Correr el test y verificar que pasa**

Ejecutar: `bun test backend/src/auth/auth.test.ts`
Esperado: PASS — 12 tests, 0 fail.

- [ ] **Step 8: Commit**

```bash
git add backend/src/http.ts backend/src/auth/jwt.ts backend/src/auth/session.ts backend/src/auth/routes.ts backend/src/auth/auth.test.ts
git commit -m "feat: JWT session auth with login/logout/me routes"
```

---

### Task 6: WS protocol module (TDD)

**Files:**
- Create: `backend/src/ws/protocol.test.ts`
- Create: `backend/src/ws/protocol.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/src/ws/protocol.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { parseClientMessage, resolveKind } from "./protocol";

describe("parseClientMessage", () => {
  test("hello applies defaults for device and status", () => {
    const r = parseClientMessage('{"type":"hello","key":"k"}');
    expect(r).toEqual({
      ok: true,
      msg: { type: "hello", key: "k", device: "unknown", status: "idle" },
    });
  });

  test("hello preserves explicit device and status", () => {
    const r = parseClientMessage(
      '{"type":"hello","key":"k","device":"pc","status":"busy"}',
    );
    expect(r).toEqual({
      ok: true,
      msg: { type: "hello", key: "k", device: "pc", status: "busy" },
    });
  });

  test("pong without status", () => {
    expect(parseClientMessage('{"type":"pong"}')).toEqual({
      ok: true,
      msg: { type: "pong" },
    });
  });

  test("pong with status", () => {
    expect(parseClientMessage('{"type":"pong","status":"busy"}')).toEqual({
      ok: true,
      msg: { type: "pong", status: "busy" },
    });
  });

  test("bye", () => {
    expect(parseClientMessage('{"type":"bye"}')).toEqual({
      ok: true,
      msg: { type: "bye" },
    });
  });

  test("subscribe", () => {
    expect(parseClientMessage('{"type":"subscribe"}')).toEqual({
      ok: true,
      msg: { type: "subscribe" },
    });
  });

  test("invalid JSON returns not ok", () => {
    expect(parseClientMessage("{oops")).toEqual({ ok: false });
  });

  test("unknown type returns not ok", () => {
    expect(parseClientMessage('{"type":"task"}')).toEqual({ ok: false });
  });

  test("hello with invalid status enum returns not ok", () => {
    expect(parseClientMessage('{"type":"hello","key":"k","status":"sleeping"}')).toEqual({
      ok: false,
    });
  });

  test("hello without key returns not ok", () => {
    expect(parseClientMessage('{"type":"hello"}')).toEqual({ ok: false });
  });
});

describe("resolveKind", () => {
  test.each([
    ["pc", null, "agent"],
    ["localhost", null, "subagent"],
    ["localhost", "agent", "agent"],
    ["pc", "subagent", "subagent"],
  ] as const)("%s + %s -> %s", (device, override, expected) => {
    expect(resolveKind(device, override)).toBe(expected);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Ejecutar: `bun test backend/src/ws/protocol.test.ts`
Esperado: FAIL con `error: Cannot find module "./protocol"` (el módulo aún no existe).

- [ ] **Step 3: Implementar protocol.ts**

Crear `backend/src/ws/protocol.ts` (`AgentKind` se importa con `import type` por `verbatimModuleSyntax`):

```ts
import { z } from "zod";
import type { AgentKind } from "../db/repos";

const helloSchema = z.object({
  type: z.literal("hello"),
  key: z.string().min(1),
  device: z.string().min(1).default("unknown"),
  status: z.enum(["idle", "busy"]).default("idle"),
});
const pongSchema = z.object({
  type: z.literal("pong"),
  status: z.enum(["idle", "busy"]).optional(),
});
const byeSchema = z.object({ type: z.literal("bye") });
const subscribeSchema = z.object({ type: z.literal("subscribe") });

export const clientMessageSchema = z.discriminatedUnion("type", [
  helloSchema,
  pongSchema,
  byeSchema,
  subscribeSchema,
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ParseResult = { ok: true; msg: ClientMessage } | { ok: false };

export function parseClientMessage(raw: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false };
  }
  const parsed = clientMessageSchema.safeParse(data);
  return parsed.success ? { ok: true, msg: parsed.data } : { ok: false };
}

export function resolveKind(device: string, override: AgentKind | null): AgentKind {
  return override ?? (device === "localhost" ? "subagent" : "agent");
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Ejecutar: `bun test backend/src/ws/protocol.test.ts`
Esperado: PASS — 14 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ws/protocol.ts backend/src/ws/protocol.test.ts
git commit -m "feat: websocket client protocol schemas and parser"
```
### Task 7: WS Hub (TDD con sockets mockeados)

**Files:**
- Test: `backend/src/ws/hub.test.ts`
- Implementación: `backend/src/ws/hub.ts`

**Depende de:** `backend/src/db/index.ts` (`createDb`), `backend/src/db/repos.ts`, `backend/src/keys/index.ts` y `backend/src/ws/protocol.ts` (tasks previas — usar los nombres EXACTOS del contrato compartido).

El Hub es el corazón WebSocket del Cardinal: los agentes se identifican con `hello`+key, los dashboards con `subscribe` (pre-autenticados por cookie en el upgrade). El Cardinal es **pasivo**: solo envía `ping`, nunca inicia trabajo. Los tests se escriben **sin servidor real**, con un mock de `ServerWebSocket<ConnData>` que captura `send`/`close`.

- [ ] **Step 1: Escribir el test que falla** — crear `backend/src/ws/hub.test.ts` con los 10 casos del protocolo:

  1. `hello` con key válida → `welcome` + `connected=1` + evento `connect`.
  2. `hello` con key mal formada Y con key bien formada pero desconocida → `auth_failed` + close 4401.
  3. Clasificación: `device:"localhost"` → kind `subagent`; `device:"pc"` con `kindOverride:"subagent"` en la key → kind `subagent`.
  4. Mensaje inválido (no JSON / type desconocido) → `invalid_message` + close 4400.
  5. `subscribe` sin `dashboardAuthed` → `auth_failed` + close 4401.
  6. `subscribe` autenticado → `roster` snapshot; al conectar un agente, el dashboard recibe `agent_update`.
  7. `pong` con status nuevo → update + evento `status` + broadcast; `pong` con mismo status → sin evento nuevo.
  8. `bye` → `connected=0` + evento `disconnect` + broadcast + close 1000.
  9. Ping timeout (interval 30ms, `Bun.sleep(95)`) → agente desconectado + close con reason `ping_timeout`.
  10. Doble `hello` del mismo agente → la socket vieja se cierra con 4000 `replaced`; su `close` tardío NO desconecta al agente (guardia anti-replace); el `close` de la sesión activa sí.

  ```ts
  import { afterEach, describe, expect, test } from "bun:test";
  import type { Database } from "bun:sqlite";
  import type { ServerWebSocket } from "bun";
  import { createDb } from "../db/index";
  import { createAgentKey, getAgent, listEvents, registerAgent } from "../db/repos";
  import { hashKey } from "../keys/index";
  import { Hub } from "./hub";
  import type { ConnData } from "./hub";

  const TEST_KEY = "sk-cardinal-" + "ab".repeat(32);

  function mockWs(data: Partial<ConnData> = {}) {
    const sent: unknown[] = [];
    const closed: Array<{ code?: number; reason?: string }> = [];
    const ws = {
      data: { dashboardAuthed: false, role: null, agentName: null, ...data },
      send: (s: string) => sent.push(JSON.parse(s)),
      close: (code?: number, reason?: string) => closed.push({ code, reason }),
    } as unknown as ServerWebSocket<ConnData>;
    return { ws, sent, closed };
  }

  const hubs: Hub[] = [];
  const dbs: Database[] = [];

  function makeHub(opts: { pingIntervalMs?: number; kindOverride?: "agent" | "subagent" } = {}) {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, {
      keyHash: hashKey(TEST_KEY),
      agentName: "shinon",
      ...(opts.kindOverride ? { kindOverride: opts.kindOverride } : {}),
    });
    const hub = new Hub(db, { pingIntervalMs: opts.pingIntervalMs ?? 30_000 });
    hubs.push(hub);
    dbs.push(db);
    return { db, hub };
  }

  afterEach(() => {
    for (const hub of hubs) hub.dispose();
    for (const db of dbs) db.close();
    hubs.length = 0;
    dbs.length = 0;
  });

  describe("Hub", () => {
    test("hello con key válida → welcome, agente conectado y evento connect", () => {
      const { db, hub } = makeHub();
      const { ws, sent } = mockWs();
      hub.websocket.message(ws, JSON.stringify({ type: "hello", key: TEST_KEY, device: "pc", status: "idle" }));

      expect(sent[0]).toEqual({ type: "welcome", agent: "shinon", kind: "agent" });
      const row = getAgent(db, "shinon");
      expect(row?.connected).toBe(1);
      expect(row?.device).toBe("pc");
      expect(row?.kind).toBe("agent");
      expect(listEvents(db, "shinon").some((e) => e.type === "connect")).toBe(true);
    });

    test("hello con key inválida (formato malo o desconocida) → auth_failed + close 4401", () => {
      const { hub } = makeHub();

      const badFormat = mockWs();
      hub.websocket.message(badFormat.ws, JSON.stringify({ type: "hello", key: "not-a-key", device: "pc" }));
      expect(badFormat.sent[0]).toEqual({ type: "error", reason: "auth_failed" });
      expect(badFormat.closed[0]).toEqual({ code: 4401, reason: "auth_failed" });

      const unknown = mockWs();
      hub.websocket.message(unknown.ws, JSON.stringify({ type: "hello", key: "sk-cardinal-" + "cd".repeat(32), device: "pc" }));
      expect(unknown.sent[0]).toEqual({ type: "error", reason: "auth_failed" });
      expect(unknown.closed[0]).toEqual({ code: 4401, reason: "auth_failed" });
    });

    test("clasificación: localhost → subagent; kind_override de la key gana al device", () => {
      const a = makeHub();
      const local = mockWs();
      a.hub.websocket.message(local.ws, JSON.stringify({ type: "hello", key: TEST_KEY, device: "localhost" }));
      expect(local.sent[0]).toEqual({ type: "welcome", agent: "shinon", kind: "subagent" });
      expect(getAgent(a.db, "shinon")?.kind).toBe("subagent");

      const b = makeHub({ kindOverride: "subagent" });
      const pc = mockWs();
      b.hub.websocket.message(pc.ws, JSON.stringify({ type: "hello", key: TEST_KEY, device: "pc" }));
      expect(pc.sent[0]).toEqual({ type: "welcome", agent: "shinon", kind: "subagent" });
      expect(getAgent(b.db, "shinon")?.kind).toBe("subagent");
    });

    test("mensaje inválido (no JSON o type desconocido) → invalid_message + close 4400", () => {
      const { hub } = makeHub();

      const notJson = mockWs();
      hub.websocket.message(notJson.ws, "{oops");
      expect(notJson.sent[0]).toEqual({ type: "error", reason: "invalid_message" });
      expect(notJson.closed[0]).toEqual({ code: 4400, reason: "invalid_message" });

      const unknownType = mockWs();
      hub.websocket.message(unknownType.ws, JSON.stringify({ type: "task" }));
      expect(unknownType.sent[0]).toEqual({ type: "error", reason: "invalid_message" });
      expect(unknownType.closed[0]).toEqual({ code: 4400, reason: "invalid_message" });
    });

    test("subscribe sin dashboardAuthed → auth_failed + close 4401", () => {
      const { hub } = makeHub();
      const { ws, sent, closed } = mockWs({ dashboardAuthed: false });
      hub.websocket.message(ws, JSON.stringify({ type: "subscribe" }));
      expect(sent[0]).toEqual({ type: "error", reason: "auth_failed" });
      expect(closed[0]).toEqual({ code: 4401, reason: "auth_failed" });
    });

    test("subscribe autenticado → roster, y agent_update cuando conecta un agente", () => {
      const { hub } = makeHub();
      const dash = mockWs({ dashboardAuthed: true });
      hub.websocket.message(dash.ws, JSON.stringify({ type: "subscribe" }));

      const roster = dash.sent[0] as { type: string; agents: Array<Record<string, unknown>> };
      expect(roster.type).toBe("roster");
      expect(roster.agents).toHaveLength(1);
      expect(roster.agents[0]).toMatchObject({ name: "shinon", connected: false });

      const agent = mockWs();
      hub.websocket.message(agent.ws, JSON.stringify({ type: "hello", key: TEST_KEY, device: "pc" }));

      const update = dash.sent[1] as { type: string; agent: Record<string, unknown> };
      expect(update.type).toBe("agent_update");
      expect(update.agent).toMatchObject({ name: "shinon", connected: true });
    });

    test("pong con status nuevo actualiza + evento + broadcast; mismo status no emite evento", () => {
      const { db, hub } = makeHub();
      const dash = mockWs({ dashboardAuthed: true });
      hub.websocket.message(dash.ws, JSON.stringify({ type: "subscribe" }));

      const agent = mockWs();
      hub.websocket.message(agent.ws, JSON.stringify({ type: "hello", key: TEST_KEY, device: "pc" }));

      hub.websocket.message(agent.ws, JSON.stringify({ type: "pong", status: "busy" }));
      expect(getAgent(db, "shinon")?.status).toBe("busy");
      expect(listEvents(db, "shinon").filter((e) => e.type === "status")).toHaveLength(1);
      const broadcast = dash.sent[dash.sent.length - 1] as { type: string; agent: { status: string } };
      expect(broadcast.type).toBe("agent_update");
      expect(broadcast.agent.status).toBe("busy");

      const dashCount = dash.sent.length;
      hub.websocket.message(agent.ws, JSON.stringify({ type: "pong", status: "busy" }));
      expect(listEvents(db, "shinon").filter((e) => e.type === "status")).toHaveLength(1);
      expect(dash.sent).toHaveLength(dashCount);
    });

    test("bye → desconecta, evento disconnect, broadcast y close 1000", () => {
      const { db, hub } = makeHub();
      const dash = mockWs({ dashboardAuthed: true });
      hub.websocket.message(dash.ws, JSON.stringify({ type: "subscribe" }));

      const agent = mockWs();
      hub.websocket.message(agent.ws, JSON.stringify({ type: "hello", key: TEST_KEY, device: "pc" }));
      hub.websocket.message(agent.ws, JSON.stringify({ type: "bye" }));

      expect(getAgent(db, "shinon")?.connected).toBe(0);
      expect(listEvents(db, "shinon").some((e) => e.type === "disconnect")).toBe(true);
      expect(agent.closed[0]).toEqual({ code: 1000, reason: "bye" });
      const last = dash.sent[dash.sent.length - 1] as { type: string; agent: { connected: boolean } };
      expect(last.type).toBe("agent_update");
      expect(last.agent.connected).toBe(false);
    });

    test("dos pings sin pong → desconecta y cierra con ping_timeout", async () => {
      const { db, hub } = makeHub({ pingIntervalMs: 30 });
      const agent = mockWs();
      hub.websocket.message(agent.ws, JSON.stringify({ type: "hello", key: TEST_KEY, device: "pc" }));
      expect(getAgent(db, "shinon")?.connected).toBe(1);

      await Bun.sleep(95);

      expect(getAgent(db, "shinon")?.connected).toBe(0);
      expect(agent.closed[0]).toEqual({ code: 4000, reason: "ping_timeout" });
      expect(agent.sent.some((m) => (m as { type: string }).type === "ping")).toBe(true);
      expect(listEvents(db, "shinon").some((e) => e.type === "disconnect")).toBe(true);
    });

    test("doble hello: la sesión vieja se cierra 'replaced' y su close tardío no desconecta al agente", () => {
      const { db, hub } = makeHub();
      const first = mockWs();
      hub.websocket.message(first.ws, JSON.stringify({ type: "hello", key: TEST_KEY, device: "pc" }));
      expect(first.sent[0]).toEqual({ type: "welcome", agent: "shinon", kind: "agent" });

      const second = mockWs();
      hub.websocket.message(second.ws, JSON.stringify({ type: "hello", key: TEST_KEY, device: "pc" }));
      expect(first.closed[0]).toEqual({ code: 4000, reason: "replaced" });
      expect(second.sent[0]).toEqual({ type: "welcome", agent: "shinon", kind: "agent" });
      expect(getAgent(db, "shinon")?.connected).toBe(1);

      // Guardia anti-replace: el close de la socket vieja NO desconecta
      hub.websocket.close(first.ws);
      expect(getAgent(db, "shinon")?.connected).toBe(1);

      // El close de la sesión activa SÍ desconecta
      hub.websocket.close(second.ws);
      expect(getAgent(db, "shinon")?.connected).toBe(0);
    });
  });
  ```

- [ ] **Step 2: Correr el test y verificar que FALLA**

  ```bash
  bun test backend/src/ws/hub.test.ts
  ```

  Esperado: falla al importar (`Cannot find module "./hub"`) — `backend/src/ws/hub.ts` todavía no existe.

- [ ] **Step 3: Implementar `backend/src/ws/hub.ts`** — seguir el comportamiento del contrato EXACTAMENTE (mapas `agents`/`timers`/`missed`/`dashboards`, routing por mensaje, `disconnectAgent`/`teardownAgent`, ping loop con contador `missed`, broadcast a dashboards, `dispose()`):

  ```ts
  import type { Database } from "bun:sqlite";
  import type { ServerWebSocket } from "bun";
  import {
    findActiveKeyByHash,
    getAgent,
    insertEvent,
    listAgents,
    markAgentDisconnected,
    touchKey,
    updateAgentStatus,
    upsertAgentOnConnect,
  } from "../db/repos";
  import type { AgentRow } from "../db/repos";
  import { hashKey, isKeyFormat } from "../keys/index";
  import { parseClientMessage, resolveKind } from "./protocol";

  export interface ConnData {
    dashboardAuthed: boolean;
    role: "agent" | "dashboard" | null;
    agentName: string | null;
  }

  export interface AgentPayload {
    name: string;
    device: string;
    kind: string;
    status: string;
    connected: boolean;
    lastSeen: string | null;
  }

  export function agentToPayload(row: AgentRow): AgentPayload {
    return {
      name: row.name,
      device: row.device,
      kind: row.kind,
      status: row.status,
      connected: row.connected === 1,
      lastSeen: row.last_seen,
    };
  }

  type WS = ServerWebSocket<ConnData>;
  type Timer = ReturnType<typeof setInterval>;

  export class Hub {
    private agents = new Map<string, WS>();
    private timers = new Map<string, Timer>();
    private missed = new Map<string, number>();
    private dashboards = new Set<WS>();

    constructor(
      private db: Database,
      private opts: { pingIntervalMs: number },
    ) {}

    readonly websocket = {
      message: (ws: WS, raw: string | Buffer): void => this.onMessage(ws, raw),
      close: (ws: WS): void => this.onClose(ws),
    };

    dispose(): void {
      for (const timer of this.timers.values()) clearInterval(timer);
      this.timers.clear();
      this.agents.clear();
      this.missed.clear();
      this.dashboards.clear();
    }

    private onMessage(ws: WS, raw: string | Buffer): void {
      const parsed = parseClientMessage(typeof raw === "string" ? raw : raw.toString());
      if (!parsed.ok) {
        this.fail(ws, 4400, "invalid_message");
        return;
      }
      const msg = parsed.msg;
      switch (msg.type) {
        case "hello":
          this.onHello(ws, msg.key, msg.device, msg.status);
          break;
        case "subscribe":
          this.onSubscribe(ws);
          break;
        case "pong":
          this.onPong(ws, msg.status);
          break;
        case "bye":
          this.onBye(ws);
          break;
      }
    }

    private onHello(ws: WS, key: string, device: string, status: "idle" | "busy"): void {
      if (ws.data.role !== null) {
        this.send(ws, { type: "error", reason: "already_identified" });
        return;
      }
      if (!isKeyFormat(key)) {
        this.fail(ws, 4401, "auth_failed");
        return;
      }
      const keyRow = findActiveKeyByHash(this.db, hashKey(key));
      if (!keyRow) {
        this.fail(ws, 4401, "auth_failed");
        return;
      }
      touchKey(this.db, keyRow.id);

      const name = keyRow.agent_name;
      const kind = resolveKind(device, keyRow.kind_override);

      // Si ya hay sesión activa con este nombre, se reemplaza
      const previous = this.agents.get(name);
      if (previous) {
        this.teardownAgent(name);
        previous.close(4000, "replaced");
      }

      ws.data.role = "agent";
      ws.data.agentName = name;
      this.agents.set(name, ws);
      this.missed.set(name, 0);

      upsertAgentOnConnect(this.db, { name, device, kind, status });
      insertEvent(this.db, { agentName: name, type: "connect", meta: device });

      this.send(ws, { type: "welcome", agent: name, kind });
      this.broadcastAgent(name);
      this.startPing(name);
    }

    private onSubscribe(ws: WS): void {
      if (ws.data.role !== null) {
        this.send(ws, { type: "error", reason: "already_identified" });
        return;
      }
      if (!ws.data.dashboardAuthed) {
        this.fail(ws, 4401, "auth_failed");
        return;
      }
      ws.data.role = "dashboard";
      this.dashboards.add(ws);
      this.send(ws, { type: "roster", agents: listAgents(this.db).map(agentToPayload) });
    }

    private onPong(ws: WS, status: "idle" | "busy" | undefined): void {
      if (ws.data.role !== "agent" || ws.data.agentName === null) return;
      const name = ws.data.agentName;
      this.missed.set(name, 0);

      const current = getAgent(this.db, name)?.status ?? "idle";
      const next = status ?? current;
      updateAgentStatus(this.db, name, next); // siempre refresca last_seen
      if (next !== current) {
        insertEvent(this.db, { agentName: name, type: "status", meta: next });
        this.broadcastAgent(name);
      }
    }

    private onBye(ws: WS): void {
      if (ws.data.role !== "agent" || ws.data.agentName === null) return;
      this.disconnectAgent(ws.data.agentName);
      ws.close(1000, "bye");
    }

    private onClose(ws: WS): void {
      if (ws.data.role === "dashboard") {
        this.dashboards.delete(ws);
        return;
      }
      if (ws.data.role !== "agent" || ws.data.agentName === null) return;
      // Guardia anti-replace: solo desconectar si esta socket sigue siendo la sesión activa
      if (this.agents.get(ws.data.agentName) === ws) {
        this.disconnectAgent(ws.data.agentName);
      }
    }

    private disconnectAgent(name: string): void {
      this.teardownAgent(name);
      markAgentDisconnected(this.db, name);
      insertEvent(this.db, { agentName: name, type: "disconnect" });
      this.broadcastAgent(name);
    }

    private teardownAgent(name: string): void {
      const timer = this.timers.get(name);
      if (timer !== undefined) clearInterval(timer);
      this.timers.delete(name);
      this.missed.delete(name);
      this.agents.delete(name);
    }

    private startPing(name: string): void {
      const timer = setInterval(() => {
        const ws = this.agents.get(name);
        if (!ws) return;
        const count = (this.missed.get(name) ?? 0) + 1;
        this.missed.set(name, count);
        if (count >= 2) {
          this.disconnectAgent(name);
          ws.close(4000, "ping_timeout");
        } else {
          this.send(ws, { type: "ping" });
        }
      }, this.opts.pingIntervalMs);
      this.timers.set(name, timer);
    }

    private broadcastAgent(name: string): void {
      const row = getAgent(this.db, name);
      if (!row) return;
      const payload = JSON.stringify({ type: "agent_update", agent: agentToPayload(row) });
      for (const dash of this.dashboards) dash.send(payload);
    }

    private send(ws: WS, data: unknown): void {
      ws.send(JSON.stringify(data));
    }

    private fail(ws: WS, code: number, reason: string): void {
      this.send(ws, { type: "error", reason });
      ws.close(code, reason);
    }
  }
  ```

  Notas de implementación:
  - `readonly websocket` usa arrow functions para que `this` quede bindeado al pasarlo a `Bun.serve({ websocket: hub.websocket })` en la task del server.
  - `onSubscribe` también rechaza con `already_identified` si la conexión ya tenía rol: el primer mensaje determina el rol (spec §4), un segundo mensaje identificador es error de protocolo.
  - `onPong` llama a `updateAgentStatus` siempre (refresca `last_seen` aunque el status no cambie) pero solo inserta evento + broadcast cuando cambia.
  - `dispose()` es imprescindible para que los tests no dejen intervalos vivos.

- [ ] **Step 4: Correr el test y verificar que PASA**

  ```bash
  bun test backend/src/ws/hub.test.ts
  ```

  Esperado: 10 tests en verde (`10 pass, 0 fail`). Verificar también que no se rompió lo anterior con `bun test backend/src`.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/src/ws/hub.ts backend/src/ws/hub.test.ts && git commit -m "feat(backend): WS hub — agent protocol (hello/pong/bye), ping watchdog, dashboard broadcast"
  ```

---

### Task 8: API handlers — health + agents REST (TDD)

**Files:**
- Test: `backend/src/api/api.test.ts`
- Implementación: `backend/src/api/health.ts`, `backend/src/api/agents.ts`

**Depende de:** `backend/src/http.ts` (`json()`), `backend/src/ws/hub.ts` (`agentToPayload`, Task 7), `backend/src/db/repos.ts` y el `package.json` raíz con `version: "0.0.1"` (tasks previas). Requiere `resolveJsonModule: true` en `backend/tsconfig.json` para importar el `package.json` raíz.

Handlers REST puros (reciben `db` por parámetro, devuelven `Response`): `/api/health` público con la versión leída del `package.json` raíz (source of truth del versionado), roster completo y detalle de agente con sus últimos 20 eventos.

- [ ] **Step 1: Escribir el test que falla** — crear `backend/src/api/api.test.ts`:

  ```ts
  import { describe, expect, test } from "bun:test";
  import { createDb } from "../db/index";
  import { insertEvent, registerAgent, upsertAgentOnConnect } from "../db/repos";
  import { handleHealth } from "./health";
  import { handleGetAgent, handleListAgents } from "./agents";
  import rootPkg from "../../../package.json";

  describe("handleHealth", () => {
    test("200 con status ok y la versión del package.json raíz", async () => {
      const res = handleHealth();
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
      const body = await res.json();
      expect(body).toEqual({ status: "ok", version: rootPkg.version });
      expect(rootPkg.version).toBe("0.0.1");
    });
  });

  describe("handleListAgents", () => {
    test("DB vacía → {agents: []}", async () => {
      const db = createDb(":memory:");
      const res = handleListAgents(db);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ agents: [] });
      db.close();
    });

    test("con un agente conectado → AgentPayload con connected boolean y lastSeen string", async () => {
      const db = createDb(":memory:");
      registerAgent(db, "shinon", "agent");
      upsertAgentOnConnect(db, { name: "shinon", device: "pc", kind: "agent", status: "idle" });

      const res = handleListAgents(db);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { agents: Array<Record<string, unknown>> };
      expect(body.agents).toHaveLength(1);
      const shinon = body.agents[0];
      expect(shinon).toMatchObject({ name: "shinon", device: "pc", kind: "agent", status: "idle" });
      expect(shinon.connected).toBe(true);
      expect(typeof shinon.lastSeen).toBe("string");
      db.close();
    });
  });

  describe("handleGetAgent", () => {
    test("agente desconocido → 404 {error: 'not_found'}", async () => {
      const db = createDb(":memory:");
      const res = handleGetAgent(db, "nobody");
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "not_found" });
      db.close();
    });

    test("agente conocido → 200 con agent y últimos 20 eventos en DESC", async () => {
      const db = createDb(":memory:");
      registerAgent(db, "shinon", "agent");
      upsertAgentOnConnect(db, { name: "shinon", device: "pc", kind: "agent", status: "idle" });
      for (let i = 1; i <= 25; i++) {
        insertEvent(db, { agentName: "shinon", type: "status", meta: `s${i}` });
      }

      const res = handleGetAgent(db, "shinon");
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        agent: Record<string, unknown>;
        events: Array<{ id: number; meta: string }>;
      };
      expect(body.agent).toMatchObject({ name: "shinon", connected: true });
      expect(body.events).toHaveLength(20);
      expect(body.events[0].meta).toBe("s25"); // el más reciente primero (DESC)
      expect(body.events[19].meta).toBe("s6");
      db.close();
    });
  });
  ```

- [ ] **Step 2: Correr el test y verificar que FALLA**

  ```bash
  bun test backend/src/api/api.test.ts
  ```

  Esperado: falla al importar (`Cannot find module "./health"`) — los handlers todavía no existen.

- [ ] **Step 3: Implementar `backend/src/api/health.ts`** — la versión se importa del `package.json` raíz (path desde `backend/src/api/` es `../../../package.json`):

  ```ts
  import { json } from "../http";
  import rootPkg from "../../../package.json";

  export function handleHealth(): Response {
    return json({ status: "ok", version: rootPkg.version });
  }
  ```

- [ ] **Step 4: Implementar `backend/src/api/agents.ts`** — usa `json()` de `../http`, `agentToPayload` de `../ws/hub` y los repos de `../db/repos`:

  ```ts
  import type { Database } from "bun:sqlite";
  import { json } from "../http";
  import { getAgent, listAgents, listEvents } from "../db/repos";
  import { agentToPayload } from "../ws/hub";

  export function handleListAgents(db: Database): Response {
    return json({ agents: listAgents(db).map(agentToPayload) });
  }

  export function handleGetAgent(db: Database, name: string): Response {
    const row = getAgent(db, name);
    if (!row) return json({ error: "not_found" }, 404);
    return json({ agent: agentToPayload(row), events: listEvents(db, name, 20) });
  }
  ```

- [ ] **Step 5: Correr el test y verificar que PASA**

  ```bash
  bun test backend/src/api/api.test.ts
  ```

  Esperado: 5 tests en verde (`5 pass, 0 fail`). Verificar también la suite completa con `bun test backend/src`.

- [ ] **Step 6: Commit**

  ```bash
  git add backend/src/api/health.ts backend/src/api/agents.ts backend/src/api/api.test.ts && git commit -m "feat(backend): health + agents REST handlers (roster, detail, version)"
  ```
### Task 9: Static file serving (TDD)

**Files:**
- Create: `backend/src/static.test.ts`
- Create: `backend/src/static.ts`

Sirve el build de Vite (`frontend/dist`) con fallback SPA: cualquier ruta GET desconocida devuelve `index.html` para que el router de React maneje la navegación client-side. Incluye protección anti path-traversal. La firma exacta es la del contrato: `serveStatic(req, staticDir): Promise<Response>`.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/src/static.test.ts`. El `beforeAll` arma un directorio temporal real con `index.html` y `app.js`; el `afterAll` lo limpia.

```ts
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveStatic } from "./static";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "cardinal-static-"));
  writeFileSync(join(dir, "index.html"), "<h1>cardinal</h1>");
  writeFileSync(join(dir, "app.js"), "console.log(1)");
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function get(path: string, staticDir = dir): Promise<Response> {
  return serveStatic(new Request(`http://localhost${path}`), staticDir);
}

test("serves an existing file by path", async () => {
  const res = await get("/app.js");
  expect(res.status).toBe(200);
  expect(await res.text()).toBe("console.log(1)");
});

test("SPA fallback serves index.html for unknown routes", async () => {
  const res = await get("/some/spa/route");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/html");
  expect(await res.text()).toBe("<h1>cardinal</h1>");
});

test("GET / serves index.html", async () => {
  const res = await get("/");
  expect(res.status).toBe(200);
  expect(await res.text()).toBe("<h1>cardinal</h1>");
});

test("returns 404 when staticDir does not exist", async () => {
  const res = await get("/app.js", "/nonexistent-cardinal-static-dir");
  expect(res.status).toBe(404);
});

test("path traversal cannot escape staticDir", async () => {
  // %2e%2e sobrevive al parser de URL; decodeURIComponent lo expone como ".."
  const res = await get("/%2e%2e/%2e%2e/etc/passwd");
  expect(res.status).toBe(200);
  expect(await res.text()).toBe("<h1>cardinal</h1>"); // cae al fallback, nunca sirve /etc/passwd
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
bun test backend/src/static.test.ts
```

Esperado: FAIL con `error: Cannot find module "./static"` (el archivo de implementación todavía no existe).

- [ ] **Step 3: Implementar `backend/src/static.ts`**

```ts
import { join, normalize } from "node:path";

export async function serveStatic(req: Request, staticDir: string): Promise<Response> {
  const { pathname } = new URL(req.url);

  // Anti-traversal: normalize resolves ".." segments; strip whatever remains at
  // the start (leading "../" or slashes) so the path always stays inside staticDir.
  let rel = normalize(decodeURIComponent(pathname))
    .replace(/^(\.\.(\/|\\|$))+/, "")
    .replace(/^(\/|\\)+/, "");
  if (rel === "" || rel === ".") rel = "index.html";

  const file = Bun.file(join(staticDir, rel));
  if (await file.exists()) return new Response(file);

  // SPA fallback: unknown routes get index.html (client-side routing).
  const index = Bun.file(join(staticDir, "index.html"));
  if (await index.exists()) {
    return new Response(index, { headers: { "content-type": "text/html" } });
  }

  return new Response("not found", { status: 404 });
}
```

Notas de implementación:
- `normalize()` resuelve los segmentos `..` sobre el path absoluto (un `/../../etc/passwd` decodificado queda `/etc/passwd`); los dos `replace` posteriores quitan cualquier resto inicial y convierten el path en relativo a `staticDir`, por lo que `join()` jamás escapa del directorio.
- `Bun.file(...).exists()` no lee el archivo: el `Response` sirve el contenido en streaming y Bun setea el content-type por extensión (`app.js` → javascript, `.html` → text/html).
- El fallback fuerza `content-type: text/html` explícitamente porque la ruta pedida (`/some/spa/route`) no tiene extensión.

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
bun test backend/src/static.test.ts
```

Esperado: 5 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add backend/src/static.ts backend/src/static.test.ts
git commit -m "feat: add static file serving with SPA fallback"
```

---

### Task 10: Server assembly + end-to-end integration tests (TDD)

**Files:**
- Create: `backend/src/server.test.ts`
- Create: `backend/src/server.ts`
- Create: `backend/src/index.ts`

Acá el orden TDD es estricto: primero el test de integración completo (falla porque `server.ts` no existe), después la implementación. El test levanta el servidor real en puerto efímero (`port: 0`) con DB en memoria y ejercita HTTP + WebSocket end-to-end: health, login/cookie, REST protegido, flujo de agente (hello → welcome → pong → bye), flujo de dashboard (subscribe → roster → agent_update), key inválida, clasificación localhost → subagent y ping timeout (en una instancia dedicada con `pingIntervalMs: 40`).

- [ ] **Step 1: Escribir el test de integración que falla**

Crear `backend/src/server.test.ts`:

```ts
import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import type { Config } from "./config";
import { createDb } from "./db/index";
import { createAgentKey, getAgent, registerAgent } from "./db/repos";
import { generateKey, hashKey } from "./keys";
import { createServer } from "./server";

const TEST_KEY = generateKey();
const LOCAL_KEY = generateKey();

let server: ReturnType<typeof createServer>;
let port: number;
let db: Database;

function testConfig(hash: string): Config {
  return {
    port: 0,
    dbPath: ":memory:",
    adminUser: "admin",
    adminPasswordHash: hash,
    jwtSecret: "it-secret",
    staticDir: "/nonexistent",
    pingIntervalMs: 10_000,
  };
}

beforeAll(async () => {
  const passwordHash = await Bun.password.hash("sao123");
  db = createDb(":memory:");
  registerAgent(db, "shinon", "agent");
  createAgentKey(db, { keyHash: hashKey(TEST_KEY), agentName: "shinon" });
  registerAgent(db, "localbot", "agent");
  createAgentKey(db, { keyHash: hashKey(LOCAL_KEY), agentName: "localbot" });
  server = createServer(testConfig(passwordHash), db);
  port = server.port;
});

afterAll(() => {
  server.stop(true);
});

function connectWs(cookie?: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `ws://localhost:${port}/ws`,
      cookie ? ({ headers: { cookie } } as never) : undefined,
    );
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(new Error("ws connect failed"));
  });
}

function nextMessage(ws: WebSocket): Promise<any> {
  return new Promise((resolve) => {
    ws.addEventListener("message", function h(ev) {
      ws.removeEventListener("message", h);
      resolve(JSON.parse(String(ev.data)));
    });
  });
}

async function login(): Promise<string> {
  const res = await fetch(`http://localhost:${port}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user: "admin", password: "sao123" }),
  });
  if (!res.ok) throw new Error(`login failed with status ${res.status}`);
  return res.headers.get("set-cookie")!.split(";")[0]!;
}

test("GET /api/health returns status ok and version", async () => {
  const res = await fetch(`http://localhost:${port}/api/health`);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: "ok", version: "0.0.1" });
});

test("auth flow: bad login 401, good login sets cookie, /me with and without cookie", async () => {
  const bad = await fetch(`http://localhost:${port}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user: "admin", password: "wrong" }),
  });
  expect(bad.status).toBe(401);

  const ok = await fetch(`http://localhost:${port}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user: "admin", password: "sao123" }),
  });
  expect(ok.status).toBe(200);
  const cookie = ok.headers.get("set-cookie")!.split(";")[0]!;
  expect(cookie.startsWith("cardinal_session=")).toBe(true);

  const me = await fetch(`http://localhost:${port}/api/auth/me`, { headers: { cookie } });
  expect(me.status).toBe(200);
  expect(await me.json()).toEqual({ user: "admin" });

  const anon = await fetch(`http://localhost:${port}/api/auth/me`);
  expect(anon.status).toBe(401);
});

test("GET /api/agents requires a session cookie", async () => {
  const anon = await fetch(`http://localhost:${port}/api/agents`);
  expect(anon.status).toBe(401);

  const cookie = await login();
  const res = await fetch(`http://localhost:${port}/api/agents`, { headers: { cookie } });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { agents: unknown[] };
  expect(Array.isArray(body.agents)).toBe(true);
});

test("agent flow: hello → welcome → roster → pong status → bye disconnect", async () => {
  const cookie = await login();
  const ws = await connectWs();
  ws.send(JSON.stringify({ type: "hello", key: TEST_KEY, device: "pc", status: "idle" }));
  const welcome = await nextMessage(ws);
  expect(welcome).toEqual({ type: "welcome", agent: "shinon", kind: "agent" });

  const list = await fetch(`http://localhost:${port}/api/agents`, { headers: { cookie } });
  const { agents } = (await list.json()) as { agents: any[] };
  const shinon = agents.find((a: any) => a.name === "shinon");
  expect(shinon.connected).toBe(true);

  ws.send(JSON.stringify({ type: "pong", status: "busy" }));
  await Bun.sleep(30);
  const detail1 = (await (
    await fetch(`http://localhost:${port}/api/agents/shinon`, { headers: { cookie } })
  ).json()) as any;
  expect(detail1.agent.status).toBe("busy");
  expect(detail1.events.length).toBeGreaterThan(0);

  ws.send(JSON.stringify({ type: "bye" }));
  await Bun.sleep(30);
  const detail2 = (await (
    await fetch(`http://localhost:${port}/api/agents/shinon`, { headers: { cookie } })
  ).json()) as any;
  expect(detail2.agent.connected).toBe(false);
  expect(detail2.events.some((e: any) => e.type === "disconnect")).toBe(true);

  ws.close();
});

test("dashboard flow: subscribe → roster, then agent_update on agent hello", async () => {
  const cookie = await login();
  const dash = await connectWs(cookie);
  dash.send(JSON.stringify({ type: "subscribe" }));
  const roster = await nextMessage(dash);
  expect(roster.type).toBe("roster");
  expect(Array.isArray(roster.agents)).toBe(true);

  const agent = await connectWs();
  agent.send(JSON.stringify({ type: "hello", key: TEST_KEY, device: "pc", status: "idle" }));
  const welcome = await nextMessage(agent);
  expect(welcome.type).toBe("welcome");

  const update = await nextMessage(dash);
  expect(update.type).toBe("agent_update");
  expect(update.agent.name).toBe("shinon");
  expect(update.agent.connected).toBe(true);

  agent.send(JSON.stringify({ type: "bye" }));
  await Bun.sleep(30);
  agent.close();
  dash.close();
});

test("hello with an unknown key is rejected with auth_failed", async () => {
  const ws = await connectWs();
  ws.send(
    JSON.stringify({
      type: "hello",
      key: "sk-cardinal-" + "ff".repeat(32),
      device: "pc",
      status: "idle",
    }),
  );
  const msg = await nextMessage(ws);
  expect(msg).toEqual({ type: "error", reason: "auth_failed" });
  ws.close();
});

test("device localhost is classified as subagent", async () => {
  const ws = await connectWs();
  ws.send(JSON.stringify({ type: "hello", key: LOCAL_KEY, device: "localhost", status: "idle" }));
  const welcome = await nextMessage(ws);
  expect(welcome).toEqual({ type: "welcome", agent: "localbot", kind: "subagent" });
  ws.send(JSON.stringify({ type: "bye" }));
  await Bun.sleep(30);
  ws.close();
});

test("ping timeout disconnects an agent that misses 2 pings", async () => {
  const key = generateKey();
  const db2 = createDb(":memory:");
  registerAgent(db2, "pinger", "agent");
  createAgentKey(db2, { keyHash: hashKey(key), agentName: "pinger" });
  const server2 = createServer({ ...testConfig("unused"), pingIntervalMs: 40 }, db2);
  const port2 = server2.port;

  const ws = await new Promise<WebSocket>((resolve, reject) => {
    const sock = new WebSocket(`ws://localhost:${port2}/ws`);
    sock.onopen = () => resolve(sock);
    sock.onerror = () => reject(new Error("ws connect failed"));
  });
  ws.send(JSON.stringify({ type: "hello", key, device: "pc", status: "idle" }));
  // Never pong: after 2 intervals (~80ms) the hub must drop the agent.
  await Bun.sleep(160);

  const row = getAgent(db2, "pinger");
  expect(row?.connected).toBe(0);

  ws.close();
  server2.stop(true);
});
```

Notas:
- Los tests de un mismo archivo corren en serie en `bun test`; que `shinon` se re-conecte entre tests está bien (`hello` sobre un agente desconectado simplemente lo vuelve a conectar).
- Los `Bun.sleep(30)` dan tiempo al roundtrip WS → DB antes de consultar por REST.
- El test de ping timeout usa su propio servidor (`pingIntervalMs: 40`) para no ralentizar al resto; consulta la fila directo por `getAgent` en vez de por HTTP, así no necesita login.

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
bun test backend/src/server.test.ts
```

Esperado: FAIL con `error: Cannot find module "./server"`.

- [ ] **Step 3: Implementar `backend/src/server.ts`**

Routing en el orden EXACTO del contrato. La cookie JWT se valida en el upgrade de `/ws` (el JS del dashboard nunca lee el JWT: viaja httpOnly y el navegador la manda en el handshake).

```ts
import type { Server } from "bun";
import type { Database } from "bun:sqlite";
import type { Config } from "./config";
import { json } from "./http";
import { handleHealth } from "./api/health";
import { handleGetAgent, handleListAgents } from "./api/agents";
import { handleLogin, handleLogout, handleMe } from "./auth/routes";
import { getSessionUser } from "./auth/session";
import { Hub, type ConnData } from "./ws/hub";
import { serveStatic } from "./static";

export function createServer(config: Config, db: Database): Server {
  const hub = new Hub(db, { pingIntervalMs: config.pingIntervalMs });

  return Bun.serve<ConnData>({
    port: config.port,

    async fetch(req, server) {
      const { pathname } = new URL(req.url);
      const method = req.method;

      // WS endpoint: the JWT cookie is validated here, at upgrade time; the
      // first client message (hello vs subscribe) decides the actual role.
      if (method === "GET" && pathname === "/ws") {
        const user = await getSessionUser(req, config.jwtSecret);
        const upgraded = server.upgrade(req, {
          data: { dashboardAuthed: user !== null, role: null, agentName: null },
        });
        return upgraded ? undefined : new Response("upgrade failed", { status: 400 });
      }

      if (pathname === "/api/health") return handleHealth();

      if (pathname === "/api/auth/login" && method === "POST") return handleLogin(req, config);
      if (pathname === "/api/auth/logout" && method === "POST") return handleLogout();
      if (pathname === "/api/auth/me" && method === "GET") return handleMe(req, config);

      if (pathname === "/api/agents" && method === "GET") {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        return handleListAgents(db);
      }

      const agentMatch = pathname.match(/^\/api\/agents\/([^/]+)$/);
      if (agentMatch && method === "GET") {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        return handleGetAgent(db, decodeURIComponent(agentMatch[1]!));
      }

      if (pathname.startsWith("/api/")) return json({ error: "not_found" }, 404);

      if (method === "GET") return serveStatic(req, config.staticDir);

      return json({ error: "method_not_allowed" }, 405);
    },

    websocket: hub.websocket,
  });
}
```

Notas de implementación:
- `server.upgrade(req, { data })` devuelve `boolean`; si tuvo éxito el `fetch` debe devolver `undefined` (Bun se queda con el socket).
- Las rutas protegidas repiten el chequeo de sesión de forma explícita (nada de middleware mágico: el Cardinal es chico y la claridad manda).
- `/api/health` es pública (la usa el footer del dashboard y el deploy para healthcheck).
- Un `POST /api/agents` cae en `/api/*` → 404; un `POST /cualquier-otra-cosa` cae en el 405 final.

- [ ] **Step 4: Implementar `backend/src/index.ts` (entry point)**

```ts
import { loadConfig } from "./config";
import { createDb } from "./db/index";
import { createServer } from "./server";

const config = loadConfig();
const db = createDb(config.dbPath);
const server = createServer(config, db);

console.log(`cardinal-system listening on :${server.port}`);
```

- [ ] **Step 5: Correr el test de integración y verificar que pasa**

```bash
bun test backend/src/server.test.ts
```

Esperado: 8 pass, 0 fail.

- [ ] **Step 6: Correr la suite completa del backend (regresión)**

```bash
bun test backend/src
```

Esperado: todos los tests verdes (config, db, keys, auth, protocol, hub, api, static, server).

- [ ] **Step 7: Commit**

```bash
git add backend/src/server.ts backend/src/index.ts backend/src/server.test.ts
git commit -m "feat: assemble server with end-to-end integration tests"
```

---

### Task 11: Example WS agent + manual smoke test

**Files:**
- Create: `examples/ws-agent.ts`

Cliente WS genérico de referencia: prueba de que el protocolo es el contrato (cualquier websocket normal sirve, no hace falta SDK). Además es la herramienta de desarrollo para tener "un agente vivo" en el dashboard sin levantar nada más. El smoke test manual valida el sistema completo por fuera de `bun test`: keygen → server → agente → REST → desconexión.

- [ ] **Step 1: Crear `examples/ws-agent.ts`**

```ts
/**
 * examples/ws-agent.ts — REFERENCE WebSocket client for the Cardinal agent protocol.
 *
 * THIS IS NOT AN SDK. It is the minimal, generic example of how any agent (in
 * any language, with any standard WebSocket client) talks to the Cardinal:
 *
 *   1. Open a WebSocket to CARDINAL_URL (default ws://localhost:8787/ws).
 *   2. Send `hello` carrying the agent API key — the key IS the identity, the
 *      Cardinal derives the agent name from it (no name field is ever sent).
 *   3. Answer every server `ping` with a `pong` (2 missed pings → dropped).
 *   4. Log `welcome` (assigned name + kind) and `error` messages.
 *   5. If the connection drops, reconnect with linear backoff: min(15000, 500 * attempt).
 *   6. On SIGINT/SIGTERM send `bye`, close with code 1000 and exit 0.
 *
 * Usage:
 *   CARDINAL_AGENT_KEY=sk-cardinal-... CARDINAL_DEVICE=pc bun examples/ws-agent.ts
 */

const CARDINAL_URL = process.env.CARDINAL_URL ?? "ws://localhost:8787/ws";
const CARDINAL_AGENT_KEY = process.env.CARDINAL_AGENT_KEY;
const CARDINAL_DEVICE = process.env.CARDINAL_DEVICE ?? "localhost";

if (!CARDINAL_AGENT_KEY) {
  console.error(
    "[agent] CARDINAL_AGENT_KEY is required (create one with: bun run keygen -- --agent <name>)",
  );
  process.exit(1);
}

let ws: WebSocket | null = null;
let attempt = 0;
let shuttingDown = false;

function send(msg: Record<string, unknown>): void {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function connect(): void {
  console.log(`[agent] connecting to ${CARDINAL_URL} (attempt ${attempt + 1})`);
  ws = new WebSocket(CARDINAL_URL);

  ws.onopen = () => {
    attempt = 0; // reset backoff on a successful connection
    // First message: identity. The Cardinal answers `welcome` or `error`+close.
    send({ type: "hello", key: CARDINAL_AGENT_KEY, device: CARDINAL_DEVICE, status: "idle" });
  };

  ws.onmessage = (ev) => {
    let msg: any;
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      console.warn("[agent] ignoring non-JSON message:", String(ev.data));
      return;
    }
    switch (msg.type) {
      case "welcome":
        console.log(`[agent] welcome as ${msg.agent} (${msg.kind})`);
        break;
      case "ping":
        // The Cardinal pings on an interval; 2 unanswered pings → disconnect.
        send({ type: "pong", status: "idle" });
        break;
      case "error":
        console.error(`[agent] server error: ${msg.reason}`);
        break;
      default:
        console.log("[agent] message:", msg);
    }
  };

  ws.onclose = (ev) => {
    console.log(`[agent] closed (code=${ev.code}${ev.reason ? ` reason=${ev.reason}` : ""})`);
    if (shuttingDown) return;
    attempt += 1;
    const delay = Math.min(15000, 500 * attempt);
    console.log(`[agent] reconnecting in ${delay}ms`);
    setTimeout(connect, delay);
  };

  ws.onerror = () => {
    // onclose handles reconnection; this handler only prevents an uncaught throw.
  };
}

function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("[agent] shutting down: sending bye");
  send({ type: "bye" });
  // Give the bye frame a moment to flush before closing the socket.
  setTimeout(() => {
    ws?.close(1000, "bye");
    process.exit(0);
  }, 100);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

connect();
```

- [ ] **Step 2: Verificación rápida sin servidor**

Sin `CARDINAL_AGENT_KEY` debe fallar rápido y claro:

```bash
bun examples/ws-agent.ts; echo "exit=$?"
```

Esperado: `[agent] CARDINAL_AGENT_KEY is required (create one with: bun run keygen -- --agent <name>)` y `exit=1`.

- [ ] **Step 3: Smoke test — generar la key del agente**

```bash
DB_PATH=/tmp/smoke.db bun backend/src/keys/cli.ts --agent smoke --device pc
```

Esperado: imprime una línea con `sk-cardinal-<64 hex chars>` (la key se muestra UNA sola vez; en `/tmp/smoke.db` solo queda el hash, y el agente `smoke` queda pre-registrado). Exportarla:

```bash
export SMOKE_KEY='sk-cardinal-<pegar-la-key-impresa>'
```

- [ ] **Step 4: Smoke test — configurar el `.env` de la raíz**

Generar los secretos:

```bash
bun -e 'console.log(await Bun.password.hash("sao123"))'
openssl rand -hex 32
```

Crear `.env` en la raíz del repo (ya está gitignored) con estos valores, pegando los outputs anteriores tal cual (el hash bcrypt incluye caracteres `$`, va sin comillas):

```
ADMIN_USER=admin
ADMIN_PASSWORD_HASH=<output del bun -e>
JWT_SECRET=<output del openssl rand>
DB_PATH=/tmp/smoke.db
```

- [ ] **Step 5: Smoke test — levantar el Cardinal**

```bash
bun backend/src/index.ts
```

Esperado: `cardinal-system listening on :8787`. Dejarlo corriendo en su propia terminal.

- [ ] **Step 6: Smoke test — conectar el agente de referencia**

En otra terminal:

```bash
CARDINAL_AGENT_KEY="$SMOKE_KEY" CARDINAL_DEVICE=pc bun examples/ws-agent.ts
```

Esperado:
```
[agent] connecting to ws://localhost:8787/ws (attempt 1)
[agent] welcome as smoke (agent)
```

- [ ] **Step 7: Smoke test — verificar el roster por REST (login + cookie)**

```bash
curl -s -c /tmp/cj -X POST localhost:8787/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"user":"admin","password":"sao123"}'
curl -s -b /tmp/cj localhost:8787/api/agents
```

Esperado: el primer comando responde `{"user":"admin"}`; el segundo, un JSON donde el agente `smoke` aparece con `"connected":true`, `"device":"pc"`, `"kind":"agent"`.

- [ ] **Step 8: Smoke test — desconexión limpia**

Ctrl+C en la terminal del agente. Esperado en el agente:

```
[agent] shutting down: sending bye
[agent] closed (code=1000 reason=bye)
```

Re-consultar el roster:

```bash
curl -s -b /tmp/cj localhost:8787/api/agents
```

Esperado: `smoke` ahora con `"connected":false`. Además, `curl -s -b /tmp/cj localhost:8787/api/agents/smoke` debe mostrar eventos `connect` y `disconnect` en el array `events`.

- [ ] **Step 9: Limpieza del smoke test**

Frenar el servidor (Ctrl+C) y limpiar los artefactos temporales:

```bash
rm -f /tmp/smoke.db /tmp/smoke.db-wal /tmp/smoke.db-shm /tmp/cj
unset SMOKE_KEY
```

- [ ] **Step 10: Commit**

```bash
git add examples/ws-agent.ts
git commit -m "feat: add reference WS agent example"
```
### Task 12: Frontend scaffold + tema SAO

Scaffold mínimo de Vite + React + Tailwind v4 con los tokens del tema SAO. Al finalizar, el dev server muestra un heading "CARDINAL" centrado con la estética base. Las rutas llegan en Task 13. (El `frontend/package.json` y `frontend/tsconfig.json` ya existen de la tarea de setup previa.)

**Files:**
- `frontend/index.html`
- `frontend/vite.config.ts`
- `frontend/src/index.css`
- `frontend/src/vite-env.d.ts`
- `frontend/src/main.tsx`
- `frontend/src/App.tsx`

- [ ] **Step 1: Crear `frontend/index.html`** con el mount point, el script de entrada y las Google Fonts (JetBrains Mono + Inter):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Cardinal System</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap"
      rel="stylesheet"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Crear `frontend/vite.config.ts`** con los plugins `react()` y `tailwindcss()` (`@tailwindcss/vite`), más el proxy de desarrollo hacia el backend Bun en `:8787` (`/api` HTTP, `/ws` WebSocket):

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": "http://localhost:8787",
      "/ws": {
        target: "ws://localhost:8787",
        ws: true,
      },
    },
  },
});
```

- [ ] **Step 3: Crear `frontend/src/index.css`** con el tema SAO EXACTO del contrato (tokens `@theme` de Tailwind v4 + estilos base de `body`):

```css
@import "tailwindcss";

@theme {
  --color-sao-bg: #08070c;
  --color-sao-panel: #0a0e27;
  --color-sao-accent: #00d4ff;
  --color-sao-mint: #7ed3c1;
  --color-sao-violet: #8b5cf6;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
}

body {
  background-color: var(--color-sao-bg);
  color: #e2e8f0;
  font-family: var(--font-sans);
}
```

- [ ] **Step 4: Crear `frontend/src/vite-env.d.ts`** con la referencia de tipos de Vite:

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 5: Crear `frontend/src/main.tsx`** — entry point con `React.StrictMode`, `BrowserRouter` y el import de `./index.css`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
```

- [ ] **Step 6: Crear `frontend/src/App.tsx`** (mínimo por ahora — las rutas se agregan en Task 13) con el heading centrado usando clases del tema:

```tsx
export default function App() {
  return (
    <div className="flex h-screen items-center justify-center">
      <h1 className="font-mono text-4xl tracking-widest text-sao-accent">CARDINAL</h1>
    </div>
  );
}
```

- [ ] **Step 7: Verificar typecheck.** Ejecutar `bun x tsc --noEmit -p frontend/tsconfig.json` — expect: sin errores.

- [ ] **Step 8: Verificar build.** Ejecutar `bun --cwd frontend run build` — expect: genera `frontend/dist/`.

- [ ] **Step 9: Commit.** `git add frontend && git commit -m "feat: frontend scaffold with SAO theme"`

---

### Task 13: Auth, routing, Layout, Login, Settings

Capa de sesión humana: cliente `api` con cookies, `AuthProvider` (chequea `/api/auth/me` al montar), `ProtectedRoute`, `Layout` con sidebar SAO, pantalla de Login estilo "link start", y Settings. Home y AgentDetail quedan como stubs (se reemplazan en Tasks 14/15).

**Files:**
- `frontend/src/lib/types.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/hooks/useAuth.tsx`
- `frontend/src/components/ProtectedRoute.tsx`
- `frontend/src/components/Layout.tsx`
- `frontend/src/pages/Login.tsx`
- `frontend/src/pages/Settings.tsx`
- `frontend/src/pages/Home.tsx` (stub)
- `frontend/src/pages/AgentDetail.tsx` (stub)
- `frontend/src/App.tsx` (reemplazo completo)

- [ ] **Step 1: Crear `frontend/src/lib/types.ts`** — espejo EXACTO de los payloads del backend según el contrato:

```ts
export interface AgentPayload {
  name: string;
  device: string;
  kind: "agent" | "subagent";
  status: string;
  connected: boolean;
  lastSeen: string | null;
}

export interface AgentEvent {
  id: number;
  agent_name: string;
  type: "connect" | "disconnect" | "status";
  meta: string | null;
  at: string;
}

export type ServerEvent =
  | { type: "roster"; agents: AgentPayload[] }
  | { type: "agent_update"; agent: AgentPayload };
```

- [ ] **Step 2: Crear `frontend/src/lib/api.ts`** — clase `ApiError` + helper `api<T>` con `credentials: "include"` y content-type JSON; ante `!res.ok` lanza `ApiError` (intentando extraer `error` del body):

```ts
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let message = `request failed: ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore body parse errors
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}
```

- [ ] **Step 3: Crear `frontend/src/hooks/useAuth.tsx`** — `AuthProvider` + `useAuth`. Estado `user: string | null | undefined` (`undefined` = cargando). Al montar llama `GET /api/auth/me` → `setUser(res.user)`, ante `ApiError` → `setUser(null)`. `login` postea JSON y setea user; `logout` postea (catch ignorado) y setea `null`:

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "../lib/api";

interface AuthContextValue {
  user: string | null | undefined; // undefined = loading
  login: (user: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    api<{ user: string }>("/api/auth/me")
      .then((res) => setUser(res.user))
      .catch((err) => {
        if (err instanceof ApiError) {
          setUser(null);
        } else {
          setUser(null);
        }
      });
  }, []);

  async function login(user: string, password: string) {
    const res = await api<{ user: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ user, password }),
    });
    setUser(res.user);
  }

  async function logout() {
    try {
      await api<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore logout errors
    }
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

- [ ] **Step 4: Crear `frontend/src/components/ProtectedRoute.tsx`** — loading temático si `user === undefined`, `<Navigate to="/login" replace />` si `null`, `<Outlet />` si hay sesión:

```tsx
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function ProtectedRoute() {
  const { user } = useAuth();

  if (user === undefined) {
    return (
      <div className="flex h-screen items-center justify-center">
        <span className="font-mono text-sm text-sao-accent animate-pulse">loading…</span>
      </div>
    );
  }
  if (user === null) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
```

- [ ] **Step 5: Crear `frontend/src/components/Layout.tsx`** — sidebar `w-56 border-r border-sao-accent/20 bg-sao-panel/40` con brand "CARDINAL" (`font-mono tracking-widest text-sao-accent`), `NavLink` a `/` (con `end`) y `/settings` (activo: `border-sao-accent/60 bg-sao-panel text-sao-accent`; inactivo: `text-slate-400 hover:text-sao-accent`), botón logout (`border-sao-violet/40 text-sao-violet`) que llama `useAuth().logout`, footer con `v{version}` traído de `/api/health` al montar, y área principal `<Outlet />` con `p-6 overflow-y-auto`. Layout general `flex h-screen`:

```tsx
import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";

export default function Layout() {
  const { logout } = useAuth();
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    api<{ version: string }>("/api/health")
      .then((res) => setVersion(res.version))
      .catch(() => setVersion(""));
  }, []);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `block rounded border px-3 py-2 font-mono text-sm transition-colors ${
      isActive
        ? "border-sao-accent/60 bg-sao-panel text-sao-accent"
        : "border-transparent text-slate-400 hover:text-sao-accent"
    }`;

  return (
    <div className="flex h-screen">
      <aside className="flex w-56 flex-col border-r border-sao-accent/20 bg-sao-panel/40">
        <div className="px-4 py-5 font-mono text-lg tracking-widest text-sao-accent">CARDINAL</div>
        <nav className="flex flex-col gap-1 px-3">
          <NavLink to="/" end className={linkClass}>
            home
          </NavLink>
          <NavLink to="/settings" className={linkClass}>
            settings
          </NavLink>
        </nav>
        <div className="mt-auto flex flex-col gap-3 px-3 pb-4">
          <button
            onClick={() => void logout()}
            className="rounded border border-sao-violet/40 px-3 py-2 font-mono text-sm text-sao-violet transition-colors hover:bg-sao-violet/10"
          >
            logout
          </button>
          <div className="px-1 font-mono text-xs text-slate-500">v{version}</div>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 6: Crear `frontend/src/pages/Login.tsx`** — form centrado con panel `w-80 rounded-lg border border-sao-accent/30 bg-sao-panel/70 p-8 shadow-[0_0_40px_rgba(0,212,255,0.15)]`, brand header, inputs user/password (`bg-sao-bg border-sao-accent/20 focus:border-sao-accent font-mono`), botón "link start" (`border-sao-accent bg-sao-accent/10 text-sao-accent hover:bg-sao-accent/20`), mensaje "invalid credentials" ante fallo, y `navigate("/", { replace: true })` al éxito:

```tsx
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(user, password);
      navigate("/", { replace: true });
    } catch {
      setError("invalid credentials");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center">
      <form
        onSubmit={onSubmit}
        className="flex w-80 flex-col gap-4 rounded-lg border border-sao-accent/30 bg-sao-panel/70 p-8 shadow-[0_0_40px_rgba(0,212,255,0.15)]"
      >
        <h1 className="text-center font-mono text-xl tracking-widest text-sao-accent">CARDINAL</h1>
        <input
          value={user}
          onChange={(e) => setUser(e.target.value)}
          placeholder="user"
          autoComplete="username"
          className="rounded border border-sao-accent/20 bg-sao-bg px-3 py-2 font-mono text-sm outline-none focus:border-sao-accent"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          autoComplete="current-password"
          className="rounded border border-sao-accent/20 bg-sao-bg px-3 py-2 font-mono text-sm outline-none focus:border-sao-accent"
        />
        {error && <p className="font-mono text-xs text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="rounded border border-sao-accent bg-sao-accent/10 px-3 py-2 font-mono text-sm tracking-widest text-sao-accent transition-colors hover:bg-sao-accent/20 disabled:opacity-50"
        >
          link start
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 7: Crear `frontend/src/pages/Settings.tsx`** — card con el usuario (de `useAuth`), la versión (de `/api/health`) y la nota de que las credenciales admin viven en variables de entorno (`ADMIN_PASSWORD_HASH` + restart):

```tsx
import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";

export default function Settings() {
  const { user } = useAuth();
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    api<{ version: string }>("/api/health")
      .then((res) => setVersion(res.version))
      .catch(() => setVersion(""));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-mono text-lg tracking-widest text-sao-accent">SETTINGS</h1>
      <div className="flex w-96 flex-col gap-3 rounded-lg border border-sao-accent/20 bg-sao-panel/60 p-6">
        <div className="flex justify-between font-mono text-sm">
          <span className="text-slate-400">user</span>
          <span className="text-sao-accent">{user}</span>
        </div>
        <div className="flex justify-between font-mono text-sm">
          <span className="text-slate-400">version</span>
          <span className="text-sao-accent">v{version}</span>
        </div>
        <p className="mt-2 border-t border-sao-accent/10 pt-3 font-mono text-xs text-slate-500">
          admin credentials live in env vars — change ADMIN_PASSWORD_HASH and restart the service.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Crear stubs `frontend/src/pages/Home.tsx` y `frontend/src/pages/AgentDetail.tsx`** (placeholders de una línea para que el routing compile; se reemplazan en Tasks 14 y 15):

```tsx
// frontend/src/pages/Home.tsx
export default function Home() {
  return <div className="font-mono text-slate-500">home</div>;
}
```

```tsx
// frontend/src/pages/AgentDetail.tsx
export default function AgentDetail() {
  return <div className="font-mono text-slate-500">agent detail</div>;
}
```

- [ ] **Step 9: Reemplazar `frontend/src/App.tsx`** (contenido completo nuevo) — `AuthProvider` envolviendo `Routes`: `/login` → `Login`; `ProtectedRoute` envolviendo `Layout` que envuelve `/` → `Home`, `/agents/:name` → `AgentDetail`, `/settings` → `Settings`:

```tsx
import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Home from "./pages/Home";
import AgentDetail from "./pages/AgentDetail";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/agents/:name" element={<AgentDetail />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}
```

- [ ] **Step 10: Verificar typecheck.** Ejecutar `bun x tsc --noEmit -p frontend/tsconfig.json` — expect: sin errores.

- [ ] **Step 11: Verificar build.** Ejecutar `bun --cwd frontend run build` — expect: genera `frontend/dist/`.

- [ ] **Step 12: Commit.** `git add frontend && git commit -m "feat: auth, routing, layout, login and settings pages"`

---

### Task 14: Roster en vivo + Agent Hub (Home)

Conexión WS al endpoint `/ws` con `subscribe` + reconnect con backoff, hook `useRoster` que mantiene un `Map<string, AgentPayload>`, y el Agent Hub: grilla de `AgentCard` solo para `kind === "agent"` (online primero), sección colapsable de subagents, y empty state con hint de keygen.

**Files:**
- `frontend/src/lib/ws.ts`
- `frontend/src/hooks/useRoster.ts`
- `frontend/src/components/AgentCard.tsx`
- `frontend/src/pages/Home.tsx` (reemplaza el stub, contenido completo)

- [ ] **Step 1: Crear `frontend/src/lib/ws.ts`** — `connectRoster(onEvent)`: URL derivada de `location` (`ws`/`wss` según protocolo, mismo host), al abrir envía `{"type":"subscribe"}`, parsea `ServerEvent` dentro de try/catch, al cerrar reconecta con `setTimeout(connect, Math.min(15000, 1000 * attempt))` si no fue disposed, y devuelve cleanup que setea el flag y cierra el socket:

```ts
import type { ServerEvent } from "./types";

export function connectRoster(onEvent: (ev: ServerEvent) => void): () => void {
  let disposed = false;
  let attempt = 0;
  let socket: WebSocket | null = null;

  function connect() {
    if (disposed) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    socket = new WebSocket(`${proto}://${location.host}/ws`);

    socket.onopen = () => {
      attempt = 0;
      socket?.send(JSON.stringify({ type: "subscribe" }));
    };

    socket.onmessage = (msg) => {
      try {
        const ev = JSON.parse(String(msg.data)) as ServerEvent;
        onEvent(ev);
      } catch {
        // ignore malformed messages
      }
    };

    socket.onclose = () => {
      if (disposed) return;
      attempt += 1;
      setTimeout(connect, Math.min(15000, 1000 * attempt));
    };
  }

  connect();

  return () => {
    disposed = true;
    socket?.close();
  };
}
```

- [ ] **Step 2: Crear `frontend/src/hooks/useRoster.ts`** — estado `Map<string, AgentPayload>`; `useEffect` suscribe vía `connectRoster`: `roster` → clear + fill, `agent_update` → set (upsert); cleanup al desmontar:

```ts
import { useEffect, useState } from "react";
import type { AgentPayload } from "../lib/types";
import { connectRoster } from "../lib/ws";

export function useRoster(): Map<string, AgentPayload> {
  const [agents, setAgents] = useState<Map<string, AgentPayload>>(new Map());

  useEffect(() => {
    const disconnect = connectRoster((ev) => {
      setAgents((prev) => {
        const next = new Map(prev);
        if (ev.type === "roster") {
          next.clear();
          for (const agent of ev.agents) next.set(agent.name, agent);
        } else if (ev.type === "agent_update") {
          next.set(ev.agent.name, ev.agent);
        }
        return next;
      });
    });
    return disconnect;
  }, []);

  return agents;
}
```

- [ ] **Step 3: Crear `frontend/src/components/AgentCard.tsx`** — `hueFor(name)` (hash `h = (h*31 + c.charCodeAt(0)) % 360`), `Link` a `/agents/<encoded name>`, card `flex flex-col items-center gap-3 rounded-lg border border-sao-accent/20 bg-sao-panel/60 p-5 hover:border-sao-accent/60` (+ `opacity-40 grayscale` offline), avatar circular `h-16 w-16` con inline style (borderColor y radial-gradient en `hsl(hue)`, `boxShadow` glow solo cuando está conectado), nombre en `font-mono text-sm`, y fila device · status (`text-sao-mint` idle / `text-sao-violet` busy; "offline" si `!connected`):

```tsx
import { Link } from "react-router-dom";
import type { AgentPayload } from "../lib/types";

export function hueFor(name: string): number {
  let h = 0;
  for (const c of name) {
    h = (h * 31 + c.charCodeAt(0)) % 360;
  }
  return h;
}

export default function AgentCard({ agent }: { agent: AgentPayload }) {
  const hue = hueFor(agent.name);
  const offline = !agent.connected;

  return (
    <Link
      to={`/agents/${encodeURIComponent(agent.name)}`}
      className={`flex flex-col items-center gap-3 rounded-lg border border-sao-accent/20 bg-sao-panel/60 p-5 transition-colors hover:border-sao-accent/60 ${
        offline ? "opacity-40 grayscale" : ""
      }`}
    >
      <div
        className="h-16 w-16 rounded-full border-2"
        style={{
          borderColor: `hsl(${hue} 80% 60%)`,
          background: `radial-gradient(circle at 35% 35%, hsl(${hue} 80% 60% / 0.6), hsl(${hue} 80% 30% / 0.2))`,
          boxShadow: agent.connected ? `0 0 18px hsl(${hue} 80% 60% / 0.55)` : undefined,
        }}
      />
      <span className="font-mono text-sm text-slate-200">{agent.name}</span>
      <span className="font-mono text-xs text-slate-500">
        {agent.device} ·{" "}
        {agent.connected ? (
          <span className={agent.status === "busy" ? "text-sao-violet" : "text-sao-mint"}>{agent.status}</span>
        ) : (
          <span>offline</span>
        )}
      </span>
    </Link>
  );
}
```

- [ ] **Step 4: Reemplazar `frontend/src/pages/Home.tsx`** (contenido completo) — heading "AGENT HUB"; desde `useRoster`: `agents` = `kind === "agent"` ordenados conectados-primero y luego por nombre, `subs` = `kind === "subagent"`; grilla `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4` de `AgentCard`; empty state con hint mono de keygen; sección colapsable de subagents con `useState(showSubs)` y botón `▸/▾ subagents (n)`:

```tsx
import { useState } from "react";
import AgentCard from "../components/AgentCard";
import { useRoster } from "../hooks/useRoster";

export default function Home() {
  const roster = useRoster();
  const [showSubs, setShowSubs] = useState(false);

  const agents = [...roster.values()]
    .filter((a) => a.kind === "agent")
    .sort((a, b) => Number(b.connected) - Number(a.connected) || a.name.localeCompare(b.name));
  const subs = [...roster.values()].filter((a) => a.kind === "subagent");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-mono text-lg tracking-widest text-sao-accent">AGENT HUB</h1>

      {agents.length === 0 ? (
        <p className="rounded-lg border border-sao-accent/20 bg-sao-panel/60 p-6 font-mono text-sm text-slate-500">
          no external agents registered — create a key with{" "}
          <span className="text-sao-accent">bun run keygen -- --agent &lt;name&gt;</span>
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {agents.map((agent) => (
            <AgentCard key={agent.name} agent={agent} />
          ))}
        </div>
      )}

      {subs.length > 0 && (
        <div className="flex flex-col gap-3">
          <button
            onClick={() => setShowSubs((v) => !v)}
            className="self-start font-mono text-sm text-slate-400 transition-colors hover:text-sao-accent"
          >
            {showSubs ? "▾" : "▸"} subagents ({subs.length})
          </button>
          {showSubs && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {subs.map((agent) => (
                <AgentCard key={agent.name} agent={agent} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verificar typecheck.** Ejecutar `bun x tsc --noEmit -p frontend/tsconfig.json` — expect: sin errores.

- [ ] **Step 6: Verificar build.** Ejecutar `bun --cwd frontend run build` — expect: genera `frontend/dist/`.

- [ ] **Step 7: Commit.** `git add frontend && git commit -m "feat: live roster and agent hub home page"`

---

### Task 15: AgentDetail

Vista de detalle de un agente: estado en vivo vía `useRoster` + historial de eventos vía REST (`GET /api/agents/:name`), con refetch cuando cambian `connected`/`status` del agente en el roster y manejo de 404.

**Files:**
- `frontend/src/pages/AgentDetail.tsx` (reemplaza el stub, contenido completo)

- [ ] **Step 1: Reemplazar `frontend/src/pages/AgentDetail.tsx`** (contenido completo) — `useParams` para `name`; agente en vivo desde `useRoster().get(name)`; `events` desde `api<{ events: AgentEvent[] }>` contra `/api/agents/<encoded name>`; el `useEffect` refetchea cuando cambian `agent?.connected` o `agent?.status` (deps); 404 → flag `notFound`. UI: back link "← hub" a `/`, `h1` con el nombre (`font-mono text-sao-accent`), línea meta (kind · device · status/offline · last seen), sección "RECENT EVENTS" con panel bordeado listando eventos — cada fila: timestamp (`text-slate-500`), type coloreado (connect → `text-sao-mint`, disconnect → `text-red-400`, status → `text-sao-violet`), meta — y empty state "no events yet":

```tsx
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { AgentEvent } from "../lib/types";
import { useRoster } from "../hooks/useRoster";

export default function AgentDetail() {
  const { name = "" } = useParams();
  const roster = useRoster();
  const agent = roster.get(name);

  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!name) return;
    let cancelled = false;
    api<{ events: AgentEvent[] }>(`/api/agents/${encodeURIComponent(name)}`)
      .then((res) => {
        if (!cancelled) {
          setEvents(res.events);
          setNotFound(false);
        }
      })
      .catch((err) => {
        if (!cancelled && err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [name, agent?.connected, agent?.status]);

  const typeColor = (type: AgentEvent["type"]) =>
    type === "connect" ? "text-sao-mint" : type === "disconnect" ? "text-red-400" : "text-sao-violet";

  return (
    <div className="flex flex-col gap-6">
      <Link to="/" className="self-start font-mono text-sm text-slate-400 transition-colors hover:text-sao-accent">
        ← hub
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="font-mono text-2xl text-sao-accent">{name}</h1>
        {notFound ? (
          <p className="font-mono text-sm text-red-400">agent not found</p>
        ) : (
          <p className="font-mono text-sm text-slate-500">
            {agent ? (
              <>
                {agent.kind} · {agent.device} ·{" "}
                {agent.connected ? (
                  <span className={agent.status === "busy" ? "text-sao-violet" : "text-sao-mint"}>{agent.status}</span>
                ) : (
                  "offline"
                )}{" "}
                · last seen {agent.lastSeen ?? "never"}
              </>
            ) : (
              "loading…"
            )}
          </p>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-sm tracking-widest text-sao-accent">RECENT EVENTS</h2>
        <div className="flex flex-col divide-y divide-sao-accent/10 rounded-lg border border-sao-accent/20 bg-sao-panel/60">
          {events.length === 0 ? (
            <p className="p-4 font-mono text-sm text-slate-500">no events yet</p>
          ) : (
            events.map((ev) => (
              <div key={ev.id} className="flex items-baseline gap-4 px-4 py-2 font-mono text-sm">
                <span className="text-slate-500">{ev.at}</span>
                <span className={typeColor(ev.type)}>{ev.type}</span>
                {ev.meta && <span className="text-slate-400">{ev.meta}</span>}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verificar typecheck.** Ejecutar `bun x tsc --noEmit -p frontend/tsconfig.json` — expect: sin errores.

- [ ] **Step 3: Verificar build.** Ejecutar `bun --cwd frontend run build` — expect: genera `frontend/dist/`.

- [ ] **Step 4: Commit.** `git add frontend && git commit -m "feat: agent detail page with live status and event history"`
### Task 16: Deploy artifacts + README + verificación final

**Files:**
- Create: `deploy/Containerfile`
- Create: `deploy/quadlet/cardinal.container`
- Create: `deploy/quadlet/cardinal-data.volume`
- Create: `deploy/env.example`
- Create: `deploy/Caddyfile.example`
- Create: `README.md`

Con todo el código de Fase 0 en su lugar (Tasks 1–15), esta tarea deja listos los artefactos de deploy (un solo contenedor Podman que sirve API + WS + estáticos, unidades Quadlet, Caddy de ejemplo), el README con quickstart, y corre la verificación final completa del proyecto.

- [ ] **Step 1: Crear `deploy/Containerfile` (multi-stage)**

Stage `build`: instala deps de backend y frontend con lockfile congelado y genera el build de Vite. Stage runtime: imagen slim con el backend, `frontend/dist` y el `package.json` raíz (necesario para que `/api/health` lea la versión), deps de backend podadas a producción.

```dockerfile
# ---------- build stage ----------
FROM docker.io/oven/bun:1 AS build
WORKDIR /app

# Manifests first for better layer caching
COPY package.json ./
COPY backend/package.json backend/bun.lock ./backend/
COPY frontend/package.json frontend/bun.lock ./frontend/
RUN cd backend && bun install --frozen-lockfile
RUN cd frontend && bun install --frozen-lockfile

# Sources, then frontend production build
COPY backend ./backend
COPY frontend ./frontend
RUN cd frontend && bun run build

# ---------- runtime stage ----------
FROM docker.io/oven/bun:1-slim
WORKDIR /app

ENV NODE_ENV=production \
    PORT=8787 \
    DB_PATH=/data/cardinal.db \
    STATIC_DIR=/app/frontend/dist

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/backend ./backend
COPY --from=build /app/frontend/dist ./frontend/dist

RUN cd backend && bun install --production --frozen-lockfile

VOLUME /data
EXPOSE 8787
CMD ["bun", "backend/src/index.ts"]
```

- [ ] **Step 2: Crear las unidades Quadlet**

`deploy/quadlet/cardinal.container` — publica solo en loopback (Caddy en el host hace el reverse proxy), monta el volumen de datos y toma los secretos de un EnvironmentFile fuera del repo:

```ini
[Unit]
Description=Cardinal System - SAO agents backend
After=network-online.target

[Container]
Image=localhost/cardinal-system:latest
PublishPort=127.0.0.1:8787:8787
Volume=cardinal-data.volume:/data:Z
EnvironmentFile=%h/.config/cardinal/env

[Service]
Restart=always

[Install]
WantedBy=default.target
```

`deploy/quadlet/cardinal-data.volume` — volumen nombrado gestionado por Quadlet (sin opciones extra):

```ini
[Volume]
```

- [ ] **Step 3: Crear `deploy/env.example`**

Plantilla de variables para dev (`.env` en la raíz) y para el EnvironmentFile del Quadlet. Los valores secretos se generan con los comandos indicados en los comentarios.

```bash
# Cardinal System — environment config
# Dev: copy to .env at repo root. Quadlet: copy to ~/.config/cardinal/env.

ADMIN_USER=admin

# generate: bun -e 'console.log(await Bun.password.hash("your-password"))'
ADMIN_PASSWORD_HASH=

# generate: openssl rand -hex 32
JWT_SECRET=

PORT=8787

# Dev default. In the quadlet deploy the container image already sets
# DB_PATH=/data/cardinal.db (on the cardinal-data volume) — leave it unset there.
DB_PATH=./cardinal.db
```

- [ ] **Step 4: Crear `deploy/Caddyfile.example`**

Bloque local activo (para probar el contenedor en dev detrás de Caddy) y bloque de producción comentado hasta que exista dominio.

```caddyfile
# Production (VPS): uncomment once the domain is ready
# cardinal.snatty.dev {
# 	reverse_proxy 127.0.0.1:8787
# }

# Local: proxies the dev container locally (podman publishes 127.0.0.1:8787)
:8080 {
	reverse_proxy 127.0.0.1:8787
}
```

- [ ] **Step 5: Crear `README.md` (quickstart dev + producción)**

```markdown
# Cardinal System

Backend central del ecosistema de agentes SAO: login humano (JWT), dashboard web con estética SAO, Agent Hub en tiempo real vía WebSocket y API keys por agente (`sk-cardinal-*`). Monolito Bun + SQLite que sirve API, WS y los estáticos del frontend desde un único proceso — y en producción, desde un único contenedor.

**Versión:** v0.0.1 (Fase 0 — Esqueleto Vivo). Spec de diseño: [`docs/superpowers/specs/2026-07-23-cardinal-fase-0-design.md`](docs/superpowers/specs/2026-07-23-cardinal-fase-0-design.md).

## Requisitos

- [Bun](https://bun.sh) ≥ 1.2
- Podman (opcional, solo para el deploy de producción)

## Setup de desarrollo

\`\`\`bash
git clone <repo-url> && cd cardinal-system

# Dependencias (backend y frontend son paquetes independientes)
cd backend && bun install && cd ..
cd frontend && bun install && cd ..

# Variables de entorno
cp deploy/env.example .env
bun -e 'console.log(await Bun.password.hash("your-password"))'  # → ADMIN_PASSWORD_HASH en .env
openssl rand -hex 32                                            # → JWT_SECRET en .env

# Crear la API key de un agente (se imprime UNA sola vez — guardarla)
bun run keygen -- --agent shinon

# Terminal 1: backend en http://localhost:8787
bun run dev:backend

# Terminal 2: frontend en http://localhost:5173 (proxy de /api y /ws al 8787)
bun run dev:frontend
\`\`\`

Abrir http://localhost:5173 y loguearse con `ADMIN_USER` y la password hasheada.

## Agente de ejemplo

Con el backend corriendo, conectar el cliente WS de referencia con la key generada:

\`\`\`bash
CARDINAL_AGENT_KEY=sk-cardinal-... bun examples/ws-agent.ts
\`\`\`

El agente aparece online en el dashboard; al cerrarlo (Ctrl+C) envía `bye` y pasa a offline.

## Producción (Podman + Quadlet + Caddy)

\`\`\`bash
# 1. Build de la imagen (un solo contenedor: API + WS + estáticos)
podman build -t cardinal-system -f deploy/Containerfile .

# 2. Unidades Quadlet y secretos
mkdir -p ~/.config/containers/systemd ~/.config/cardinal
cp deploy/quadlet/cardinal.container deploy/quadlet/cardinal-data.volume ~/.config/containers/systemd/
cp deploy/env.example ~/.config/cardinal/env   # editar y completar los valores

# 3. Activar el servicio
systemctl --user daemon-reload
systemctl --user start cardinal
\`\`\`

El contenedor publica en `127.0.0.1:8787` y persiste la DB en el volumen `cardinal-data` (`/data/cardinal.db`). Para exponerlo, usar `deploy/Caddyfile.example` como base en el Caddy del host (bloque `:8080` para local, o el bloque comentado de producción con el dominio).

## Scripts raíz

| Script | Descripción |
|--------|-------------|
| `bun run dev:backend` | Backend con watch en http://localhost:8787 |
| `bun run dev:frontend` | Vite dev server en http://localhost:5173 (proxy `/api` y `/ws` → 8787) |
| `bun run keygen -- ...` | CLI de API keys: `--agent <name>`, `--revoke <name>`, `--list` |
| `bun run build` | Build de producción del frontend → `frontend/dist/` |
| `bun test backend/src` | Suite de tests del backend |
```

- [ ] **Step 6: Verificación — suite de tests del backend**

```bash
bun test backend/src
```

Expected: todos los tests pasan; la salida termina con ` 0 fail` y el exit code es `0`.

- [ ] **Step 7: Verificación — typecheck de backend y frontend**

```bash
bun x tsc --noEmit -p backend/tsconfig.json && bun x tsc --noEmit -p frontend/tsconfig.json
```

Expected: sin output de errores, exit code `0`.

- [ ] **Step 8: Verificación — build de producción del frontend**

```bash
bun --cwd frontend run build && ls frontend/dist
```

Expected: Vite termina con `✓ built in ...` y `ls frontend/dist` muestra `index.html` y el directorio `assets/` con los bundles generados.

- [ ] **Step 9: Verificación OPCIONAL — build de la imagen Podman**

> Solo si hay `podman` instalado y red disponible para bajar `docker.io/oven/bun:1`. Si no, saltear este paso: los artefactos ya quedan listos para buildear en el VPS.

```bash
podman build -t cardinal-system -f deploy/Containerfile . && podman images | grep cardinal-system
```

Expected: el build termina con `COMMIT cardinal-system` y `podman images` lista `localhost/cardinal-system  latest`.

- [ ] **Step 10: Verificación — `.gitignore` cubre artefactos generados**

```bash
cat .gitignore
```

Expected: el archivo (ya existente desde la inicialización del repo) incluye `node_modules/`, `dist/`, `*.db` (más `*.db-journal`, `*.db-wal`, `*.db-shm`), `.env` y `.env.local` — nada de lo generado en esta Fase 0 queda trackeado.

- [ ] **Step 11: Commit final de Fase 0**

```bash
git add -A && git commit -m "chore: deploy artifacts + readme — fase 0 complete (v0.0.1)"
```

Expected: commit creado con `deploy/Containerfile`, `deploy/quadlet/cardinal.container`, `deploy/quadlet/cardinal-data.volume`, `deploy/env.example`, `deploy/Caddyfile.example` y `README.md` (y nada de `node_modules/`, `dist/`, `*.db` ni `.env`).

# Cardinal System — Fase 0: Living Skeleton

> Design spec. Project version when written: **v0.0.1**
> Date: 2026-07-23 · Status: approved by the user (brainstorming closed)

---

## 1. Phase Vision

Bring up the minimum living system: human login, SAO dashboard, Agent Hub with a real-time roster via WebSocket, and containerized deployment. Cardinal is **passive**: it receives agent connections and serves state; it does not dispatch tasks.

## 2. Decisions Made (Brainstorming 2026-07-23)

| # | Decision | Outcome |
|---|----------|---------|
| 1 | Runtime | **Bun for everything**: `Bun.serve` (HTTP+WS), `bun:sqlite`, `bun test`, `Bun.password` |
| 2 | Orchestration | **Passive in Fase 0**. No `task` message exists. Cardinal never initiates work on agents |
| 3 | Agent auth | **OpenAI-compatible API key per agent** (`sk-cardinal-<hex>`), issued by Cardinal, identity = key. DB stores only the SHA-256 hash |
| 4 | Human user store | **Environment variables**: `ADMIN_USER` + `ADMIN_PASSWORD_HASH` (bcrypt, verified with `Bun.password`). No users table, no password change from UI in Fase 0 |
| 5 | Serving | **Single container serves everything**: API + WS + Vite build static assets. Caddy (host) acts only as reverse proxy |
| 6 | Agent classification | `device == "localhost"` → **subagent** by default; hidden from main grid unless explicit human `kind_override` at key creation |
| 7 | Agent client | **Agent-less**: the WS protocol is the contract; any standard websocket client works. `examples/ws-agent.ts` is provided as reference, not an SDK |
| 8 | Deployment | Artifacts ready (Containerfile, Quadlet, sample Caddyfile) but **development focus**; no subdomain for now |
| 9 | Versioning | `vMAJOR.FASE.UPDATE` — MAJOR=1 only for stable post-testing product; FASE = roadmap phase; UPDATE = each update. Initial: **v0.0.1** in root `package.json`, exposed via `/api/health` and displayed on dashboard |

## 3. Architecture

Bun workspaces monorepo:

```
cardinal-system/
├── package.json            # version: 0.0.1 (source of truth), workspaces
├── backend/
│   ├── package.json        # deps: jose, zod
│   └── src/
│       ├── index.ts        # bootstrap: config → db → server
│       ├── config.ts       # env parsing/validation
│       ├── db/
│       │   ├── schema.sql
│       │   └── index.ts    # init + migrations with PRAGMA user_version
│       ├── auth/
│       │   ├── jwt.ts      # sign/verify HS256 (jose)
│       │   └── routes.ts   # login, logout, me
│       ├── keys/
│       │   ├── index.ts    # generate sk-cardinal-*, SHA-256 hash, validate
│       │   └── cli.ts      # keygen: create / revoke / list
│       ├── ws/
│       │   ├── hub.ts      # single /ws endpoint, role determined by first message
│       │   └── protocol.ts # message parsing/validation (zod, pure functions)
│       ├── api/
│       │   ├── agents.ts   # roster + detail
│       │   └── health.ts   # version + status (public)
│       └── static.ts       # Vite build with SPA fallback
├── frontend/
│   ├── package.json        # react, react-router-dom, tailwindcss v4, vite
│   └── src/
│       ├── main.tsx, App.tsx
│       ├── lib/api.ts      # fetch wrapper (JWT cookie)
│       ├── lib/ws.ts       # roster subscription, reconnect with backoff
│       ├── hooks/          # useAuth, useRoster
│       ├── pages/          # Login, Home (AgentHub), AgentDetail, Settings
│       └── components/     # AgentCard, Sidebar, StatusBadge, SAO theme
├── examples/
│   └── ws-agent.ts         # reference generic WS client (agent-less)
├── deploy/
│   ├── Containerfile       # multi-stage: build frontend → runtime bun
│   ├── Caddyfile.example
│   └── quadlet/            # cardinal.container + cardinal-data.volume
└── docs/superpowers/specs/
```

**Main data flow:** agent sends `hello` with its key → Cardinal validates hash, upsert into `agents`, marks `connected=1`, records event → broadcasts `agent_update` to subscribed dashboards → UI updates in real time. `pong` updates `last_seen`/`status`. `bye` or timeout (2 unanswered pings) → `connected=0` + broadcast.

## 4. WS Protocol (`/ws`)

Single endpoint. The **first message determines the role**:

```
# Agent role
agent    → { "type": "hello", "key": "sk-cardinal-...", "device": "pc", "status": "idle" }
cardinal → { "type": "welcome", "agent": "shinon", "kind": "agent" }
cardinal → { "type": "error", "reason": "auth_failed" }  + close 4401   (invalid/revoked key)
cardinal → { "type": "ping" }                            (every 30s)
agent    → { "type": "pong", "status": "busy" }          (replies to ping; can also be spontaneous)
agent    → { "type": "bye" }                             (immediate offline)

# Dashboard role (human)
# (HTTP upgrade is already authenticated via login httpOnly cookie)
dashboard → { "type": "subscribe" }
cardinal  → { "type": "roster", "agents": [ ... ] }      (initial snapshot)
cardinal  → { "type": "agent_update", "agent": { ... } } (on each change)
cardinal  → { "type": "error", "reason": "auth_failed" } + close 4401
```

Rules:
- **Dual auth by role**: dashboard authenticates during the WS HTTP *upgrade* (httpOnly cookie, JS never reads the JWT); agent authenticates with its key in the first message.
- **Key is identity**: agent name is derived from the key, `hello` cannot declare a different name.
- **Classification**: `kind = kind_override(from key) ?? (device == "localhost" ? "subagent" : "agent")`. Recalculated on each `hello` (device may change).
- Marked offline if 2 pings (60s) elapse without a `pong`.
- No `task` or any other Cardinal message initiating work on the agent exists (passive).
- Close codes: 4401 auth, 4400 invalid message.

## 5. Data (bun:sqlite)

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
  key_hash      TEXT NOT NULL UNIQUE,           -- SHA-256 hex of the key
  agent_name    TEXT NOT NULL REFERENCES agents(name),
  kind_override TEXT CHECK (kind_override IN ('agent','subagent') OR kind_override IS NULL),
  created_by    TEXT NOT NULL DEFAULT 'human',  -- 'human' | 'system' (system = future router, auto-revocable)
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

- `keygen` **pre-registers** the agent (row in `agents`) → roster can display known agents that have never connected (offline, dimmed).
- Keys with `created_by='human'` are **never** automatically deleted (rule set by the owner).
- Migrations: `PRAGMA user_version`, sequential SQL migrations in `db/migrations/`.

## 6. REST API

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /api/auth/login` | none | `{user, password}` → httpOnly cookie `SameSite=Strict` with JWT (12h) |
| `POST /api/auth/logout` | yes | clears cookie |
| `GET /api/auth/me` | yes | current `{user}` |
| `GET /api/health` | none | `{status:"ok", version:"0.0.1"}` — version read from root `package.json` |
| `GET /api/agents` | yes | full roster (agents + subagents, filtered by UI) |
| `GET /api/agents/:name` | yes | detail + last N events |
| `GET /ws` | JWT cookie (dashboard) / key in `hello` (agent) | WS upgrade (see §4) |
| other | — | Vite build static assets, fallback to `index.html` |

Errors: failed login → generic 401 (do not leak whether user exists); missing/invalid JWT → 401; UI redirects to `/login`.

Keys CLI (runs with Bun on the server):
```
bun run --cwd backend keygen -- --agent shinon [--device pc] [--kind agent|subagent]   # creates and prints the key ONCE
bun run --cwd backend keygen -- --revoke shinon
bun run --cwd backend keygen -- --list
```

## 7. Frontend (SAO Theme)

- **Login**: SAO-styled screen; POST login → cookie; redirect to `/`.
- **Home / Agent Hub**: `AgentCard` grid — **only `kind='agent'`** (external devices). Online with agent-colored glow, offline dimmed. Collapsible "Subagents" section for `kind='subagent'`. All in real time via WS.
- **AgentDetail** (`/agents/:name`): info, status, `last_seen`, latest events. No task button (does not exist in Fase 0).
- **Settings**: account info (user, version) + note indicating password changes are managed via env. Read-only.
- **Version**: visible in sidebar footer (fetch to `/api/health`).
- State: React context + hooks (`useAuth`, `useRoster`). No external state library.
- Visual design per `context/ecosystem.md`: background `#0a0e27`/`#08070c`, accent `#00d4ff`, secondary `#8b5cf6`, JetBrains Mono + Inter, glowing-border panels, circular avatars with glow.

## 8. Client Example (`examples/ws-agent.ts`)

**Generic and minimal** WS client (native Bun WebSocket, zero deps): reads `CARDINAL_URL` and `CARDINAL_AGENT_KEY` from env, sends `hello`, responds to `ping` with `pong`, sends `bye` on SIGINT/SIGTERM, reconnects with exponential backoff. Intended for development and as a protocol reference for any real agent. **Not an SDK or Cardinal product.**

## 9. Deployment

- `deploy/Containerfile` multi-stage: stage 1 installs deps + Vite build; stage 2 copies backend + `frontend/dist` + root `package.json` (for version) onto `oven/bun`. `CMD bun backend/src/index.ts`. Single container.
- `deploy/quadlet/cardinal.container` + `cardinal-data.volume` (mounts `/data` → `DB_PATH=/data/cardinal.db`).
- `deploy/Caddyfile.example`: generic reverse proxy (no domain defined for now).
- Env: `ADMIN_USER`, `ADMIN_PASSWORD_HASH`, `JWT_SECRET`, `PORT` (default 8787), `DB_PATH`.

## 10. Testing (`bun test`)

- **Unit**: JWT sign/verify/expiration; key generation (format, hash, validation, revocation); DB repositories (upsert agent, events); protocol handlers (pure functions with zod); agent/subagent classification logic (incl. `kind_override`).
- **Integration**: server on ephemeral port + temporary DB → full mock agent flow (hello → welcome → pong → bye) verifying roster via REST and `agent_update` via dashboard WS; login flow → cookie → protected endpoint; SPA fallback.
- Frontend: typecheck + Vite build as verification (no component test suite in Fase 0).

## 11. Out of Scope (Fase 0)

Task dispatching to agents; OpenAI-compatible `/v1/*` endpoint and model routing; dynamic lifecycle for localhost keys; one-shot container orchestration; RAG/memory/session history; knowledge graph; automations; multi-user; password change from UI; rate limiting.

## 12. Next Phases (Updated with the Extra)

- **Fase 1 — Memory + RAG**: vault context service, vector store, session history.
- **Fase 2 — Router + Key Factory + One-shot Agents**:
  - **OpenAI-compatible** endpoint (`/v1/chat/completions`) authenticated using the same `sk-cardinal-*` keys (the key is already the identity starting in Fase 0).
  - Model routing by task type; budgets and failsafes per key; usage dashboard.
  - **Container orchestration** (Podman/Docker API compatible) with minimal resources to run **one-shot agents** with task-specific models.
  - **Dynamic keys for localhost**: system creates and revokes `created_by='system'` keys for one-shot agents; `created_by='human'` keys are never touched except by explicit human action.
- **Fase 3 — Knowledge Graph**.
- **Fase 4+ — Automations** (cron, webhooks, triggers).

## 13. Versioning

`vMAJOR.FASE.UPDATE`:
- **MAJOR**: `0` until passing all testing phases and being declared a stable product → `1`.
- **FASE**: current roadmap phase (0, 1, 2, ...).
- **UPDATE**: increments with each project update within the phase.
- Source of truth: `version` in root `package.json`. Backend reads it from there (Bun JSON import) and exposes it on `/api/health`; dashboard displays it. Initial version: **v0.0.1**.

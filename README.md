# Cardinal System

Central backend of the SAO agent ecosystem: identity (`sk-cardinal-*`), context (memories, RAG, profiles), task blackboard, agent-to-agent mailbox, LLM router, and web dashboard. A [Bun](https://bun.sh) + SQLite monolith that serves API, WebSocket, and static assets from a single process. In production, a single container behind Caddy.

Cardinal v2 thesis: **orchestration is commodity**. Cardinal is the brain (identity + context + blackboard); herdr, Hermes, and CLIs are the hands.

**Version:** v0.2.5 (Phase 2 — Blackboard + MCP + Pool, in progress). Source of truth: root `package.json` (`MAJOR.FASE.PATCH`).

| Phase | What | Status |
|-------|------|--------|
| 0 | Living skeleton (JWT, WS hub, keys, dashboard) | Complete |
| 1 | Context Store (profiles, souls, skills, memory, RAG, devices) | Complete |
| 2 | Blackboard, MCP hub, key pool / router | In progress |

Roadmap: [`docs/roadmap.md`](docs/roadmap.md). Vision: [`docs/vision.md`](docs/vision.md). v2 spec: [`docs/superpowers/specs/2026-08-12-cardinal-v2-architecture.md`](docs/superpowers/specs/2026-08-12-cardinal-v2-architecture.md).

## What is in today

- **Human auth:** JWT in `httpOnly` cookie (dashboard login)
- **Agent auth:** `sk-cardinal-*` keys (SHA-256 in DB, scopes + budget tokens/USD + expiry)
- **Agent Hub:** native WebSocket on `/ws` (roster, ping/pong, events)
- **Context Store:** profiles, souls, skills, memory mirror, sessions, RAG proxy
- **Blackboard:** tasks CRUD + claim/complete, UI `/tasks`, WS broadcast
- **Mailbox:** `GET/POST /api/messages` (agent-to-agent handoff; key = identity)
- **MCP hub:** `packages/mcp` on `:8789` (memory, board, mailbox tools)
- **Router:** `POST /v1/chat/completions` + `GET /v1/models` (Bearer `sk-cardinal-*`); Fusion/MoA with `model=fusion`
- **Router UI:** operative catalog at `/router` (JWT; providers, aliases, chains)
- **Keys UI:** create / list / revoke at `/keys` (scopes, tokens, expiry, USD cap)

## Requirements

- [Bun](https://bun.sh) >= 1.2
- [Podman](https://podman.io) (dev with `compose.yaml` or Quadlet deploy)

## Development setup

Bun workspaces monorepo (`packages/*`, `backend`, `frontend`). Install **from the root**.

```bash
git clone <repo-url> && cd cardinal-system
bun install

cp deploy/env.example .env
bun -e 'console.log(await Bun.password.hash("your-password"))'  # -> ADMIN_PASSWORD_HASH
openssl rand -hex 32                                            # -> JWT_SECRET
openssl rand -hex 32                                            # -> POOL_SECRET (encrypts provider API keys)

# API key for an agent (printed ONCE only — save it)
bun run keygen -- --agent <agent-name>

# Terminal 1: backend at http://127.0.0.1:8787
bun run dev:backend

# Terminal 2: frontend at http://127.0.0.1:5173
bun run dev:frontend
```

Open http://127.0.0.1:5173 (use `127.0.0.1`, not `localhost` — cookies do not cross over). Login: `ADMIN_USER` + the hashed password.

Dashboard: Overview, Agents, Keys (`/keys`), Tasks (`/tasks`), Router (`/router`), Settings.

### With Podman Compose

```bash
cp deploy/env.example .env   # fill in hashes/secrets
# Optional MCP: VAULTS_HOST_PATH=/path/to/vaults  and CARDINAL_SERVICE_KEY=sk-cardinal-...
podman-compose up
```

- Backend: `127.0.0.1:8787`
- Frontend: `127.0.0.1:5173`
- MCP: `127.0.0.1:8789` (memory + board tools; vaults mounted read-only)

## Example agent

With the backend running, connect the reference WS client:

```bash
CARDINAL_AGENT_KEY=sk-cardinal-... bun examples/ws-agent.ts
```

The agent appears online in the dashboard; on close (Ctrl+C) it sends `bye` and goes offline.

## Production (Podman + Quadlet + Caddy)

```bash
# 1. Image build (single container: API + WS + statics)
podman build -t cardinal-system -f deploy/Containerfile .

# 2. Quadlet units and secrets
mkdir -p ~/.config/containers/systemd ~/.config/cardinal
cp deploy/quadlet/cardinal.container deploy/quadlet/cardinal-data.volume ~/.config/containers/systemd/
cp deploy/env.example ~/.config/cardinal/env   # edit and fill in the values

# 3. Activate the service
systemctl --user daemon-reload
systemctl --user start cardinal
```

The container publishes on `127.0.0.1:8787` and persists the DB on the `cardinal-data` volume (`/data/cardinal.db`). To expose it, use `deploy/Caddyfile.example` as the base in the host Caddy (`:8080` block for local, or the commented production block with the domain).

## Root scripts

| Script | Description |
|--------|-------------|
| `bun run dev:backend` | Backend with watch on http://127.0.0.1:8787 |
| `bun run dev:frontend` | Vite dev server on http://127.0.0.1:5173 |
| `bun run keygen -- ...` | API keys CLI: `--agent <name>`, `--revoke <name>`, `--list` |
| `bun run build` | Frontend production build -> `frontend/dist/` |
| `bun test` | Packages + backend suite |
| `bun run typecheck` | `tsc --noEmit` backend + frontend |

## Documentation

| Doc | Purpose |
|-----|---------|
| [`docs/roadmap.md`](docs/roadmap.md) | Phase priorities and status |
| [`docs/stack.md`](docs/stack.md) | Stack and technical decisions |
| [`docs/security.md`](docs/security.md) | Security model |
| [`AGENTS.md`](AGENTS.md) | Development rules (branching, TDD, roles) |
| [`docs/features/`](docs/features/) | What was done, why, decisions per feature |
| [`docs/features/2026-09-03-router-surface.md`](docs/features/2026-09-03-router-surface.md) | Router v0.2.5 index (dashboard + keys + fusion) |
| [`docs/guides/router-usage.md`](docs/guides/router-usage.md) | LLM router manual |

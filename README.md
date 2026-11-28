# Cardinal System

Central backend and Sovereign Context Policy Plane of the SAO agent ecosystem: identity (`sk-cardinal-*`), path-scoped Streamable HTTP MCP Context Hub (onboard, FTS5/QMD search, sandboxed handoffs/proposals), task blackboard, mailbox, and web dashboard. A [Bun](https://bun.sh) + SQLite monolith that serves API, WebSocket, and static assets alongside an isolated MCP server. In production, a rootless Podman pod (Caddy → nginx SPA → Bun backend).

Thesis: **orchestration and routing are commodity**. Cardinal focuses on identity, vault path-glob ACLs, and usage-gated context delivery; T3 Code, Hermes, and CLIs are the hands.

**Version:** v0.2.8 (Context Hub v2 Stage 1 shipped on `main`; 30-day usage gate active in [#62](https://github.com/snattydev/cardinal-system/issues/62)). Source of truth: root `package.json` (`MAJOR.FASE.PATCH`).

| Phase | What | Status |
|-------|------|--------|
| 0 | Living skeleton (JWT, WS hub, keys, dashboard) | Complete |
| 1 | Context Store (profiles, souls, skills, memory, RAG, devices) | Complete |
| 2 | Blackboard, MCP hub, key pool / router | Complete (`v0.2.6`) |
| **Hub v2** | **Streamable HTTP MCP Context Hub (ACL + FTS5/QMD + usage gate)** | **Shipped (`v0.2.7` on `main`; Quadlet MCP packaging in `v0.2.8`; 30-day usage gate active, [#62](https://github.com/snattydev/cardinal-system/issues/62))** |

Roadmap: [`docs/roadmap.md`](docs/roadmap.md). Vision: [`docs/vision.md`](docs/vision.md). Context Hub v2 spec: [`docs/features/2026-11-25-mcp-context-hub-v2.md`](docs/features/2026-11-25-mcp-context-hub-v2.md).

## What is in today

- **Human auth:** JWT in `httpOnly` cookie (dashboard login, IP failure rate-limited with `429` + `Retry-After`)
- **Agent auth:** `sk-cardinal-*` keys (SHA-256 in DB, scopes + budget tokens/USD + expiry)
- **Agent Hub:** native WebSocket on `/ws` (roster, ping/pong, events, `Origin` host check, 10s handshake timeout, connection caps)
- **Context Store:** profiles, souls, skills, memory mirror, sessions, RAG proxy
- **Blackboard:** tasks CRUD + claim/complete, UI `/tasks`, WS broadcast
- **Mailbox:** `GET/POST /api/messages` (agent-to-agent handoff; key = identity)
- **MCP Context Hub:** `packages/mcp` on `:8789` (`POST /mcp` Streamable HTTP, `GET /health`; deterministic `coding`/`hermes` onboarding, `cardinal_bootstrap_repo` tiered repo standards / "Configuration 101", path-glob ACLs with `personal/**` hard-deny, built-in FTS5 + optional QMD sidecar, sandboxed handoffs/proposals, sanitized `:ro` `cardinal_agent_config` / `cardinal_user_config` reads, `mcp_usage` telemetry)
- **Router:** `POST /v1/chat/completions` + `GET /v1/models` (Bearer `sk-cardinal-*`, or dashboard JWT on `/v1/models`; Fusion/MoA with `model=fusion`; frozen under Context Hub v2)
- **Router UI:** operative catalog at `/router` (JWT; providers, aliases, chains)
- **Keys UI:** create / list / revoke at `/keys` (scopes, tokens, expiry, USD cap)

## Requirements

- Git
- OpenSSL (secret generation)
- [Podman](https://podman.io) + a Compose provider (`podman-compose` package, or `podman compose` plugin)
- A copy of `deploy/env.example` as `.env` at the repo root

Host Bun is **not** required for the canonical path.

## Development setup

Bun workspaces monorepo (`packages/*`, `backend`, `frontend`). Canonical engine: **Podman**. `compose.yaml` is Compose spec, so `podman compose up` or `docker compose up` also consume this file; Podman is the project engine ([`AGENTS.md`](AGENTS.md)).

### Install the engine

Debian / Ubuntu / other apt-based:

```bash
sudo apt update
sudo apt install -y git openssl podman podman-compose
```

Fedora:

```bash
sudo dnf install -y git openssl podman podman-compose
```

Arch / Manjaro / other pacman-based:

```bash
sudo pacman -S --needed git openssl podman podman-compose
```

Canonical compose command: **`podman-compose`** (matches `compose.yaml` and [`docs/guides/pitfalls.md`](docs/guides/pitfalls.md)). If a distro ships `podman` but not the `podman-compose` package, install the provider at user level with `pipx install podman-compose` and keep using `podman-compose`.

If rootless Podman fails with subordinate UID/GID errors on **Debian-based** hosts, add subuids once and re-login (Fedora and Arch normally ship this with the `podman` package):

```bash
sudo usermod --add-subuids 100000-165535 --add-subgids 100000-165535 "$USER"
```

### First-run secrets (no host Bun)

```bash
git clone https://github.com/snattydev/cardinal-system.git && cd cardinal-system
cp deploy/env.example .env

openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # POOL_SECRET
openssl rand -hex 32   # INTERNAL_SERVICE_SECRET (optional; authenticates MCP -> backend /api/internal/*)
read -r -s -p "Admin password: " PW; echo
printf '%s' "$PW" | podman run --rm -i docker.io/oven/bun:1 bun -e 'const pw = await new Response(Bun.stdin.stream()).text(); console.log(await Bun.password.hash(pw));'
unset PW
# paste the hash into ADMIN_PASSWORD_HASH; set ADMIN_USER (default admin)
```

Do not put the plaintext password on the compose command line. If Bun is already on the host, `bun run bootstrap:password` remains valid (`scripts/bootstrap-admin-password.sh`). Activate enforced `.githooks/` once per clone with `bash scripts/install-hooks.sh` (`bun run hooks:install`).

MCP Context Hub: set `VAULTS_HOST_PATH` (mounted `:ro` at `/data/vaults`), `AGENT_STATE_HOST_PATH` (mounted `:rw` at `/data/agent-state`), and `CONFIGS_HOST_PATH` (populate with `bash scripts/sync-configs.sh`, mounted `:ro` at `/data/configs`) in `.env`. Optionally enable the QMD sidecar via `podman-compose --profile qmd up -d` with `QMD_URL=http://qmd:8181`. Generate scoped agent keys inside the backend container (`podman exec`), never host `bun run keygen` against a different DB — see [`docs/features/2026-11-25-mcp-context-hub-v2.md`](docs/features/2026-11-25-mcp-context-hub-v2.md) and [`docs/guides/pitfalls.md`](docs/guides/pitfalls.md).

### Start

```bash
podman-compose up
```

Published ports (all `127.0.0.1` only):

| Service | URL |
|---------|-----|
| Backend API + WS | http://127.0.0.1:8787 |
| Dashboard (Vite) | http://127.0.0.1:5173 |
| MCP | http://127.0.0.1:8789 |

Health: `GET http://127.0.0.1:8787/api/health` → `{"status":"ok","version":"0.2.8"}`. Open the dashboard at `http://127.0.0.1:5173` (not `localhost`: cookie origin). Login: `ADMIN_USER` + the password that produced the hash.

Dashboard: Overview, Agents, Keys (`/keys`), Tasks (`/tasks`), Router (`/router`), Settings.

Stop: `podman-compose down`. Wipe SQLite volume: `podman-compose down -v`.

Compose gotchas (`EBUSY` lockfile, env-not-injected, `--infra=false` port bugs): [`docs/guides/pitfalls.md`](docs/guides/pitfalls.md).

### Alternative: host Bun

Optional path for Cloud Agent (`.cursor/install.sh`) or hosts without a container engine. Same `.env` keys as above.

```bash
git clone https://github.com/snattydev/cardinal-system.git && cd cardinal-system
bun install

cp deploy/env.example .env
bun run bootstrap:password   # interactive; writes only ADMIN_PASSWORD_HASH to .env
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

## Termux (Android)

**Supported:** Termux is a git/SSH/browser client. Run Cardinal on a Debian/Fedora/Arch machine or VPS using the same `podman-compose` commands above. Native Android Termux cannot host Podman or Docker: the kernel usually lacks the cgroup/namespace setup those engines need. `proot-distro` is **not** a substitute.

### Experimental / unsupported — on-device containers

This subsection is **unsupported**: no CI, bind mounts and cgroups may fail. Do not file bugs against this path as if it were Linux Podman.

1. There is no supported Podman-on-Termux path.
2. The only known container path is a QEMU VM with Docker inside Termux, following [docker-in-termux](https://github.com/cyberkernelofficial/docker-in-termux) (Alpine x86_64 under `qemu-system-x86_64-headless`). On aarch64 phones this is full x86 emulation and is slow.
3. After `docker run hello-world` works **inside the VM**, clone this repo in the VM, copy `.env` as in Development setup, install a Compose plugin in the VM (`apk add docker-cli-compose` or equivalent), and run `docker compose up` using root `compose.yaml`.
4. Extra QEMU `hostfwd` entries beyond SSH `:2222` that Cardinal needs: `tcp::8787-:8787`, `tcp::5173-:5173`, `tcp::8789-:8789`. Then the Android browser uses `http://127.0.0.1:5173`.

## Example agent

With the backend running, connect the reference WS client:

```bash
CARDINAL_AGENT_KEY=sk-cardinal-... bun examples/ws-agent.ts
```

The agent appears online in the dashboard; on close (Ctrl+C) it sends `bye` and goes offline.

## Production (Podman + Quadlet + Caddy)

Production is a **rootless Podman pod** with four containers (Caddy :80 → nginx SPA :8000 → Bun backend :8787, plus the MCP Context Hub on `127.0.0.1:8789`). The pod publishes `127.0.0.1:8080:80` and `127.0.0.1:8789:8789` (loopback only). SQLite lives on volume `cardinal-data`; MCP reads vaults `:ro` and writes only to `agent-state`.

All steps: [`deploy/README.md`](deploy/README.md). Health in prod: `curl http://127.0.0.1:8080/api/health`.

## Root scripts

| Script | Description |
|--------|-------------|
| `bun run dev:backend` | Backend with watch on http://127.0.0.1:8787 |
| `bun run dev:frontend` | Vite dev server on http://127.0.0.1:5173 |
| `bun run start` | Start backend without watch |
| `bun run build` | Frontend production build -> `frontend/dist/` |
| `bun test` | Packages + backend + scripts suite |
| `bun run test:e2e` | Playwright E2E tests (`frontend/e2e/`) |
| `bun run typecheck` | `tsc --noEmit` on `backend`, `packages/mcp`, and `frontend` |
| `bun run keygen -- ...` | API keys CLI: `--agent <name>`, `--revoke <name>`, `--list` |
| `bun run bootstrap:password` | Interactive TTY hash generator for `ADMIN_PASSWORD_HASH` |
| `bun run hooks:install` | Activate versioned `.githooks/` (`core.hooksPath`) |
| `bun run standards:sync` | Regenerate `.githooks/` and `scripts/install-hooks.sh` from `packages/mcp/src/repo-standards.ts` |

## Documentation

| Doc | Purpose |
|-----|---------|
| [`docs/roadmap.md`](docs/roadmap.md) | Phase priorities and status |
| [`CHANGELOG.md`](CHANGELOG.md) | Release history and per-version changes |
| [`docs/stack.md`](docs/stack.md) | Stack and technical decisions |
| [`docs/security.md`](docs/security.md) | Security model |
| [`SECURITY.md`](SECURITY.md) | Vulnerability reporting policy and deployment hardening checklist |
| [`docs/api.md`](docs/api.md) | REST, WebSocket, JWT recipe |
| [`docs/features/2026-11-25-mcp-context-hub-v2.md`](docs/features/2026-11-25-mcp-context-hub-v2.md) | Context Hub v2 MCP surface, ACLs, keygen, usage gate |
| [`docs/features/2026-11-27-oss-security-hardening.md`](docs/features/2026-11-27-oss-security-hardening.md) | OSS security hardening and governance summary |
| [`docs/guides/pitfalls.md`](docs/guides/pitfalls.md) | Operational gotchas |
| [`deploy/README.md`](deploy/README.md) | Production Quadlet pod (Caddy, nginx, backend, MCP) |
| [`AGENTS.md`](AGENTS.md) | Development rules (language: English only, branching, TDD, roles) |
| [`docs/features/`](docs/features/) | What was done, why, decisions per feature |
| [`docs/features/2026-09-03-router-surface.md`](docs/features/2026-09-03-router-surface.md) | Router v0.2.5 index (dashboard + keys + fusion) |
| [`docs/guides/router-usage.md`](docs/guides/router-usage.md) | Legacy LLM router manual (frozen) |

## Future: split the monorepo

Recorded intent only. No extraction in this repository yet.

Today the repo is Bun workspaces (`packages/*`, `backend`, `frontend`) with one `bun.lock`. Compose bind-mounts the workspace root. Both Containerfiles `COPY` every workspace `package.json` so `bun install` resolves, including `frontend/package.json` inside the backend image.

The frontend has **zero** `@cardinal/*` imports. It talks HTTP/WS only (`VITE_API_URL` / `VITE_WS_URL` / `VITE_HOST` in `frontend/vite.config.ts`) and is the first extractable repo.

MCP is already a second process (`packages/mcp`, compose `:8789`) but still a workspace package depending on `@cardinal/keys`. Backend `cardinal-backend` depends on `@cardinal/{core,db,auth,keys,ws,rag,router,worker}` and owns the SQLite file. `packages/worker` (N1, merged and frozen under Context Hub v2) depends on `@cardinal/core` only.

**Extraction order (when later scheduled):**

1. Publish or vendor `@cardinal/core` (and then `db`, `keys`, …) as versioned packages so workspaces are not required at install time.
2. Extract `frontend/` first (own repo, own Containerfile; env `VITE_API_URL` / `VITE_WS_URL` already exist).
3. Extract `packages/mcp` as its own image/repo once it does not need the root workspace glob (today compose mounts `backend/` and `frontend/` only so `bun install` accepts `workspaces`).
4. Extract `packages/worker` with `deploy/Containerfile.worker` if ever un-frozen.
5. Leave `backend` + remaining `@cardinal/*` together until the library packages are published; do not split `db` from the process that opens `cardinal.db`.

## Security

Report vulnerabilities privately as described in [`SECURITY.md`](SECURITY.md). Security model and operational practices: [`docs/security.md`](docs/security.md).

## License

[MIT](LICENSE)

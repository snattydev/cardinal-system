# Cardinal System - Deploy Guide

## Architecture

The Cardinal System runs as a **Podman pod** with four containers sharing a
network namespace. They communicate via `localhost` / `127.0.0.1` - no exposed
ports needed between them.

```
┌──────────────────────────────────────────────────────────────┐
│                        cardinal pod                           │
│                                                               │
│  cardinal-caddy (port 80) ← pod publishes → :8080            │
│        │                                                      │
│        ▼                                                      │
│  cardinal-frontend (nginx, port 8000)                         │
│        │                                                      │
│        ├─ /api/*  ──► cardinal-backend:8787                   │
│        ├─ /ws     ──► cardinal-backend:8787                   │
│        └─ /*      ──► /usr/share/nginx/html (SPA)             │
│                                                               │
│  cardinal-backend (Bun, port 8787)                            │
│    - REST API (/api/*)                                        │
│    - WebSocket  (/ws)                                         │
│    - SQLite DB on cardinal-data volume                        │
│                                                               │
│  cardinal-mcp (Bun, port 8789) ← pod publishes → :8789        │
│    - Streamable HTTP MCP (POST /mcp, GET /health)             │
│    - Vaults :ro, agent-state :rw, configs :ro                 │
└──────────────────────────────────────────────────────────────┘
```

Inside the pod network namespace, `cardinal-mcp` listens on `:8789` (accessible
to sibling containers in the pod netns). On the host, `cardinal.pod` publishes
only `127.0.0.1:8789:8789` (loopback only), and MCP is never routed through
Caddy or exposed beyond host loopback.

The optional `cardinal-qmd` (`:8181`) search sidecar is not part of this pod.
It runs through root `compose.yaml` when enabled (see root
[`README.md`](../README.md) and
[`docs/features/2026-11-25-mcp-context-hub-v2.md`](../docs/features/2026-11-25-mcp-context-hub-v2.md)).

## Prerequisites

- Podman >= 4.6 (rootless)
- systemd --user enabled
- `~/.config/containers/systemd/` directory exists

## Quick Start

```bash
# 1. Build the images (--format docker preserves HEALTHCHECK metadata)
podman build --format docker -t localhost/cardinal-backend:latest -f deploy/Containerfile .
podman build --format docker -t localhost/cardinal-frontend:latest -f deploy/Containerfile.frontend .
podman build --format docker -t localhost/cardinal-mcp:latest -f deploy/Containerfile.mcp .

# 2. Copy Quadlet files
cp -r deploy/quadlet/* ~/.config/containers/systemd/

# 3. Create config, env, and data directories
mkdir -p ~/.config/cardinal
mkdir -p ~/.local/share/cardinal/{vaults,agent-state,configs}
cp deploy/env.example ~/.config/cardinal/env
cp deploy/mcp.env.example ~/.config/cardinal/mcp.env
cp deploy/Caddyfile ~/.config/cardinal/Caddyfile
# Edit ~/.config/cardinal/env - set ADMIN_PASSWORD_HASH, JWT_SECRET, POOL_SECRET,
# and INTERNAL_SERVICE_SECRET (leave DB_PATH unset in Quadlet).
# Edit ~/.config/cardinal/mcp.env - set the SAME INTERNAL_SERVICE_SECRET and
# any CARDINAL_DENY_PREFIXES overrides.

# 4. Reload systemd and start the pod
systemctl --user daemon-reload
systemctl --user start cardinal-pod.service

# 5. Verify
curl http://127.0.0.1:8080/api/health
curl http://127.0.0.1:8789/health
```

Note on cold start: `cardinal-mcp` orders `After=cardinal-backend.service`
without `Requires=` so backend maintenance restarts do not stop MCP. On cold
boot, MCP may answer `401` briefly for authenticated calls until
`cardinal-backend` opens `:8787`, then recover automatically on the next call.

`deploy/Caddyfile` includes a commented `cardinal.example.com` block for enabling automatic TLS on a real domain.

## Image Build Details

Always pass `--format docker` to `podman build`; Podman's default OCI image
format drops `HEALTHCHECK` instructions during build.

### cardinal-backend (`deploy/Containerfile`)
- Base: `oven/bun:1-slim`
- Runs as non-root `USER bun` with `/data` owned by `bun:bun`
- Backend source only (no frontend build)
- `package.json` at root is included for the `/api/health` version endpoint
- HEALTHCHECK: Bun's built-in `fetch` against `/api/health`

### cardinal-frontend (`deploy/Containerfile.frontend`)
- Multi-stage: builds React app with `oven/bun:1`, serves with `nginx:alpine`
- nginx config at `deploy/nginx.conf`
- Serves static SPA with fallback to `index.html`
- Blocks `/api/internal/*` (`403`) from external clients and preserves `X-Forwarded-Proto`
- Proxies `/api/` and `/ws` to `cardinal-backend:8787`

### cardinal-mcp (`deploy/Containerfile.mcp`)
- Base: `oven/bun:1-slim`, runs as non-root `USER bun`
- `/data` contains `vaults`, `agent-state`, and `configs`, owned by `bun:bun`
- All workspace manifests are copied so `bun install` resolves and
  `packages/mcp/src/server.ts` can import the root `package.json` version
- Default environment baked into the image: `PORT=8789`,
  `CARDINAL_BACKEND_URL=http://127.0.0.1:8787`, `/data/vaults`,
  `/data/agent-state`, `/data/configs`, `/tmp/cardinal-mcp-index.db`,
  `CARDINAL_DENY_PREFIXES=personal`, `CARDINAL_GIT_AUTOCOMMIT=true`
- HEALTHCHECK: Bun's built-in `fetch` against `http://127.0.0.1:8789/health`
- `CARDINAL_INDEX_DB` points at `/tmp` because the FTS5 index is a
  rebuildable cache; the source vaults stay the durable record

## Quadlet Files (`deploy/quadlet/`)

| File | Purpose |
|------|---------|
| `cardinal.pod` | Pod definition, publishes 8080->80 and 8789->8789 (loopback) |
| `cardinal-backend.container` | Bun backend, AutoUpdate=registry, `User=1000:1000`, 256M/50% CPU |
| `cardinal-frontend.container` | nginx SPA server, `User=0`, 128M/25% CPU |
| `cardinal-mcp.container` | Bun MCP Context Hub, `User=1000:1000`, 256M/50% CPU |
| `cardinal-caddy.container` | Caddy reverse proxy, `User=0`, 64M/25% CPU |
| `cardinal-data.volume` | Persistent SQLite volume |

Copy all `.pod`, `.container`, and `.volume` files to `~/.config/containers/systemd/`.

## User Namespaces (`UserNS=keep-id`)

`cardinal.pod` sets `UserNS=keep-id:uid=1000,gid=1000`. Container UID/GID 1000
(the `bun` user) maps to UID/GID 1000 on the host, which is what makes the
bind mounts work for a non-root service:

- `cardinal-mcp` reads `~/.local/share/cardinal/vaults` (`:ro`) as the same
  identity that owns those files.
- `cardinal-mcp` writes `~/.local/share/cardinal/agent-state` (`:rw`) and the
  files land on disk owned by the host user, so they can be reviewed and
  committed manually without permission mismatches.
- Because Podman `keep-id` overrides default image users to UID 1000,
  `cardinal-frontend` and `cardinal-caddy` explicitly set `User=0` so nginx
  (`/var/cache/nginx` + worker privilege drop) and Caddy (`:80` + `/config`)
  keep root inside the pod namespace, while `cardinal-backend` and
  `cardinal-mcp` explicitly pin `User=1000:1000`.
- Operators whose host UID/GID is not `1000` must update `uid=,gid=` in
  `cardinal.pod` and `User=` in `cardinal-backend.container` /
  `cardinal-mcp.container` to match `id -u` and `id -g`.

### Upgrading an Existing Pod to `keep-id`

If you already ran `cardinal-backend` with `cardinal-data.volume` before
`UserNS=keep-id:uid=1000,gid=1000` was added, the existing SQLite files inside
the volume may be owned by a subordinate UID from the previous namespace, making
`/data/cardinal.db` unwritable after the switch.

Before restarting with the updated `cardinal.pod`:

```bash
systemctl --user stop cardinal-pod.service
VOL_DIR="$(podman volume inspect systemd-cardinal-data --format '{{.Mountpoint}}' 2>/dev/null || podman volume inspect cardinal-data --format '{{.Mountpoint}}')"
# In keep-id, container UID 1000 (bun) maps to host UID 1000 (0:0 in podman unshare)
podman unshare chown -R 0:0 "$VOL_DIR"
```

Then copy the updated Quadlet units, run `systemctl --user daemon-reload`, and
start `cardinal-pod.service`.

## Serving Local Vaults, Agent State, and Configs

`cardinal-mcp.container` mounts three host paths under
`%h/.local/share/cardinal/`:

| Host path | Container path | Mode | Contents |
|-----------|----------------|------|----------|
| `%h/.local/share/cardinal/vaults` | `/data/vaults` | `:ro` | Markdown vaults and skills |
| `%h/.local/share/cardinal/agent-state` | `/data/agent-state` | `:rw` | Handoffs and skill proposals |
| `%h/.local/share/cardinal/configs` | `/data/configs` | `:ro` | Redacted config snapshots |

To point at existing local folders instead, edit the `Volume=` lines in
`cardinal-mcp.container` and use the absolute host path, for example
`Volume=%h/vaults:/data/vaults:ro`. Keep the source vaults read-only; only
`agent-state` should ever be `:rw`, and it must stay outside the vaults tree.
Treat `agent-state` contents written by agents as untrusted output until a
human reviews them.

### SELinux `:Z` caveat

Add `,Z` to a `Volume=` line only on SELinux-enforcing hosts that deny the
container access. `:Z` **relabels the host directory**, so adding it to a
shared personal folder changes ownership metadata for everything in it. Prefer
leaving it off and verifying with `podman run --rm <image> ls /data/vaults`
first. Use `:z` (lowercase, shared relabel) only when several containers need
the same label.

## Environment & Secrets

> **Production rule:** Do **not** create or rotate the admin password via an AI agent. Use a TTY-only bootstrap (`bun run bootstrap:password --cloud` / `scripts/bootstrap-admin-password.sh` on a host with Bun, or stdin piping via `podman run --rm -i docker.io/oven/bun:1`) so only `ADMIN_PASSWORD_HASH` is written. Never pass a plaintext password as a CLI argument. See [`docs/security.md`](../docs/security.md).

Backend and MCP use **separate** environment files so `cardinal-mcp` never
receives `ADMIN_PASSWORD_HASH`, `JWT_SECRET`, `POOL_SECRET`, or `CURSOR_API_KEY`.

### Backend (`~/.config/cardinal/env`, from `deploy/env.example`)

| Variable | Description |
|----------|-------------|
| `ADMIN_USER` | Admin username |
| `ADMIN_PASSWORD_HASH` | Argon2id/bcrypt hash (`bun run bootstrap:password --cloud` or stdin via `podman run --rm -i docker.io/oven/bun:1`) |
| `JWT_SECRET` | 64-char hex (`openssl rand -hex 32`) |
| `POOL_SECRET` | 64-char hex (`openssl rand -hex 32`), AES-256-GCM key for provider secrets |
| `INTERNAL_SERVICE_SECRET` | Shared 64-char hex (`openssl rand -hex 32`), authenticates `/api/internal/*` calls from MCP |
| `PORT` | Backend port, default 8787 |
| `DB_PATH` | Leave unset in Quadlet (image sets `/data/cardinal.db` on the volume) |

### MCP Context Hub (`~/.config/cardinal/mcp.env`, from `deploy/mcp.env.example`)

| Variable | Description |
|----------|-------------|
| `INTERNAL_SERVICE_SECRET` | Must match `~/.config/cardinal/env`. Required for authenticated MCP-to-backend `/api/internal/keys/validate` and `/api/internal/mcp/usage` calls; leaving it empty in both leaves internal routes unauthenticated on pod loopback |
| `CARDINAL_DENY_PREFIXES` | Comma-separated top-level prefixes hard-denied to agents (e.g. `personal,private-vault`) |
| `CARDINAL_GIT_AUTOCOMMIT` | Auto-commit single-file handoffs/proposals when both `git` binary and `agent-state/.git` exist (default `true`) |
| `QMD_URL` | Optional QMD sidecar URL; leave blank for built-in SQLite FTS5 |

`cardinal-mcp.container` also sets explicit `Environment=` lines (`PORT=8789`,
`CARDINAL_BACKEND_URL=http://127.0.0.1:8787`, `/data/*`) after
`EnvironmentFile`.

### Podman Secrets (optional, more secure)

Instead of the env file, use Podman secrets for sensitive values:

```bash
# Create secrets
podman secret create cardinal-jwt-secret <(openssl rand -hex 32)
podman secret create cardinal-admin-password <(echo '<your-password-hash>')

# Uncomment Secret= lines in cardinal-backend.container
```

## Git Auto-Commit Degradation

`packages/mcp/src/writer.ts` auto-commits handoff and proposal writes only when
**both** conditions hold: `git` is installed (`Bun.which("git")`) AND the
`agent-state` directory is an initialized git repository (`agent-state/.git`).
If either condition is missing, the write still succeeds and returns
`committed: false`.

`oven/bun:1-slim` does not ship `git`, and Quick Start creates `agent-state` as
a plain directory, so the default Quadlet setup writes files without
committing them:

- Writes, slug validation, symlink checks, and byte limits all still apply.
- `agent-state` stays a normal directory you can review and commit manually.
- To opt into auto-commit, run `git -C ~/.local/share/cardinal/agent-state init`
  and either build a derived image with `git` installed (`RUN apt-get update && apt-get install -y --no-install-recommends git` before `USER bun`) or use `compose.yaml` with a `git`-enabled base image.

## Optional: Scheduled Config Sync

`scripts/sync-configs.sh` copies allowlisted, secret-redacted host configs into
the `configs` mount. To keep that snapshot fresh, run it from a user timer.

```ini
# ~/.config/systemd/user/cardinal-sync-configs.service
[Unit]
Description=Snapshot redacted host configs for cardinal-mcp

[Service]
Type=oneshot
ExecStart=%h/cardinal-system/scripts/sync-configs.sh %h/.local/share/cardinal/configs
```

```ini
# ~/.config/systemd/user/cardinal-sync-configs.timer
[Unit]
Description=Daily cardinal-mcp config sync

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now cardinal-sync-configs.timer
```

Adjust `ExecStart` to your checkout path. The script only reads allowlisted
files and redacts inline tokens on the way out.

## Resource Limits

| Container | Memory | CPU Quota |
|-----------|--------|-----------|
| cardinal-backend | 256M | 50% |
| cardinal-frontend | 128M | 25% |
| cardinal-mcp | 256M | 50% |
| cardinal-caddy | 64M | 25% |

## Auto-Updates

`cardinal-backend` has `AutoUpdate=registry` - it will be updated when you
run `podman auto-update`. The frontend, MCP, and Caddy use fixed tags and
require manual rebuild/re-pull.

## Health Checks

- **Backend**: Bun fetch `http://127.0.0.1:8787/api/health` every 30s
- **Frontend**: wget `http://127.0.0.1:8000/` every 30s
- **MCP**: Bun fetch `http://127.0.0.1:8789/health` every 30s
- **Caddy**: (handled by Caddy's built-in health endpoint)

## Stopping & Removing

```bash
systemctl --user stop cardinal-pod.service
systemctl --user disable cardinal-pod.service
# To remove backend DB volume (CAUTION: destroys keys/board/usage DB):
podman volume rm systemd-cardinal-data || podman volume rm cardinal-data
# Note: cardinal-mcp bind mounts (~/.local/share/cardinal/{vaults,agent-state,configs})
# live directly on the host filesystem and are not managed or removed by Podman.
```

## .containerignore

The `.containerignore` at the project root prevents `node_modules/`, `.git/`,
`docs/`, `deploy/`, `*.md`, and `.env` files from being sent to the build
context - reducing image size and build time.

# Cardinal System — Deploy Guide

## Architecture

The Cardinal System runs as a **Podman pod** with three containers sharing a
network namespace. They communicate via `localhost` — no exposed ports needed
between them.

```
┌─────────────────────────────────────────────────────┐
│                    cardinal pod                      │
│                                                      │
│  cardinal-caddy (port 80) ← pod publishes → :8080   │
│        │                                             │
│        ▼                                             │
│  cardinal-frontend (nginx, port 8000)                │
│        │                                             │
│        ├─ /api/*  ──► cardinal-backend:8787          │
│        ├─ /ws     ──► cardinal-backend:8787          │
│        └─ /*      ──► /usr/share/nginx/html (SPA)    │
│                                                      │
│  cardinal-backend (Bun, port 8787)                   │
│    - REST API (/api/*)                               │
│    - WebSocket  (/ws)                                │
│    - SQLite DB on cardinal-data volume               │
└─────────────────────────────────────────────────────┘
```

## Prerequisites

- Podman >= 4.6 (rootless)
- systemd --user enabled
- `~/.config/containers/systemd/` directory exists

## Quick Start

```bash
# 1. Build the images
podman build -t cardinal-backend:latest -f deploy/Containerfile .
podman build -t cardinal-frontend:latest -f deploy/Containerfile.frontend .

# 2. Copy Quadlet files
cp -r deploy/quadlet/* ~/.config/containers/systemd/

# 3. Create config and env files
mkdir -p ~/.config/cardinal
cp deploy/env.example ~/.config/cardinal/env
cp deploy/Caddyfile ~/.config/cardinal/Caddyfile
# Edit ~/.config/cardinal/env — set ADMIN_PASSWORD_HASH and JWT_SECRET
# 4. Reload systemd and start the pod
systemctl --user daemon-reload
systemctl --user start cardinal-pod.service

# 5. Verify
curl http://localhost:8080/api/health
```

## Image Build Details

### cardinal-backend (`deploy/Containerfile`)
- Base: `oven/bun:1-slim`
- Backend source only (no frontend build)
- `package.json` at root is included for the `/api/health` version endpoint
- HEALTHCHECK: Bun's built-in `fetch` against `/api/health`

### cardinal-frontend (`deploy/Containerfile.frontend`)
- Multi-stage: builds React app with `oven/bun:1`, serves with `nginx:alpine`
- nginx config at `deploy/nginx.conf`
- Serves static SPA with fallback to `index.html`
- Proxies `/api/` and `/ws` to `cardinal-backend:8787`

## Quadlet Files (`deploy/quadlet/`)

| File | Purpose |
|------|---------|
| `cardinal.pod` | Pod definition, publishes port 8080->80 |
| `cardinal-backend.container` | Bun backend, AutoUpdate=registry, 256M/50% CPU |
| `cardinal-frontend.container` | nginx SPA server, 128M/25% CPU |
| `cardinal-caddy.container` | Caddy reverse proxy, 64M/25% CPU |
| `cardinal-data.volume` | Persistent SQLite volume |

Copy all `.pod`, `.container`, and `.volume` files to `~/.config/containers/systemd/`.

## Environment & Secrets

> **Cloud blocker (2026-08-20):** do **not** create or rotate the admin
> password via an AI agent. Local testing may use any throwaway password.
> Production (even single-user) must use a TTY-only bootstrap: human types the
> password (`read -s`), the host hashes it, only `ADMIN_PASSWORD_HASH` is
> stored. See `docs/security.md`. This script is backlog item 11 — required
> before the first cloud deploy.

The backend expects these environment variables (via `~/.config/cardinal/env`):

| Variable | Description |
|----------|-------------|
| `ADMIN_USER` | Admin username |
| `ADMIN_PASSWORD_HASH` | Bcrypt hash (generate with `bun -e 'console.log(await Bun.password.hash("your-password"))'`) |
| `JWT_SECRET` | 64-char hex (generate with `openssl rand -hex 32`) |
| `PORT` | Default 8787 |
| `DB_PATH` | Default `/data/cardinal.db` (on the volume) |

### Podman Secrets (optional, more secure)

Instead of the env file, use Podman secrets for sensitive values:

```bash
# Create secrets
podman secret create cardinal-jwt-secret <(openssl rand -hex 32)
podman secret create cardinal-admin-password <(echo '<your-password-hash>')

# Uncomment Secret= lines in cardinal-backend.container
```

## Resource Limits

| Container | Memory | CPU Quota |
|-----------|--------|-----------|
| cardinal-backend | 256M | 50% |
| cardinal-frontend | 128M | 25% |
| cardinal-caddy | 64M | 25% |

## Auto-Updates

`cardinal-backend` has `AutoUpdate=registry` — it will be updated when you
run `podman auto-update`. The frontend and Caddy use fixed tags and require
manual rebuild/re-pull.

## Health Checks

- **Backend**: Bun fetch `http://localhost:8787/api/health` every 30s
- **Frontend**: wget `http://localhost:8000/` every 30s
- **Caddy**: (handled by Caddy's built-in health endpoint)

## Stopping & Removing

```bash
systemctl --user stop cardinal-pod.service
systemctl --user disable cardinal-pod.service
# To remove data (CAUTION: destroys DB):
podman volume rm cardinal-data
```

## .containerignore

The `.containerignore` at the project root prevents `node_modules/`, `.git/`,
`docs/`, `deploy/`, `*.md`, and `.env` files from being sent to the build
context — reducing image size and build time.

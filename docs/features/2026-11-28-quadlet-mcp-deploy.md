# Quadlet Deployment for the MCP Context Hub

- **Date:** 2026-11-28
- **Branch:** `feature/#70-quadlet-mcp`
- **Issue:** Closes #70
- **Version:** `0.2.7` -> `0.2.8`

## Summary

The MCP Context Hub now ships as a first-class member of the production Podman
pod. Before this change the pod ran only Caddy, nginx, and the Bun backend;
`cardinal-mcp` existed in `compose.yaml` for local development and had no
production image or systemd unit. Operators had to keep a separate
`podman-compose` stack running just to serve context to their agents.

This change adds `deploy/Containerfile.mcp`, `deploy/mcp.env.example`, the
Quadlet unit `deploy/quadlet/cardinal-mcp.container`, explicit `User=` pinning
across all four pod container units under `UserNS=keep-id:uid=1000,gid=1000`,
loopback `PublishPort=127.0.0.1:8789:8789`, `--format docker` build commands so
`HEALTHCHECK` metadata is preserved, and a full deployment guide in
`deploy/README.md`.

## What Changed

### Image: `deploy/Containerfile.mcp`

- `FROM docker.io/oven/bun:1-slim`, `WORKDIR /app`, non-root `USER bun`.
- Image-level defaults for every MCP environment variable: `PORT=8789`,
  `CARDINAL_BACKEND_URL=http://127.0.0.1:8787`, `/data/vaults`,
  `/data/agent-state`, `/data/configs`, `/tmp/cardinal-mcp-index.db`,
  `CARDINAL_DENY_PREFIXES=personal`, `CARDINAL_GIT_AUTOCOMMIT=true`.
- Copies root manifests plus `packages/`, `backend/package.json`, and
  `frontend/package.json`, mirroring `deploy/Containerfile` and
  `deploy/Containerfile.worker` so workspace resolution and
  `packages/mcp/src/server.ts` (`import rootPkg from "../../../package.json"`)
  work cleanly.
- `RUN bun install --production --frozen-lockfile` then creates `/data/vaults`,
  `/data/agent-state`, and `/data/configs` owned by `bun:bun`.
- `HEALTHCHECK` uses Bun's built-in `fetch` against `http://127.0.0.1:8789/health`
  (preserved when built with `--format docker`, also added to `deploy/Containerfile`
  and `deploy/Containerfile.frontend` docs).
- `CMD ["bun", "packages/mcp/src/main.ts"]`.

### Quadlet units and secret isolation

- **`deploy/quadlet/cardinal.pod`:** Added `PublishPort=127.0.0.1:8789:8789`
  (host loopback only) and `UserNS=keep-id:uid=1000,gid=1000`.
- **`deploy/quadlet/cardinal-frontend.container` & `cardinal-caddy.container`:**
  Pinned `User=0` because Podman `keep-id` overrides default container users to
  UID `1000`, which breaks nginx `/var/cache/nginx` creation and worker drop.
- **`deploy/quadlet/cardinal-backend.container` & `cardinal-mcp.container`:**
  Pinned `User=1000:1000` (`bun`).
- **`deploy/mcp.env.example` & `cardinal-mcp.container`:** Isolated MCP into
  `%h/.config/cardinal/mcp.env` instead of sharing `%h/.config/cardinal/env`,
  so `cardinal-mcp` never receives `ADMIN_PASSWORD_HASH`, `JWT_SECRET`,
  `POOL_SECRET`, or `CURSOR_API_KEY`. Kept explicit `Environment=` overrides
  (`PORT=8789`, `CARDINAL_BACKEND_URL=http://127.0.0.1:8787`, `/data/*`,
  `/tmp/cardinal-mcp-index.db`).
- **Mounts & lifecycle:** Portable bind mounts under `%h/.local/share/cardinal/`
  (`vaults:ro`, `agent-state:rw`, `configs:ro`), `After=cardinal-backend.service`
  (no `Requires=` so backend restarts do not stop MCP), `Restart=always`,
  `MemoryMax=256M`, `CPUQuota=50%`, `WantedBy=cardinal-pod.service`.

### Configuration and docs

- `deploy/env.example`: Clarified `PORT=8787` is backend-only and added a
  multi-prefix example for `CARDINAL_DENY_PREFIXES`.
- `deploy/README.md`: Updated 4-container diagram, Quick Start (`--format docker`,
  `mcp.env.example`, cold-start `401` note), `UserNS=keep-id` (`User=0` /
  `User=1000:1000`, non-1000 UID adjustment, existing `cardinal-data.volume`
  `podman unshare chown -R 0:0` upgrade path), pod-internal vs loopback `:8789`
  posture, untrusted `agent-state` warning, `INTERNAL_SERVICE_SECRET` in MCP,
  both conditions for git auto-commit (`git` binary + `git init`), optional
  `sync-configs.sh` systemd user timer, and `Stopping & Removing` mount note.
- `package.json` `0.2.7` -> `0.2.8`; `CHANGELOG.md` `[0.2.8]` entry; `README.md`
  and `AGENTS/structure.md` updated.

## Why

Leaving `cardinal-mcp` on `compose.yaml` duplicated runtime definitions and
prevented systemd auto-start during the Stage 1 30-day usage gate (#62).
Separating `mcp.env` prevents credential blast-radius leakage from the backend,
and explicit `User=` pinning prevents `keep-id` from breaking nginx.

## Decisions

### Separate `mcp.env` instead of shared `env`

Sharing `~/.config/cardinal/env` exposed `ADMIN_PASSWORD_HASH`, `JWT_SECRET`,
and `POOL_SECRET` to the MCP process. Splitting `deploy/mcp.env.example` keeps
only `INTERNAL_SERVICE_SECRET`, `CARDINAL_DENY_PREFIXES`,
`CARDINAL_GIT_AUTOCOMMIT`, and `QMD_URL` in the MCP environment.

### Pod-level `UserNS=keep-id:uid=1000,gid=1000` with explicit `User=` per unit

Podman `keep-id` overrides default image `USER` to UID `1000` unless `User=` is
pinned. Pinning `User=0` on `cardinal-frontend` and `cardinal-caddy` keeps nginx
and Caddy running as container root inside the user namespace, while
`User=1000:1000` on `cardinal-backend` and `cardinal-mcp` aligns `bun` directly
with host UID `1000` for `:ro` vault reads and `:rw` `agent-state` writes.

### `--format docker` for `podman build`

Podman's default OCI format drops `HEALTHCHECK` instructions during build.
Using `--format docker` preserves healthcheck metadata across all images.

### `gitAutoCommit` graceful degradation

`packages/mcp/src/writer.ts` checks `Bun.which("git")` and `agent-state/.git`.
`oven/bun:1-slim` omits `git`, so writes safely return `committed: false`
without bloating the image; operators needing auto-commit can derive an image
with `git` and initialize `agent-state`.

### `CARDINAL_INDEX_DB` in `/tmp`

The FTS5 index is a rebuildable cache (`syncIndex(true)` runs on startup); `/tmp`
avoids a fourth persistent mount.

## Alternatives Considered

- **Shared `EnvironmentFile=%h/.config/cardinal/env` for MCP:** Rejected because
  it unnecessarily leaks `JWT_SECRET`, `POOL_SECRET`, and `ADMIN_PASSWORD_HASH`
  into the MCP container.
- **Unpinned `User=` under pod `keep-id`:** Rejected; verified empirically on
  Podman 6.2.1 that `nginx:alpine` fails with `mkdir() "/var/cache/nginx/client_temp" failed (13: Permission denied)` unless `User=0` is set.
- **Extend `compose.yaml` instead of Quadlet:** Rejected because Quadlet is the
  target production runtime.

## Verification

- `podman build --format docker` for backend, frontend, and MCP (healthcheck
  verified via `podman inspect`).
- Empirical 4-container pod smoke test under `--userns=keep-id:uid=1000,gid=1000`
  with `--user 0` (Caddy, nginx) and `--user 1000:1000` (backend, MCP) verifying
  both `GET /api/health` and `GET /health` (`200 OK`, `version: 0.2.8`) with zero
  nginx permission errors.
- Full `bun run typecheck`, `bun test` (594 pass), and `bun run build` in
  `docker.io/oven/bun:1`.

## Files Created / Modified

- Created: `deploy/Containerfile.mcp`, `deploy/mcp.env.example`,
  `deploy/quadlet/cardinal-mcp.container`,
  `docs/features/2026-11-28-quadlet-mcp-deploy.md`
- Modified: `deploy/Containerfile`, `deploy/Containerfile.frontend`,
  `deploy/quadlet/cardinal.pod`, `deploy/quadlet/cardinal-frontend.container`,
  `deploy/quadlet/cardinal-caddy.container`,
  `deploy/quadlet/cardinal-backend.container`, `deploy/env.example`,
  `deploy/README.md`, `package.json`, `CHANGELOG.md`, `README.md`,
  `AGENTS/structure.md`

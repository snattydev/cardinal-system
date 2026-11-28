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

This change adds `deploy/Containerfile.mcp`, the Quadlet unit
`deploy/quadlet/cardinal-mcp.container`, and the pod-level wiring
(`PublishPort=127.0.0.1:8789:8789`, `UserNS=keep-id:uid=1000,gid=1000`), plus a
full deployment guide in `deploy/README.md`.

## What Changed

### Image: `deploy/Containerfile.mcp`

- `FROM docker.io/oven/bun:1-slim`, `WORKDIR /app`, non-root `USER bun`.
- Image-level defaults for every MCP environment variable, so the container is
  runnable without an env file: `PORT=8789`,
  `CARDINAL_BACKEND_URL=http://127.0.0.1:8787`, `/data/vaults`,
  `/data/agent-state`, `/data/configs`, `/tmp/cardinal-mcp-index.db`,
  `CARDINAL_DENY_PREFIXES=personal`, `CARDINAL_GIT_AUTOCOMMIT=true`.
- Copies the root manifests plus `packages/`, `backend/package.json`, and
  `frontend/package.json`, mirroring `deploy/Containerfile` and
  `deploy/Containerfile.worker`. That set is what `bun install` needs for
  workspace resolution and what `packages/mcp/src/server.ts` needs for its
  `import rootPkg from "../../../package.json"` version lookup.
- `RUN bun install --production --frozen-lockfile` then creates `/data/vaults`,
  `/data/agent-state`, and `/data/configs` owned by `bun:bun`.
- `HEALTHCHECK` uses Bun's built-in `fetch` against `http://127.0.0.1:8789/health`,
  because the slim image has no `curl` or `wget`.
- `CMD ["bun", "packages/mcp/src/main.ts"]`.

### Quadlet unit: `deploy/quadlet/cardinal-mcp.container`

- Joins `Pod=cardinal.pod`, ordered `After=cardinal-backend.service` so the MCP
  unit starts once the backend unit has been processed. It does not add
  `Requires=`, so restarting the backend for maintenance does not take the MCP
  service down; the MCP validator simply returns `401` until the backend is
  reachable again.
- Reads `EnvironmentFile=%h/.config/cardinal/env` and then re-declares the MCP
  variables with explicit `Environment=` lines. Quadlet applies later keys last,
  so these values win over the shared env file.
- Portable bind mounts under `%h/.local/share/cardinal/`: `vaults:ro`,
  `agent-state:rw`, `configs:ro`.
- `Restart=always`, `MemoryMax=256M`, `CPUQuota=50%`, enabled by
  `WantedBy=cardinal-pod.service`.

### Pod: `deploy/quadlet/cardinal.pod`

- Description now names the MCP Context Hub.
- `PublishPort=127.0.0.1:8789:8789` (loopback only; MCP is not routed through
  Caddy and is never reachable off-host).
- `UserNS=keep-id:uid=1000,gid=1000` maps container UID/GID 1000 to host
  UID/GID 1000.

### Configuration and docs

- `deploy/env.example`: `PORT` clarified as backend-only, with a note that
  `cardinal-mcp.container` overrides it; `CARDINAL_DENY_PREFIXES` gained a
  multi-prefix example (`personal,private-vault`); `CARDINAL_GIT_AUTOCOMMIT`
  documents the degradation path.
- `deploy/README.md`: architecture diagram includes `cardinal-mcp`, the Quick
  Start builds the MCP image and creates the data directories, and new
  sections cover `UserNS=keep-id`, custom `Volume=` bind mounts plus the
  SELinux `:Z` caveat, `git` absent behavior, and an optional
  `systemd --user` service plus daily timer for `scripts/sync-configs.sh`.
  Resource Limits and Health Checks tables include MCP.
- `package.json` `0.2.7` -> `0.2.8`; `CHANGELOG.md` gains `[0.2.8]` with the
  MCP deploy work (#70), the review workflow templates (PR #73 / #69), and the
  previously unreleased docs realignment (PR #68), and the intro note now
  lists intermediate versions explicitly (`0.2.1`, `0.2.2`, `0.2.3`, `0.2.5`)
  because `0.2.4` never existed.
- `README.md`: version line and health example moved to `0.2.8`, production
  summary mentions four containers and the loopback MCP port, `CHANGELOG.md`
  added to the Documentation table.
- `AGENTS/structure.md`: indexes `deploy/Containerfile.mcp`, `scripts/`, and
  `context/`.

## Why

The Context Hub is the product. Leaving it out of the production pod meant the
production surface was incomplete and required a second, differently configured
runtime (compose) that duplicated vault mounts and env handling. Two
definitions of the same service drift: compose used `backend:8787` as the
backend URL, while the pod needs `127.0.0.1:8787` because containers share a
network namespace. Baking the pod-specific value into the image removes that
class of mistake.

## Decisions

### `PORT=8789` override after `EnvironmentFile`

`deploy/env.example` is a single file consumed by every unit. It contains
`PORT=8787` for the backend. If the MCP unit inherited it, `Bun.serve` would
bind 8787 inside the shared pod netns and collide with `cardinal-backend`.
Explicit `Environment=` lines after `EnvironmentFile` are the smallest correct
fix; the alternative, a separate env file per service, multiplies files the
operator has to keep in sync.

### `UserNS=keep-id:uid=1000,gid=1000`

The image runs as `USER bun` (UID 1000). Rootless Podman otherwise maps that to
a subordinate UID, which cannot read host-owned vault files mounted `:ro` or
write into `agent-state`. `keep-id` maps 1000 to the invoking user's 1000, so
both directions work without `chmod` gymnastics.

`keep-id` is pod-scoped and keeps root available inside the pod namespace,
which nginx (`:8000`) and Caddy still use. Mapping every container to the host
user (for example `--userns=keep-id` per container) would break those two.

### Portable `%h/.local/share/cardinal/` mounts

Hardcoding a personal home path leaks environment details and breaks the
pre-commit home-path check. Quadlet's `%h` specifier keeps the units portable
across machines while still resolving to an absolute host path at runtime.
Operators who already have vaults elsewhere swap the `Volume=` line; the
defaults just work after `mkdir -p`.

### SELinux `:Z` documented, not applied

`:Z` relabels the host directory, which is destructive on shared personal
folders. The units ship without a label and the README explains when to add it.
Blindly adding `,Z` is the common failure mode in other projects and can strip
the label other services rely on.

### `gitAutoCommit` graceful degradation

`packages/mcp/src/writer.ts` already resolves git with `Bun.which("git")` and
returns `committed: false` when it is missing, and `oven/bun:1-slim` has no
`git`. Rather than bloating the image with a package manager layer for an
optional convenience, the guide documents the behavior and how to opt in with a
derived image. Writes, ACL checks, symlink checks, and byte limits are
unaffected.

### `CARDINAL_INDEX_DB` in `/tmp`

The FTS5 index is a rebuildable cache; the vaults are the durable record. `/tmp`
avoids a fourth persistent mount and an ownership question. Re-indexing on
startup is already idempotent (`syncIndex(true)` is fire-and-forget in
`start()`).

## Alternatives Considered

- **Extend `compose.yaml` and skip Quadlet.** Rejected: the pod is the supported
  production path, and compose exists for local development only.
- **Add MCP to the backend process.** Rejected: `packages/mcp` is a separate
  process by design (`POST /mcp` per-request stateless transport) with its own
  resource envelope. Merging them would couple restarts and widen the backend's
  attack surface.
- **Route MCP through Caddy.** Rejected: MCP clients are host-local. Publishing
  on loopback only keeps the MCP surface off the network entirely.
- **`--security-opt label=disable` for the pod.** Rejected: it disables SELinux
  confinement for every container to solve one mount question.
- **`SELinux :Z` in the shipped units.** Rejected as noted above.

## Verification

- `podman build -t localhost/cardinal-mcp:latest -f deploy/Containerfile.mcp .`
- `podman run --rm localhost/cardinal-mcp:latest id` (confirms non-root `bun`)
- Full `typecheck`, `bun test`, and `bun run build` inside `docker.io/oven/bun:1`
- Leak grep for em/en dashes, tokens, and literal host home paths on the diff

## Files Created / Modified

- Created: `deploy/Containerfile.mcp`,
  `deploy/quadlet/cardinal-mcp.container`,
  `docs/features/2026-11-28-quadlet-mcp-deploy.md`
- Modified: `deploy/quadlet/cardinal.pod`, `deploy/env.example`,
  `deploy/README.md`, `package.json`, `CHANGELOG.md`, `README.md`,
  `AGENTS/structure.md`

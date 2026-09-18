---
description: Build + verification + deploy with Podman — tests, frontend build, containers, healthcheck
---

# /deploy — Build + verify + deploy

1. **Tests**: full `bun test` (all packages + backend).
2. **Build frontend**: `bun run build` in `frontend/` (typecheck + Vite build).
3. **Build containers**: `podman-compose build` at the repository root.
4. **Start**: `podman-compose up -d`.
5. **Healthcheck**: `curl -s http://127.0.0.1:8787/api/health` must respond with `{status: "ok", ...}`.
6. If anything fails, report the exact error and probable cause — do not continue if a step fails.
7. Remember: this is local dev. Prod uses Podman Quadlets (`deploy/quadlet/`) behind Caddy — never expose ports without Caddy.

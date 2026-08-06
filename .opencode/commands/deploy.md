---
description: Build + verificación + deploy con Podman — tests, build frontend, containers, healthcheck
---

# /deploy — Build + verify + deploy

1. **Tests**: `bun test` completo (todos los packages + backend).
2. **Build frontend**: `bun run build` en `frontend/` (typecheck + Vite build).
3. **Build containers**: `podman-compose build` en el root del repo.
4. **Levantar**: `podman-compose up -d`.
5. **Healthcheck**: `curl -s http://127.0.0.1:8787/api/health` debe responder `{status: "ok", ...}`.
6. Si algo falla, reportá el error exacto y la causa probable — no sigas si un paso falla.
7. Recordá: esto es dev local. Prod es Podman Quadlet (`deploy/quadlet/`) + Caddy delante — nunca exponer puertos sin Caddy.

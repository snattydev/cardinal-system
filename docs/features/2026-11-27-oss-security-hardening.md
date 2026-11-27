# Open-Source Security Hardening & Governance

- **Date:** 2026-11-27
- **Branch:** `chore/oss-security-hardening`
- **Status:** Implemented (ready for PR review)

## Summary

Hardened Cardinal System's network edges, authentication, container defaults, helper proxies, and open-source metadata before public repository release.

## What Changed

### Privacy & Documentation Cleanup
- Replaced personal domain placeholder (`cardinal.snatdy.dev` -> `cardinal.example.com`) in `deploy/Caddyfile` and `deploy/Caddyfile.example`.
- Replaced owner first-name references with `The owner` / `owner decision` in `docs/features/2026-09-03-router-surface.md` and `docs/superpowers/plans/2026-11-27` plan cleanup (`docs/superpowers/plans/2026-08-17-cardinal-v2-backlog.md`).
- Updated `README.md` secret bootstrap instructions to pipe passwords via stdin (`read -s` / `bun run bootstrap:password`) instead of CLI arguments.

### Backend, Auth, WS, RAG, and Worker Hardening
- **`GET /v1/models` auth (`backend/src/server.ts`, `backend/src/e2e-router.ts`):** Requires dashboard JWT cookie or active agent `sk-cardinal-*` Bearer key.
- **Internal service secret (`packages/core/src/config.ts`, `backend/src/server.ts`, `packages/mcp/src/{validator,server,main}.ts`):** Added optional `INTERNAL_SERVICE_SECRET` verified with SHA-256 + `crypto.timingSafeEqual` via `x-cardinal-internal-secret` on `/api/internal/keys/validate` and `/api/internal/mcp/usage`.
- **Login rate limiting (`packages/auth/src/rate-limit.ts`, `packages/auth/src/routes.ts`, `backend/src/server.ts`):** Added bounded fixed-window `LoginRateLimiter` (10 failures / 60s / 10,000 tracked keys) checked before Argon2id verification (`429` + `Retry-After`) and reset on valid login.
- **WebSocket hardening (`packages/ws/src/hub.ts`, `backend/src/server.ts`):** Enforced `Origin` host match on `/ws` upgrades (`403 forbidden_origin`), 10s unauthenticated handshake deadline (`4401 auth_timeout`), and unauthenticated (`100`) / dashboard (`50`) connection caps (`4429 too_many_connections`).
- **Legacy RAG scope ACL (`backend/src/api/rag.ts`):** Normalized vault-relative paths, blocked traversal segments, enforced `CARDINAL_DENY_PREFIXES` (`personal/**` denied unless `vault:allow-personal` plus an explicit scope matches), and replaced substring matching with prefix/glob matching.
- **Worker key passing (`backend/src/orchestrator/podman-driver.ts`):** Passed `CARDINAL_KEY` via child `env` (`-e CARDINAL_KEY`) rather than CLI argv.

### Deploy, Helpers, and Open-Source Governance
- **`deploy/Containerfile`:** Configured `/data` ownership for `bun:bun` and switched runtime to non-root `USER bun`.
- **`deploy/nginx.conf`:** Blocked `/api/internal/` (`403`) and preserved `X-Forwarded-Proto` via `map`.
- **`deploy/env.example` & `compose.yaml`:** Documented and wired `INTERNAL_SERVICE_SECRET`.
- **`scripts/omp-gateway.sh` & `scripts/vault-query-proxy.py`:** Changed default bind host from `0.0.0.0` to `127.0.0.1`, added fail-closed checks for unauthenticated non-loopback runs, and switched `vault-query-proxy.py` token comparison to `hmac.compare_digest` with English messages.
- **OSS Governance:** Added MIT `LICENSE`, `package.json` `"license": "MIT"`, `SECURITY.md`, `.github/workflows/ci.yml`, and updated `docs/security.md`.

## Verification

Verified via containerized `oven/bun:1` run (`typecheck`, full `bun test` across packages/backend/scripts, `bun run build`), host shell/Python syntax and fail-closed checks, and leak grep.

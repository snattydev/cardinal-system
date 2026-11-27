# Cardinal System — Technical Stack

> What we use and why. For agents that need to understand the technical decisions.

---

## Languages and runtime

| Layer | Technology | Version | Why |
|-------|-----------|---------|-----|
| Backend | TypeScript + Bun | `oven/bun:1` | `Bun.serve`, `bun:sqlite`, typed without build |
| MCP Context Hub | TypeScript + Bun + `@modelcontextprotocol/sdk` | `^1.32.2` | Stateless Streamable HTTP (`POST /mcp` on `:8789`) |
| Frontend | React 19 + TypeScript + Vite | Vite + React 19 | Fast HMR, complex state |
| CLI & helpers | Bun scripts + bash + Python 3 | — | `keygen`, `bootstrap:password`, config sync, mock/proxy helpers |

## Database & search

| Engine | Library / Component | Store / Config |
|--------|---------------------|----------------|
| Relational store | SQLite via `bun:sqlite` (native) | `/data/cardinal.db` (dev volume or Quadlet `cardinal-data`) |
| Vault full-text search | SQLite FTS5 (`porter unicode61`) | Built into `packages/mcp/src/search.ts` (zero-dependency BM25 + post-query ACL) |
| Optional hybrid search | `@tobilu/qmd` sidecar (`deploy/Containerfile.qmd`) | Node 22 container (`:8181`, compose `--profile qmd`), falls back to FTS5 |

**Migrations:** `PRAGMA user_version` + sequential migrations in `packages/db/src/schema.ts` (15 migrations through `mcp_usage`).

## Communication & auth

| Channel | Technology | Detail |
|---------|-----------|--------|
| REST API | `Bun.serve` | `/api/*` endpoints + frozen legacy `/v1/*` router & Fusion (`/v1/models`, `/v1/chat/completions`) |
| MCP Hub | `WebStandardStreamableHTTPServerTransport` | `POST /mcp` + `GET /health` on `:8789`, per-request stateless `McpServer`, path-glob ACLs |
| WebSocket | `Bun.serve` native | `/ws` endpoint, dual auth (cookie + key), `Origin` host check, 10s handshake deadline, connection caps |
| Human auth | JWT (HS256, `jose`) | `httpOnly` cookie, `SameSite=Strict`, 12h expiry, IP failure rate limiter (`LoginRateLimiter`) |
| Agent auth | API key `sk-cardinal-*` | SHA-256 in DB, scopes (`vault:*`, `config:read:*`, `board:*`, `mailbox:*`) + budgets + expiry |
| Internal service auth | `x-cardinal-internal-secret` | Optional `INTERNAL_SERVICE_SECRET` on `/api/internal/*` (`403` blocked at `deploy/nginx.conf`) |

## Styles

| Layer | Technology |
|-------|-----------|
| CSS | Tailwind CSS v4 |
| Fonts | Inter + JetBrains Mono (woff2 self-hosted in `frontend/public/fonts/`) |
| Theme | SAO dark: `#08070c` bg, `#00d4ff` accent, `#8b5cf6` secondary |

## Containers & deploy

| Environment | Tool | Config |
|-------------|------|--------|
| Local dev | Podman + `compose.yaml` | `cardinal-backend` (`:8787`), `cardinal-frontend` (`:5173`), `cardinal-mcp` (`:8789`), optional `cardinal-qmd` (`:8181`) |
| Prod | Podman Quadlet + Caddy (`deploy/quadlet/`) | Caddy (`:80`, published `127.0.0.1:8080`) -> nginx (`:8000`) -> non-root `USER bun` backend (`:8787`) |
| Worker (frozen) | `deploy/Containerfile.worker` | N1 maintenance worker container (frozen under Context Hub v2) |

## Monorepo

| Tool | Use |
|------|-----|
| Bun workspaces | `packages/{core,auth,keys,ws,db,rag,router,mcp,worker}`, `backend`, `frontend` |
| Root `package.json` | Version source of truth (`MAJOR.FASE.PATCH`, currently `0.2.7`) |

## Testing & CI

| Type | Tool / Command | Scope |
|------|----------------|-------|
| Unit + integration | `bun test` | `packages/*/src`, `backend/src`, `scripts/*.test.ts` |
| Typecheck | `bun run typecheck` | `tsc --noEmit` across `backend`, `packages/mcp`, `frontend` |
| Build | `bun run build` | Frontend production bundle (`frontend/dist/`) |
| E2E | `bun run test:e2e` | Playwright suite (`frontend/e2e/`) |
| CI & hooks | `.github/workflows/ci.yml` + `.githooks/` | Runs `typecheck`, `test`, `build` on PRs/pushes to `dev` and `main`; pre-commit secret/path checks |

---

*Updated: 2026-11-27. If the stack changes, this file is updated.*

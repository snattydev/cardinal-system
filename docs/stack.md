# Cardinal System — Technical Stack

> What we use and why. For agents that need to understand the technical decisions.

---

## Languages and runtime

| Layer | Technology | Version | Why |
|-------|-----------|---------|-----|
| Backend | TypeScript + Bun | latest | `Bun.serve`, `bun:sqlite`, typed without build |
| Frontend | React + TypeScript + Vite | latest | Fast HMR, complex state |
| CLI tools | Bun scripts | — | keygen, migrations, seeders |

## Database

| Engine | Library | File |
|--------|---------|------|
| SQLite | `bun:sqlite` (native) | `/data/cardinal.db` |

**Migrations:** `PRAGMA user_version` + sequential SQL files in `packages/db/migrations/`.

## Communication

| Channel | Technology | Detail |
|---------|-----------|--------|
| REST API | `Bun.serve` | Endpoints under `/api/` |
| WebSocket | `Bun.serve` native | Single `/ws` endpoint, dual auth (cookie + key) |
| Human auth | JWT (HS256, `jose`) | `httpOnly` cookie, `SameSite=Strict`, 12h expiry |
| Agent auth | API key `sk-cardinal-*` | SHA-256 in DB, identity = key |

## Styles

| Layer | Technology |
|-------|-----------|
| CSS | Tailwind CSS v4 |
| Fonts | Inter + JetBrains Mono (woff2 self-hosted in `frontend/public/fonts/`) |
| Theme | SAO dark: `#08070c` bg, `#00d4ff` accent, `#8b5cf6` secondary |

## Containers

| Environment | Tool | Config |
|-------------|------|--------|
| Local dev | Podman + `compose.yaml` | `cardinal-backend` (:8787) + `cardinal-frontend` (:5173) |
| Prod | Podman Quadlet + Caddy | Reverse proxy, auto-SSL |

## Monorepo

| Tool | Use |
|------|-----|
| Bun workspaces | `packages/*`, `backend`, `frontend` |
| Root `package.json` | version source of truth (`MAJOR.FASE.PATCH`) |

## Testing

| Type | Tool | When |
|------|------|------|
| Unit + integration | `bun test` | Required for core (auth, keys, ws, db, router) |
| Typecheck | `tsc --noEmit` | Frontend |
| Build | `bun run build` (Vite) | Frontend |

---

*Updated: 2026-07-28. If the stack changes, this file is updated.*

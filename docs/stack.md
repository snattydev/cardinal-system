# Cardinal System — Stack Técnico

> Qué usamos y por qué. Para agentes que necesitan entender las decisiones técnicas.

---

## Lenguajes y Runtime

| Capa | Tecnología | Versión | Por qué |
|------|-----------|---------|---------|
| Backend | TypeScript + Bun | latest | `Bun.serve`, `bun:sqlite`, tipado sin build |
| Frontend | React + TypeScript + Vite | latest | HMR rápido, estado complejo |
| CLI tools | Bun scripts | — | keygen, migraciones, seeders |

## Base de datos

| Motor | Librería | Archivo |
|-------|----------|---------|
| SQLite | `bun:sqlite` (nativo) | `/data/cardinal.db` |

**Migraciones:** `PRAGMA user_version` + archivos SQL secuenciales en `packages/db/migrations/`.

## Comunicación

| Canal | Tecnología | Detalle |
|-------|-----------|---------|
| REST API | `Bun.serve` | Endpoints bajo `/api/` |
| WebSocket | `Bun.serve` nativo | Un solo endpoint `/ws`, doble auth (cookie + key) |
| Auth humana | JWT (HS256, `jose`) | Cookie `httpOnly`, `SameSite=Strict`, 12h expiry |
| Auth agentes | API key `sk-cardinal-*` | SHA-256 en DB, identidad = key |

## Estilos

| Capa | Tecnología |
|------|-----------|
| CSS | Tailwind CSS v4 |
| Fuentes | Inter + JetBrains Mono (woff2 self-hosted en `frontend/public/fonts/`) |
| Tema | SAO dark: `#08070c` bg, `#00d4ff` accent, `#8b5cf6` secondary |

## Contenedores

| Entorno | Herramienta | Config |
|---------|-------------|--------|
| Dev local | Podman + `compose.yaml` | `cardinal-backend` (:8787) + `cardinal-frontend` (:5173) |
| Prod | Podman Quadlet + Caddy | Reverse proxy, auto-SSL |

## Monorepo

| Herramienta | Uso |
|-------------|-----|
| Bun workspaces | `packages/*`, `backend`, `frontend` |
| `package.json` raíz | version source of truth (`MAJOR.FASE.PATCH`) |

## Testing

| Tipo | Herramienta | Cuándo |
|------|-------------|--------|
| Unit + Integración | `bun test` | Obligatorio para core (auth, keys, ws, db, router) |
| Typecheck | `tsc --noEmit` | Frontend |
| Build | `bun run build` (Vite) | Frontend |

---

*Actualizado: 2026-07-28. Si cambia el stack, este archivo se actualiza.*

# Cardinal System

Backend central del ecosistema de agentes SAO: identidad (`sk-cardinal-*`), contexto (memorias, RAG, perfiles), blackboard de tareas, mailbox agente↔agente, router LLM y dashboard web. Monolito [Bun](https://bun.sh) + SQLite que sirve API, WebSocket y estáticos desde un solo proceso. En producción, un solo contenedor detrás de Caddy.

Tesis de Cardinal v2: **orquestación es commodity**. Cardinal es el cerebro (identidad + contexto + blackboard); herdr, Hermes y CLIs son las manos.

**Versión:** v0.2.5 (Fase 2 — Blackboard + MCP + Pool, en curso). Source of truth: `package.json` raíz (`MAJOR.FASE.PATCH`).

| Fase | Qué | Estado |
|------|-----|--------|
| 0 | Esqueleto vivo (JWT, WS hub, keys, dashboard) | Completa |
| 1 | Context Store (perfiles, souls, skills, memoria, RAG, devices) | Completa |
| 2 | Blackboard, MCP hub, key pool / router | En curso |

Roadmap: [`docs/roadmap.md`](docs/roadmap.md). Visión: [`docs/vision.md`](docs/vision.md). Spec v2: [`docs/superpowers/specs/2026-08-12-cardinal-v2-architecture.md`](docs/superpowers/specs/2026-08-12-cardinal-v2-architecture.md).

## Qué hay hoy

- **Auth humana:** JWT en cookie `httpOnly` (login dashboard)
- **Auth agentes:** keys `sk-cardinal-*` (SHA-256 en DB, scopes + budget tokens/USD + expiry)
- **Agent Hub:** WebSocket nativo en `/ws` (roster, ping/pong, eventos)
- **Context Store:** perfiles, souls, skills, memory mirror, sesiones, RAG proxy
- **Blackboard:** tasks CRUD + claim/complete, UI `/tasks`, broadcast WS
- **Mailbox:** `GET/POST /api/messages` (handoff agente↔agente; key = identidad)
- **MCP hub:** `packages/mcp` en `:8789` (memory, board, mailbox tools)
- **Router:** `POST /v1/chat/completions` + `GET /v1/models` (Bearer `sk-cardinal-*`); Fusion/MoA con `model=fusion`
- **Router UI:** catálogo operativo en `/router` (JWT; providers, aliases, cadenas)
- **Keys UI:** crear / listar / revocar en `/keys` (scopes, tokens, expiry, tope USD)

## Requisitos

- [Bun](https://bun.sh) ≥ 1.2
- [Podman](https://podman.io) (dev con `compose.yaml` o deploy Quadlet)

## Setup de desarrollo

Monorepo con Bun workspaces (`packages/*`, `backend`, `frontend`). Instalar **desde la raíz**.

```bash
git clone <repo-url> && cd cardinal-system
bun install

cp deploy/env.example .env
bun -e 'console.log(await Bun.password.hash("your-password"))'  # → ADMIN_PASSWORD_HASH
openssl rand -hex 32                                            # → JWT_SECRET
openssl rand -hex 32                                            # → POOL_SECRET (cifra API keys de providers)

# API key de un agente (se imprime UNA sola vez — guardarla)
bun run keygen -- --agent shinon

# Terminal 1: backend en http://127.0.0.1:8787
bun run dev:backend

# Terminal 2: frontend en http://127.0.0.1:5173
bun run dev:frontend
```

Abrir http://127.0.0.1:5173 (usar `127.0.0.1`, no `localhost` — las cookies no cruzan). Login: `ADMIN_USER` + la password hasheada.

Dashboard: Overview, Agents, Keys (`/keys`), Tasks (`/tasks`), Router (`/router`), Settings.

### Con Podman Compose

```bash
cp deploy/env.example .env   # completar hashes/secrets
# Opcional MCP: VAULTS_HOST_PATH=/path/to/vaults  y CARDINAL_SERVICE_KEY=sk-cardinal-...
podman-compose up
```

- Backend: `127.0.0.1:8787`
- Frontend: `127.0.0.1:5173`
- MCP: `127.0.0.1:8789` (memory + board tools; vaults montadas read-only)

## Agente de ejemplo

Con el backend corriendo, conectar el cliente WS de referencia:

```bash
CARDINAL_AGENT_KEY=sk-cardinal-... bun examples/ws-agent.ts
```

El agente aparece online en el dashboard; al cerrarlo (Ctrl+C) envía `bye` y pasa a offline.

## Producción (Podman + Quadlet + Caddy)

```bash
# 1. Build de la imagen (un solo contenedor: API + WS + estáticos)
podman build -t cardinal-system -f deploy/Containerfile .

# 2. Unidades Quadlet y secretos
mkdir -p ~/.config/containers/systemd ~/.config/cardinal
cp deploy/quadlet/cardinal.container deploy/quadlet/cardinal-data.volume ~/.config/containers/systemd/
cp deploy/env.example ~/.config/cardinal/env   # editar y completar los valores

# 3. Activar el servicio
systemctl --user daemon-reload
systemctl --user start cardinal
```

El contenedor publica en `127.0.0.1:8787` y persiste la DB en el volumen `cardinal-data` (`/data/cardinal.db`). Para exponerlo, usar `deploy/Caddyfile.example` como base en el Caddy del host (bloque `:8080` para local, o el bloque comentado de producción con el dominio).

## Scripts raíz

| Script | Descripción |
|--------|-------------|
| `bun run dev:backend` | Backend con watch en http://127.0.0.1:8787 |
| `bun run dev:frontend` | Vite dev server en http://127.0.0.1:5173 |
| `bun run keygen -- ...` | CLI de API keys: `--agent <name>`, `--revoke <name>`, `--list` |
| `bun run build` | Build de producción del frontend → `frontend/dist/` |
| `bun test` | Suite de packages + backend |
| `bun run typecheck` | `tsc --noEmit` backend + frontend |

## Documentación

| Doc | Para qué |
|-----|----------|
| [`docs/roadmap.md`](docs/roadmap.md) | Prioridades y estado de fases |
| [`docs/stack.md`](docs/stack.md) | Stack y decisiones técnicas |
| [`docs/security.md`](docs/security.md) | Modelo de seguridad |
| [`AGENTS.md`](AGENTS.md) | Reglas de desarrollo (branching, TDD, roles) |
| [`docs/features/`](docs/features/) | Qué se hizo, por qué, decisiones por feature |
| [`docs/features/2026-09-03-router-surface.md`](docs/features/2026-09-03-router-surface.md) | Índice router v0.2.5 (dashboard + keys + fusion) |
| [`docs/guides/router-usage.md`](docs/guides/router-usage.md) | Manual del LLM router |

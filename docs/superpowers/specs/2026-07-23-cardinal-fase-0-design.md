# Cardinal System — Fase 0: Esqueleto Vivo

> Spec de diseño. Versión del proyecto al escribir esto: **v0.0.1**
> Fecha: 2026-07-23 · Estado: aprobado por el usuario (brainstorming cerrado)

---

## 1. Visión de la fase

Levantar el sistema vivo mínimo: login humano, dashboard SAO, Agent Hub con roster en tiempo real vía WebSocket, y deploy containerizado. El Cardinal es **pasivo**: recibe conexiones de agentes y sirve estado; no despacha tareas.

## 2. Decisiones tomadas (brainstorming 2026-07-23)

| # | Decisión | Resultado |
|---|----------|-----------|
| 1 | Runtime | **Bun para todo**: `Bun.serve` (HTTP+WS), `bun:sqlite`, `bun test`, `Bun.password` |
| 2 | Orquestación | **Pasivo en Fase 0**. No existe mensaje `task`. El Cardinal nunca inicia trabajo en los agentes |
| 3 | Auth de agentes | **API key OpenAI-compatible por agente** (`sk-cardinal-<hex>`), emitida por el Cardinal, identidad = key. En DB solo se guarda el hash SHA-256 |
| 4 | User store humano | **Variables de entorno**: `ADMIN_USER` + `ADMIN_PASSWORD_HASH` (bcrypt, verificado con `Bun.password`). Sin tabla users, sin cambio de password desde UI en Fase 0 |
| 5 | Serving | **Un contenedor sirve todo**: API + WS + estáticos del build de Vite. Caddy (host) solo reverse proxy |
| 6 | Clasificación de agentes | `device == "localhost"` → **subagent** por defecto; no aparece en la grilla principal salvo `kind_override` explícito del humano al crear la key |
| 7 | Cliente de agente | **Agent-less**: el protocolo WS es el contrato; cualquier websocket normal sirve. Se incluye `examples/ws-agent.ts` como referencia, no un SDK |
| 8 | Deploy | Artefactos listos (Containerfile, Quadlet, Caddyfile de ejemplo) pero **foco en desarrollo**; sin subdominio por ahora |
| 9 | Versionado | `vMAJOR.FASE.UPDATE` — MAJOR=1 solo producto estable post-testing; FASE = fase del roadmap; UPDATE = cada update. Inicial: **v0.0.1** en root `package.json`, expuesta por `/api/health` y mostrada en el dashboard |

## 3. Arquitectura

Monorepo Bun workspaces:

```
cardinal-system/
├── package.json            # version: 0.0.1 (source of truth), workspaces
├── backend/
│   ├── package.json        # deps: jose, zod
│   └── src/
│       ├── index.ts        # bootstrap: config → db → servidor
│       ├── config.ts       # parseo/validación de env
│       ├── db/
│       │   ├── schema.sql
│       │   └── index.ts    # init + migraciones con PRAGMA user_version
│       ├── auth/
│       │   ├── jwt.ts      # sign/verify HS256 (jose)
│       │   └── routes.ts   # login, logout, me
│       ├── keys/
│       │   ├── index.ts    # generar sk-cardinal-*, hash SHA-256, validar
│       │   └── cli.ts      # keygen: create / revoke / list
│       ├── ws/
│       │   ├── hub.ts      # endpoint /ws único, rol por primer mensaje
│       │   └── protocol.ts # parseo/validación de mensajes (zod, funciones puras)
│       ├── api/
│       │   ├── agents.ts   # roster + detalle
│       │   └── health.ts   # version + status (público)
│       └── static.ts       # build de Vite con fallback SPA
├── frontend/
│   ├── package.json        # react, react-router-dom, tailwindcss v4, vite
│   └── src/
│       ├── main.tsx, App.tsx
│       ├── lib/api.ts      # fetch wrapper (cookie JWT)
│       ├── lib/ws.ts       # suscripción roster, reconnect con backoff
│       ├── hooks/          # useAuth, useRoster
│       ├── pages/          # Login, Home (AgentHub), AgentDetail, Settings
│       └── components/     # AgentCard, Sidebar, StatusBadge, tema SAO
├── examples/
│   └── ws-agent.ts         # cliente WS genérico de referencia (agent-less)
├── deploy/
│   ├── Containerfile       # multi-stage: build frontend → runtime bun
│   ├── Caddyfile.example
│   └── quadlet/            # cardinal.container + cardinal-data.volume
└── docs/superpowers/specs/
```

**Flujo de datos principal:** agente hace `hello` con su key → Cardinal valida hash, upsert en `agents`, marca `connected=1`, registra evento → broadcast `agent_update` a dashboards suscriptos → UI actualiza en tiempo real. `pong` actualiza `last_seen`/`status`. `bye` o timeout (2 pings sin respuesta) → `connected=0` + broadcast.

## 4. Protocolo WS (`/ws`)

Un solo endpoint. El **primer mensaje determina el rol**:

```
# Rol agente
agente   → { "type": "hello", "key": "sk-cardinal-...", "device": "pc", "status": "idle" }
cardinal → { "type": "welcome", "agent": "shinon", "kind": "agent" }
cardinal → { "type": "error", "reason": "auth_failed" }  + close 4401   (key inválida/revocada)
cardinal → { "type": "ping" }                            (cada 30s)
agente   → { "type": "pong", "status": "busy" }          (responde ping; también puede ser espontáneo)
agente   → { "type": "bye" }                             (offline inmediato)

# Rol dashboard (humano)
# (el upgrade HTTP ya va autenticado por la cookie httpOnly del login)
dashboard → { "type": "subscribe" }
cardinal  → { "type": "roster", "agents": [ ... ] }      (snapshot inicial)
cardinal  → { "type": "agent_update", "agent": { ... } } (ante cada cambio)
cardinal  → { "type": "error", "reason": "auth_failed" } + close 4401
```

Reglas:
- **Doble auth según rol**: el dashboard se autentica en el *upgrade* HTTP del WS (cookie httpOnly, el JS nunca lee el JWT); el agente se autentica con su key en el primer mensaje.
- La **key es la identidad**: el nombre del agente se deriva de la key, el `hello` no puede declarar otro nombre.
- **Clasificación**: `kind = kind_override(de la key) ?? (device == "localhost" ? "subagent" : "agent")`. Se recalcula en cada `hello` (el device puede cambiar).
- Offline si pasan 2 pings (60s) sin `pong`.
- No existe `task` ni ningún mensaje del Cardinal que inicie trabajo en el agente (pasivo).
- Close codes: 4401 auth, 4400 mensaje inválido.

## 5. Datos (bun:sqlite)

```sql
CREATE TABLE agents (
  name       TEXT PRIMARY KEY,
  device     TEXT NOT NULL DEFAULT 'unknown',
  kind       TEXT NOT NULL DEFAULT 'agent' CHECK (kind IN ('agent','subagent')),
  status     TEXT NOT NULL DEFAULT 'idle',
  connected  INTEGER NOT NULL DEFAULT 0,
  last_seen  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE agent_keys (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  key_hash      TEXT NOT NULL UNIQUE,           -- SHA-256 hex de la key
  agent_name    TEXT NOT NULL REFERENCES agents(name),
  kind_override TEXT CHECK (kind_override IN ('agent','subagent') OR kind_override IS NULL),
  created_by    TEXT NOT NULL DEFAULT 'human',  -- 'human' | 'system' (system = futuro router, auto-revocable)
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at  TEXT,
  revoked_at    TEXT
);

CREATE TABLE agent_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('connect','disconnect','status')),
  meta       TEXT,
  at         TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- `keygen` **pre-registra** el agente (fila en `agents`) → el roster puede mostrar agentes conocidos que nunca conectaron (offline, atenuados).
- Keys `created_by='human'` **jamás** se eliminan automáticamente (regla del usuario).
- Migraciones: `PRAGMA user_version`, migraciones SQL secuenciales en `db/migrations/`.

## 6. API REST

| Endpoint | Auth | Descripción |
|----------|------|-------------|
| `POST /api/auth/login` | no | `{user, password}` → cookie httpOnly `SameSite=Strict` con JWT (12h) |
| `POST /api/auth/logout` | sí | limpia cookie |
| `GET /api/auth/me` | sí | `{user}` actual |
| `GET /api/health` | no | `{status:"ok", version:"0.0.1"}` — version leída del root `package.json` |
| `GET /api/agents` | sí | roster completo (agents + subagents, la UI filtra) |
| `GET /api/agents/:name` | sí | detalle + últimos N eventos |
| `GET /ws` | cookie JWT (dashboard) / key en `hello` (agente) | upgrade WS (ver §4) |
| resto | — | estáticos del build de Vite, fallback a `index.html` |

Errores: login fallido → 401 genérico (no revelar si el usuario existe); JWT ausente/inválido → 401; la UI redirige a `/login`.

CLI de keys (corre con Bun en el servidor):
```
bun run --cwd backend keygen -- --agent shinon [--device pc] [--kind agent|subagent]   # crea e imprime la key UNA vez
bun run --cwd backend keygen -- --revoke shinon
bun run --cwd backend keygen -- --list
```

## 7. Frontend (tema SAO)

- **Login**: pantalla estilo SAO; POST login → cookie; redirect a `/`.
- **Home / Agent Hub**: grilla de `AgentCard` — **solo `kind='agent'`** (dispositivos externos). Online con glow del color del agente, offline atenuados. Sección colapsable "Subagents" para `kind='subagent'`. Todo en tiempo real vía WS.
- **AgentDetail** (`/agents/:name`): info, estado, `last_seen`, últimos eventos. Sin botón de tarea (no existe en Fase 0).
- **Settings**: info de cuenta (usuario, versión) + nota de que el cambio de password es por env. Sin edición.
- **Versión**: visible en el footer del sidebar (fetch a `/api/health`).
- Estado: React context + hooks (`useAuth`, `useRoster`). Sin librería de estado.
- Estética según `context/ecosystem.md`: fondo `#0a0e27`/`#08070c`, acento `#00d4ff`, secundario `#8b5cf6`, JetBrains Mono + Inter, paneles con bordes luminosos, avatares circulares con glow.

## 8. Ejemplo de cliente (`examples/ws-agent.ts`)

Cliente WS **genérico y mínimo** (WebSocket nativo de Bun, cero deps): lee `CARDINAL_URL` y `CARDINAL_AGENT_KEY` de env, envía `hello`, responde `ping` con `pong`, `bye` en SIGINT/SIGTERM, reconnect con backoff exponencial. Sirve para desarrollo y como referencia del protocolo para cualquier agente real. **No es un SDK ni un producto del Cardinal.**

## 9. Deploy

- `deploy/Containerfile` multi-stage: stage 1 instala deps + build de Vite; stage 2 copia backend + `frontend/dist` + root `package.json` (para la versión) sobre `oven/bun`. `CMD bun backend/src/index.ts`. Un solo contenedor.
- `deploy/quadlet/cardinal.container` + `cardinal-data.volume` (monta `/data` → `DB_PATH=/data/cardinal.db`).
- `deploy/Caddyfile.example`: reverse proxy genérico (sin dominio definido por ahora).
- Env: `ADMIN_USER`, `ADMIN_PASSWORD_HASH`, `JWT_SECRET`, `PORT` (default 8787), `DB_PATH`.

## 10. Testing (`bun test`)

- **Unit**: JWT sign/verify/expiración; generación de keys (formato, hash, validación, revocación); repos DB (upsert agent, eventos); handlers del protocolo (funciones puras con zod); lógica de clasificación agent/subagent (incl. `kind_override`).
- **Integración**: servidor en puerto efímero + DB temporal → flujo completo agente fake (hello → welcome → pong → bye) verificando roster por REST y `agent_update` por WS de dashboard; flujo de login → cookie → endpoint protegido; fallback SPA.
- Frontend: typecheck + build de Vite como verificación (sin suite de componentes en Fase 0).

## 11. Fuera de scope (Fase 0)

Despacho de tareas a agentes; endpoint OpenAI-compatible `/v1/*` y routing de modelos; lifecycle dinámico de keys localhost; orquestación de contenedores one-shot; RAG/memoria/historial de sesiones; grafo de conocimiento; automatizaciones; multi-usuario; cambio de password desde UI; rate limiting.

## 12. Fases siguientes (actualizado con el Extra)

- **Fase 1 — Memoria + RAG**: vault context service, vector store, session history.
- **Fase 2 — Router + Key Factory + One-shot agents**:
  - Endpoint **OpenAI-compatible** (`/v1/chat/completions`) autenticado con las mismas `sk-cardinal-*` (la key ya es la identidad desde Fase 0).
  - Routing de modelo según tipo de tarea; budgets y failsafes por key; dashboard de consumo.
  - **Orquestación de contenedores** (Podman/Docker API compatible) con recursos mínimos para ejecutar **agentes one-shot** con modelo específico según la tarea.
  - **Keys dinámicas para localhost**: el sistema crea y revoca keys `created_by='system'` para los one-shot; las `created_by='human'` nunca se tocan salvo acción explícita del humano.
- **Fase 3 — Grafo de conocimiento**.
- **Fase 4+ — Automatizaciones** (cron, webhooks, triggers).

## 13. Versionado

`vMAJOR.FASE.UPDATE`:
- **MAJOR**: `0` hasta superar todas las fases de testing y declararse producto estable → `1`.
- **FASE**: fase actual del roadmap (0, 1, 2, ...).
- **UPDATE**: se incrementa con **cada** update del proyecto dentro de la fase.
- Source of truth: `version` en root `package.json`. El backend la lee de ahí (import JSON de Bun) y la expone en `/api/health`; el dashboard la muestra. Versión inicial: **v0.0.1**.

# API reference

Live routes from `backend/src/server.ts`. Auth: **JWT** = dashboard cookie `cardinal_session`. **Key** = `Authorization: Bearer sk-cardinal-*` (or body `{key}` on validate). **Either** = JWT or agent key.

Health is `/api/health`, not `/health`.

## Public / auth

| Method | Path | Auth | Returns |
|--------|------|------|---------|
| `GET` | `/api/health` | none | `{status, version}` |
| `POST` | `/api/auth/login` | body | sets `cardinal_session` |
| `POST` | `/api/auth/logout` | — | clears cookie |
| `GET` | `/api/auth/me` | JWT | current user |
| `POST` | `/api/internal/keys/validate` | Bearer or `{key}` | `{agent, kind, scopes}` or 401 |

## Dashboard (JWT)

| Method | Path | Returns |
|--------|------|---------|
| `GET` | `/api/system` | flat `{version, uptime_seconds, db_path, db_size_bytes, agents_total, agents_online, keys_active, keys_revoked}` |
| `GET` | `/api/agents` | `{agents}` |
| `GET` | `/api/agents/:name` | `{agent, events}` |
| `GET` | `/api/devices` | `{devices}` |
| `POST` | `/api/devices/heartbeat` | body `{agent}` |
| `GET`/`PUT` | `/api/profiles`, `/api/profiles/:name` | profile registry |
| `GET` | `/api/souls/:name` | soul (GET only) |
| `GET` | `/api/skills`, `/api/skills/:name` | skill catalog |
| `GET` | `/api/profiles/:name/skills` | profile skills |
| `GET`/`PUT` | `/api/memories/:profile/{memory\|user}` | memory mirror |
| `GET` | `/api/sessions` | sessions, newest first |
| `GET`/`PUT` | `/api/config/:profile` | config template |
| `GET`/`POST` | `/api/keys` | list / create |
| `POST` | `/api/keys/:id/revoke` | revoke |
| `GET`/`POST`/`PATCH`/`DELETE` | `/api/router/providers` | encrypted provider keys |
| `POST` | `/api/router/providers/:id/sync-models` | sync model list |
| `GET`/`PUT` | `/api/router/routes`, `/api/router/routes/:alias` | alias chains |

## Board / mailbox (JWT or agent key)

On these routes the agent key **is** identity (`agent_name`).

| Method | Path |
|--------|------|
| `GET`/`POST` | `/api/tasks` |
| `GET` | `/api/tasks/:id` |
| `PUT` | `/api/tasks/:id/claim` |
| `PUT` | `/api/tasks/:id/complete` |
| `GET`/`POST` | `/api/messages` |
| `PUT` | `/api/messages/:id/read` |
| `POST` | `/api/rag/search` |

`POST /api/rag/search` enforces agent vault scopes server-side.

## Router (agent key)

| Method | Path | Auth today |
|--------|------|------------|
| `POST` | `/v1/chat/completions` | Bearer `sk-cardinal-*` |
| `GET` | `/v1/models` | None. The handler lists active providers, models, and aliases. Requiring auth is [#41](https://github.com/snattydev/cardinal-system/issues/41). |

`GET /api/router/catalog` (dashboard session) is separate from `GET /v1/models`. Catalog documentation is also [#41](https://github.com/snattydev/cardinal-system/issues/41). Fusion: `model=fusion` (token metering; USD on fusion hops is [#40](https://github.com/snattydev/cardinal-system/issues/40)). Manual: `docs/guides/router-usage.md`.

## WebSocket

`GET /ws` upgrades. Agent: `hello` with key. Dashboard: cookie on the upgrade (JS never reads the JWT). Protocol: `context/ecosystem.md`. Client: `examples/ws-agent.ts`.

## JWT from the container (no browser)

`jose` is a **backend** dependency. Eval from `/app/backend`, not `/app`.

```bash
podman exec cardinal-backend sh -c 'cd /app/backend && bun -e "
import { SignJWT } from \"jose\";
const secret = new TextEncoder().encode(process.env.JWT_SECRET);
const token = await new SignJWT({ sub: \"admin\" })
  .setProtectedHeader({ alg: \"HS256\" })
  .setIssuedAt()
  .setExpirationTime(\"1h\")
  .sign(secret);
const r = await fetch(\"http://localhost:8787/api/system\", {
  headers: { Cookie: \"cardinal_session=\" + token }
});
console.log(r.status, await r.json());
"'
```

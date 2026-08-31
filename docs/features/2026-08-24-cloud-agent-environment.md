# Cloud Agent development environment

**Fecha:** 2026-08-24
**Tipo:** chore (infra de desarrollo)
**Archivos:** `.cursor/environment.json`, `.cursor/install.sh`, `.cursor/start.sh`

## Qué se hizo

Se agregó la configuración de entorno para **Cursor Cloud Agents**, de modo que un agente
pueda levantar el stack completo del Cardinal (backend Bun + WebSocket y frontend Vite) sin
pasos manuales.

- `.cursor/install.sh` — fase `install` (idempotente):
  - Instala el toolchain **Bun** (la imagen base trae solo Node) y lo enlaza en
    `/usr/local/bin` para que esté en el `PATH` de todas las fases y del shell interactivo.
  - Corre `bun install --frozen-lockfile` desde la raíz (el lockfile raíz cubre
    `packages/*`, `backend` y `frontend`).
- `.cursor/start.sh` — fase `start` (por cada boot, idempotente):
  - Genera un `.env` de desarrollo **descartable** (`admin` / `cardinal-dev`) solo si no
    existe, con `ADMIN_PASSWORD_HASH` (argon2), `JWT_SECRET` y `POOL_SECRET` aleatorios.
  - Si `.env` ya existe pero no tiene `POOL_SECRET` (requerido por el key factory en
    `packages/core`), lo agrega sin tocar el resto del archivo.
- `.cursor/environment.json`:
  - `terminals`: `backend` (`bash .cursor/start.sh && bun run dev:backend`, :8787) y
    `frontend` (`VITE_HOST=0.0.0.0 bun run dev:frontend`, :5173). El backend corre
    `start.sh` primero para no perder la carrera del primer boot contra `.env`.
  - `ports`: 8787 y 5173.

## Por qué

- El repo corre íntegramente sobre Bun, que no viene en la imagen base de Cloud Agents.
- El backend exige `ADMIN_USER`, `ADMIN_PASSWORD_HASH`, `JWT_SECRET` y `POOL_SECRET`
  (`packages/core/src/config.ts`). En un entorno de dev efímero conviene generarlos al
  vuelo en vez de pedir secretos al usuario. `POOL_SECRET` cifra las API keys de
  providers en DB (AES-256-GCM); el valor se hashea a 32 bytes, así que un hex de 32
  chars alcanza.

## Decisiones

- **Bun por script `install` (no Dockerfile):** se mantiene la imagen default de Cursor
  (Node, git, curl) y se instala Bun en `install`, cuyo output queda en el snapshot del build.
- **`.env` generado en `start`, no en `install`:** garantiza que exista en cada boot y nunca
  pisa un `.env` provisto por el usuario. Nunca se commitea (`.gitignore` ya excluye `.env`).
- **Escapado de `$` en el hash argon2:** el loader de `.env` de Bun expande variables `$...`;
  el hash argon2 contiene `$`, por lo que `start.sh` los escapa (`\$`) para guardarlo verbatim.
- **`VITE_HOST=0.0.0.0`:** Vite por default escucha solo en localhost IPv6; con `0.0.0.0`
  queda accesible vía `127.0.0.1` y desde el host de la VM.

## Alternativas consideradas

- **Dockerfile con `oven/bun`:** descartado para no perder el toolchain Node de la imagen
  base ni mantener una imagen custom; el script `install` es suficiente y más simple.
- **Pedir secretos al usuario (`add_secrets`):** innecesario para credenciales de dev
  descartables; se generan localmente.

## Validación

- `bun install --frozen-lockfile` (idempotente, corrido dos veces).
- `bun test` → 218 pass / 0 fail.
- `bun run build` (frontend) OK.
- Flujo end-to-end: login (`/api/auth/login`), `keygen`, agente WS de ejemplo conectado,
  `/api/agents` mostrando el agente `connected: true`, y dashboard web (login + Agent Hub
  mostrando el subagente online por WebSocket en vivo usando el host `127.0.0.1`).

## Nota (bug preexistente, fuera de alcance)

`bun run typecheck` falla con un error preexistente en `backend/src/server.ts`:
`maxPayloadLength` está pasado como opción top-level de `Bun.serve()` pero pertenece al
handler `websocket:`. No se tocó código de aplicación como parte del setup de entorno.

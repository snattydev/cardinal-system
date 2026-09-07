# Cloud Agent development environment

**Date:** 2026-08-24
**Type:** chore (development infrastructure)
**Files:** `.cursor/environment.json`, `.cursor/install.sh`, `.cursor/start.sh`

## What was done

Added environment configuration for **Cursor Cloud Agents**, enabling an agent
to bring up the full Cardinal stack (Bun backend + WebSocket and Vite frontend)
without manual setup steps.

- `.cursor/install.sh` — `install` phase (idempotent):
  - Installs the **Bun** toolchain (base image only contains Node) and symlinks it to
    `/usr/local/bin` so it is on `PATH` for all phases and interactive shells.
  - Runs `bun install --frozen-lockfile` from repo root (the root lockfile covers
    `packages/*`, `backend`, and `frontend`).
- `.cursor/start.sh` — `start` phase (per boot, idempotent):
  - Generates a **disposable** development `.env` (`admin` / `cardinal-dev`) only if it
    does not exist, with randomized `ADMIN_PASSWORD_HASH` (argon2), `JWT_SECRET`, and `POOL_SECRET`.
  - If `.env` exists but lacks `POOL_SECRET` (required by the key factory in
    `packages/core`), appends it without mutating the rest of the file.
- `.cursor/environment.json`:
  - `terminals`: `backend` (`bash .cursor/start.sh && bun run dev:backend`, :8787) and
    `frontend` (`VITE_HOST=0.0.0.0 bun run dev:frontend`, :5173). The backend runs
    `start.sh` first to prevent race conditions on initial boot against `.env`.
  - `ports`: 8787 and 5173.

## Why

- The repo runs entirely on Bun, which is not preinstalled in the Cloud Agents base image.
- The backend requires `ADMIN_USER`, `ADMIN_PASSWORD_HASH`, `JWT_SECRET`, and `POOL_SECRET`
  (`packages/core/src/config.ts`). In ephemeral dev environments, generating them on
  the fly is preferable to prompting the user for secrets. `POOL_SECRET` encrypts upstream
  provider API keys in DB (AES-256-GCM); the value is hashed to 32 bytes, so a 32-char
  hex string is sufficient.

## Decisions

- **Bun via `install` script (not Dockerfile):** retains Cursor default image
  (Node, git, curl) and installs Bun in `install`, caching output in the build snapshot.
- **`.env` generated in `start`, not in `install`:** guarantees availability across boots and
  never overwrites user-provided `.env`. Never committed (`.gitignore` excludes `.env`).
- **`$` escaping in argon2 hash:** Bun's `.env` loader expands `$...` variables; the argon2
  hash contains `$`, so `start.sh` escapes them (`\$`) to persist verbatim.
- **`VITE_HOST=0.0.0.0`:** Vite defaults to localhost IPv6; `0.0.0.0` makes it accessible
  via `127.0.0.1` and from the VM host.

## Alternatives Considered

- **Dockerfile with `oven/bun`:** rejected to preserve base image Node toolchain
  and avoid custom image maintenance; the `install` script is simpler and sufficient.
- **Prompt user for secrets (`add_secrets`):** unnecessary for disposable dev
  credentials; generated locally.

## Validation

- `bun install --frozen-lockfile` (idempotent, executed twice).
- `bun test` -> 218 pass / 0 fail.
- `bun run build` (frontend) OK.
- End-to-end flow: login (`/api/auth/login`), `keygen`, sample WS agent connected,
  `/api/agents` showing agent `connected: true`, and web dashboard (login + Agent Hub
  showing live WebSocket subagent online using host `127.0.0.1`).

## Note (pre-existing bug, out of scope)

`bun run typecheck` fails with a pre-existing error in `backend/src/server.ts`:
`maxPayloadLength` is passed as a top-level option to `Bun.serve()` but belongs to the
`websocket:` handler. Application code was not touched as part of the environment setup.

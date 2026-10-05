# Operational pitfalls

Facts that have already burned a session. Not a second README.

## Keys

- Keygen is the **root** `package.json` script (`bun backend/src/keys/cli.ts`). Inside the container: `cd /app && bun run keygen -- --agent <name> --kind agent --device pc`. `bun run /app/backend/src/keys/cli.ts` fails (`Script not found`).
- `bun run keygen` on the host talks to the **host** DB, not the container volume. Use `podman exec cardinal-backend ...`.
- Each keygen call inserts a new active key. There is no name dedup. Revoke then recreate when debugging.
- Format: `sk-cardinal-` + 64 hex chars (77 total). Printed once.

## Runtime

- Health is `GET /api/health`, not `/health`.
- `podman-compose up` with `--infra=false` can publish ports silently wrong. `podman-compose down && podman-compose up -d`.
- Adding a var to `.env` does not inject it into a running container. Recreate: `podman-compose up -d --force-recreate backend`.
- New workspace + bind-mounted `bun.lock` → `EBUSY: Failed to replace old lockfile`. Stop backend, `bun install` with the repo mounted as a directory, then start again.
- `jose` is not installed at `/app`. JWT evals must `cd /app/backend`.

## Frontend

- Vite's WS proxy calls `socket.destroySoon()`, missing on Bun `node:http`. Dashboard WS: `ws://127.0.0.1:8787/ws` in `frontend/src/lib/ws.ts`. Not `location.host`.
- `localhost` and `127.0.0.1` are different cookie origins. Always `http://127.0.0.1:5173`.
- Playwright defaults to `http://127.0.0.1:5173` (`frontend/playwright.config.ts`). Prod pod on Caddy `:8080` needs `PLAYWRIGHT_BASE_URL=http://127.0.0.1:8080`. E2E login uses `E2E_ADMIN_USER` / `E2E_ADMIN_PASSWORD` or dev defaults `admin` / `cardinal-dev`.
- `SystemInfo` and every other payload type must match the backend JSON 1:1 (flat fields). Nested mocks pass tests and black-screen in the browser.
- Shared uptime: one module-level timer (`frontend/src/lib/system.ts`). Per-component `Date.now()` drifts.

## DB / board

- Atomic claim: `db.query("UPDATE ... WHERE id = ? AND status = 'open'").run(...)` and check `changes === 0`. Do not SELECT-then-UPDATE.

## Vault RAG proxy

Cardinal in the container does not run the vault indexer. Host proxy on `:8788`; container reaches it at `http://host.containers.internal:8788`. Bind `0.0.0.0`, not `127.0.0.1`. Auth header `X-Vault-Token`. Use single-thread `HTTPServer` — SQLite connections are thread-bound.

## Router upstreams

`opencode serve` is not OpenAI-compatible (`/v1/chat/completions` serves the SPA). An OpenAI-compat proxy is required if OpenCode is an upstream.

## Status docs

`docs/roadmap.md`, `docs/roadmap/fase-N.md`, and the current-state table in `AGENTS.md` go stale. Check `package.json`, `docs/features/`, and `git log` before planning.

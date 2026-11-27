# Cardinal System — Security Model

> Security rules every agent must know before touching code.

---

## Principles

- **Nothing exposed without auth.** Every endpoint under `/api/` (except `GET /api/health`) and `/v1/` (`/v1/chat/completions`, `/v1/models`) requires JWT or API key.
- **Keys are identity.** `sk-cardinal-*` = the agent. Only SHA-256 hash in DB.
- **Human-in-the-loop.** The human closes every loop (merge, confirmation, gates).
- **Ephemeral by default.** State in git/DB, never in the process.
- **Fail-closed.** If something fails, deny. Never allow by default.

## Authentication

| Actor | Method | Storage | Lifetime |
|-------|--------|---------|----------|
| Human (dashboard) | JWT (HS256) via `POST /api/auth/login` (failure-rate-limited per client IP) | `httpOnly` cookie, `SameSite=Strict` | 12h |
| Agent (WS) | API key `sk-cardinal-*` in `hello` message | DB: `key_hash` (SHA-256) | Revocable |
| Agent (REST) | API key `sk-cardinal-*` via `Authorization: ***` | Same as WS | Revocable |
| Subagent (localhost) | API key `created_by=system`, auto-revocable; passed to worker container via env (not CLI args) | DB: `key_hash` | Ephemeral |
| Internal MCP -> backend | `/api/internal/keys/validate`, `/api/internal/mcp/usage` (`403` at `deploy/nginx.conf`, optional `INTERNAL_SERVICE_SECRET` via `x-cardinal-internal-secret`) | Env var | Service lifetime |

## API keys

- **Format:** `sk-cardinal-<64 chars hex>` (77 chars total)
- **Generation:** `crypto.getRandomValues(new Uint8Array(32))` → hex
- **Hash:** SHA-256 (only the hash is persisted in DB)
- **Revocation:** `revoked_at` timestamp. Revoked keys reject with 4401.
- **Human keys (`created_by='human'`):** Never touched automatically. Only explicit human action.
- **System keys (`created_by='system'`):** Created and revoked automatically for one-shot agents.

## Permissions

| Level | Scope |
|-------|-------|
| Admin (human) | Everything: dashboard, keygen, config. RAG unfiltered. Tasks/mailbox with body identity. |
| Agent key | WS connection + router usage + MCP Context Hub. On `/api/tasks*` and `/api/messages*` the key **is** identity (`agent_name`) and requires `board:*` / `mailbox:*` (or `*`). Vault access enforces path-glob ACLs server-side. |
| Subagent key | Single task execution only (ephemeral, scoped) |

### Vault & MCP Path-Glob ACLs (`packages/mcp`)

- **Allowed read scopes:** `*`, `vault:read:<glob>`, or legacy `vault:<name>` (`<name>/**`).
- **Allowed write scopes:** explicit `vault:write:<glob>` only. **`*` and legacy `vault:<name>` never grant write access.**
- **Hard-denied prefixes (`CARDINAL_DENY_PREFIXES`, default `personal`):**
  - `personal/**` is unconditionally denied on reads—even for `*` keys—unless the key explicitly carries **both** `vault:allow-personal` and a matching `vault:read:` scope.
  - `personal/**` is **always write-denied** regardless of scopes.
- **Physical R/W separation & traversal safety:** Source vaults mount `:ro` (`/data/vaults`); agent handoffs and skill proposals write only to isolated `:rw` `CARDINAL_WRITABLE_ROOT` (`/data/agent-state`). Paths block traversal, URL-encoded `%2e`/`%2f`/`%5c`, backslashes, null bytes, dotfiles (`.git`, `.env`, `.obsidian`), non-`.md` files, and symlink escapes via `realpath`.
- **Read-only config snapshots & redaction (`CARDINAL_CONFIGS_ROOT`):**
  - `scripts/sync-configs.sh` copies only explicitly allowlisted harness (`agents/**`) and terminal/shell (`user/**`) configs into a `:ro` mount (`/data/configs`), stripping credentials on copy while never touching `auth*`, `*token*`, `*secret*`, `.env*`, SSH keys, sqlite DBs, or shell histories.
  - `cardinal_agent_config` requires `*` or `config:read:agents/**`.
  - `cardinal_user_config` (`user/**`) is **strictly opt-in** via explicit `config:read:user/**` (never granted by `*`, `config:read:*`, or `config:read:**`).
  - Both MCP config tools enforce filename blocklists, config extension allowlists, non-binary checks, `realpath` confinement, byte limits, and defense-in-depth runtime secret redaction (`packages/mcp/src/redact.ts`).
- **Stateless per-request identity:** `POST /mcp` builds a fresh `McpServer` bound to the validated caller identity per request, preventing cross-tenant tool/scope leakage.
- **Legacy RAG route (`/api/rag/search`):** Normalizes vault-relative paths, blocks traversal segments, enforces `CARDINAL_DENY_PREFIXES` (denies `personal/**` even for `*` unless `vault:allow-personal` plus an explicit scope matches), and uses segment/prefix matching instead of substring checks.

## Sensitive data

| What | Where it does NOT go | Where it DOES go |
|------|----------------------|------------------|
| `.env` (JWT_SECRET, credentials) | Git, logs, diffs | Server only |
| Admin password in plaintext | Agent chat, logs, git, tickets | Local human TTY only (stdin, no echo) |
| API keys in plaintext | Git, logs, DB | Printed only ONCE when created |
| Tokens, secrets, absolute paths | Commits, PR descriptions | — |
| `.env.example` | — | Template without real values |

## Admin password bootstrap (required pre-cloud)

Decision 2026-08-20: in **local dev/testing** any password works (even one generated in an agent session). That **is not** the production flow.

Before the first cloud deploy — even if the only user is the owner — the creation or rotation of `ADMIN_PASSWORD_HASH` **cannot go through the model**. The plaintext password enters the agent context, ends up in transcripts, and can leak. A single user does not override the requirement.

**Canonical flow (`scripts/bootstrap-admin-password.sh` or `bun run bootstrap:password`):**

1. Interactive script in human TTY (`read -s`): prompts for password silently, never echoed or logged.
2. Hashes with `Bun.password.hash` (Argon2id) on that same machine via stdin pipe (never in CLI args).
3. Writes **only the hash** to `.env` or `~/.config/cardinal/env` (`--cloud`).
4. The agent can verify that the bootstrap ran (exit 0). Never sees or generates the plaintext.

Implemented in `scripts/bootstrap-admin-password.sh` (item 11 of the v2 backlog plan).
## Pre-push audit

Before every push to `dev`:

- [ ] `grep -r "sk-cardinal-" --include="*.ts" --include="*.json"` → zero results
- [ ] `grep -r "JWT_SECRET" --include="*.ts"` → only `process.env.JWT_SECRET`
- [ ] No absolute home paths in code
- [ ] No emails or tokens in comments or strings

## WS security

- **Origin check:** When an `Origin` header is present on `/ws`, its host must match the request `Host` (`X-Forwarded-Host` fallback); mismatched origins fail with `403`.
- **Handshake deadline & caps:** Unauthenticated sockets must send `hello` or `subscribe` within 10s (`4401 auth_timeout`), with bounded unauthenticated (`100`) and dashboard (`50`) connection caps (`4429 too_many_connections`).
- **Close codes:** 4401 (auth failed / timeout), 4400 (invalid message), 4429 (too many connections)
- **Timeout:** 2 lost pings (60s) → disconnect
- **Rate limit:** Login brute-force protection via `LoginRateLimiter` on `POST /api/auth/login` (`429` + `Retry-After`). WS message rate limit remains pending.

## Container and helper script hardening

- **Backend container (`deploy/Containerfile`):** Runs as non-root `USER bun` with `/data` owned by `bun:bun`.
- **Worker containers (`backend/src/orchestrator/podman-driver.ts`):** Ephemeral `CARDINAL_KEY` is inherited from process environment (`-e CARDINAL_KEY`) rather than exposed in container CLI argv.
- **Helper proxies (`scripts/omp-gateway.sh`, `scripts/vault-query-proxy.py`):** Bind `127.0.0.1` by default and fail closed when unauthenticated on non-loopback interfaces; `vault-query-proxy.py` compares `X-Vault-Token` with `hmac.compare_digest`.

---

*Updated: 2026-11-27.*

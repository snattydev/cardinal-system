# Cardinal System — Security Model

> Security rules every agent must know before touching code.

---

## Principles

- **Nothing exposed without auth.** Every endpoint under `/api/` requires JWT or API key.
- **Keys are identity.** `sk-cardinal-*` = the agent. Only SHA-256 hash in DB.
- **Human-in-the-loop.** The human closes every loop (merge, confirmation, gates).
- **Ephemeral by default.** State in git/DB, never in the process.
- **Fail-closed.** If something fails, deny. Never allow by default.

## Authentication

| Actor | Method | Storage | Lifetime |
|-------|--------|---------|----------|
| Human (dashboard) | JWT (HS256) via `POST /api/auth/login` | `httpOnly` cookie, `SameSite=Strict` | 12h |
| Agent (WS) | API key `sk-cardinal-*` in `hello` message | DB: `key_hash` (SHA-256) | Revocable |
| Agent (REST) | API key `sk-cardinal-*` via `Authorization: ***` | Same as WS | Revocable |
| Subagent (localhost) | API key `created_by=system`, auto-revocable | DB: `key_hash` | Ephemeral |

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
| Agent key | WS connection + router usage. RAG filtered by key JSON scopes (`*` or `vault:<name>`). On `/api/tasks` and `/api/messages` the key **is** identity (`agent_name`). |
| Subagent key | Single task execution only (ephemeral, scoped) |

Vault scopes in `POST /api/rag/search` are enforced server-side for agent keys. Finer scopes (read/write per service, e.g. `board`) are still pending.

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

**Required flow (not yet implemented — cloud deploy blocker):**

1. Interactive script in human TTY (`read -s` or equivalent): asks for the password, does not print it, does not log it.
2. Hashes with `Bun.password.hash` **on that same machine**.
3. Writes **only the hash** to `~/.config/cardinal/env` or a Podman secret.
4. The agent can know that the bootstrap ran (ok/fail). Never sees or generates the plaintext. Does not ask for it "pass it in chat" either.

Until that script exists, the cloud deploy is not considered ready. Tracking detail: item 11 of the [v2 backlog plan](superpowers/plans/2026-08-17-cardinal-v2-backlog.md).

## Pre-push audit

Before every push to `dev`:

- [ ] `grep -r "sk-cardinal-" --include="*.ts" --include="*.json"` → zero results
- [ ] `grep -r "JWT_SECRET" --include="*.ts"` → only `process.env.JWT_SECRET`
- [ ] No absolute home paths in code
- [ ] No emails or tokens in comments or strings

## WS security

- **Close codes:** 4401 (auth failed), 4400 (invalid message)
- **Timeout:** 2 lost pings (60s) → disconnect
- **Rate limit:** Not implemented in F0. Pending F2.

---

*Updated: 2026-09-06.*

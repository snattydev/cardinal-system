# Cardinal LLM Router — User Guide

Cardinal's internal LLM router: configurable provider pool + OpenAI-compatible
endpoints with transparent failover, per-key scopes, and metering.

> Spec: `docs/superpowers/specs/2026-08-12-cardinal-v2-architecture.md` (section 6).
> Guide snapshot: v0.2.5 (2026-09-03). The router shipped in the v0.2.6 freeze on `main` (PR #12, 2026-09-18). Current phase status: [`docs/roadmap.md`](../roadmap.md).
> Index: [`docs/features/2026-09-03-router-surface.md`](../features/2026-09-03-router-surface.md).

---

## 1. Concepts in 30 Seconds

- **Provider**: an LLM upstream (direct DeepSeek, OpenRouter, a local mock,
  etc.). Defined as a row in the DB — no code changes required to add one.
- **Model**: a physical model served by a provider (`deepseek-v4-flash-free`, ...).
- **Alias**: logical name with a fallback chain (`fast` → [provider A → provider B]).
- **Derived key**: `sk-cardinal-*` that identifies a client (agent, app). Defines
  which models it can request (scopes) and how much it can consume (budget).
- **Autorouter**: request a model by its real name and the router builds the pool of
  providers that serve it; if one fails (429/5xx/timeout), it moves to the next
  without the client noticing. Failover is transparent.
- **Fusion / MoA**: alias whose `fallback_chain` is a JSON object
  (`"mode":"fusion"`), not an array. Parallel fan-out + judge; not failover.
  See [`docs/features/2026-09-03-router-fusion.md`](../features/2026-09-03-router-fusion.md).

```
Client (any OpenAI-compatible SDK)
        │  Bearer sk-cardinal-...
        ▼
POST http://127.0.0.1:8787/v1/chat/completions
        │  model: "fast" (alias)  or  "deepseek-v4-flash" (autorouter)
        ▼
   Cardinal Router
        │  auth (scope + budget) → resolve chain → failover → metering
        ▼
   Provider 1 ──► Provider 2 ──► Provider 3 (if previous fails)
```

---

## 2. Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /v1/chat/completions` | Bearer `sk-cardinal-*` | OpenAI-compatible completion (streaming, non-streaming, Fusion) |
| `GET /v1/models` | — | List of available models and aliases (OpenAI format) |
| `GET /api/router/providers` | JWT cookie | Dashboard: providers + models (without `api_key_enc`) |
| `POST /api/router/providers` | JWT cookie | Provider registration/rotation: `name`, `base_url`, `api_key`, `models[]`. The key is encrypted (AES-256-GCM) and **never** returned in the response |
| `GET /api/router/routes` | JWT cookie | Dashboard: aliases and `fallback_chain` (arrays; Fusion appears empty) |
| `PATCH /api/router/providers/:id` | JWT cookie | `active` \| `disabled` |
| `PUT /api/router/routes/:alias` | JWT cookie | Upsert hop chain (arrays only) |
| `POST /api/keys` | JWT cookie | Create key (plaintext shown once). See `/keys` |
| `GET /api/health` | — | Backend health check |

Dashboard: `http://127.0.0.1:5173/router` and `/keys` (JWT login).
API Base URL: `http://127.0.0.1:8787/v1` (completions) and `http://127.0.0.1:8787/api` (admin).

---

## 3. Starting the Stack

```bash
cd ~/Data/Projects/ai-agents/cardinal-system
podman-compose up -d        # backend :8787 + frontend :5173
curl -s http://127.0.0.1:8787/api/health   # {"status":"ok","version":"0.2.5"}
```

Requirements in `.env` (create from `deploy/env.example` if it does not exist):

```
ADMIN_USER=
ADMIN_PASSWORD_HASH=
JWT_SECRET=            # openssl rand -hex 32
POOL_SECRET=           # openssl rand -hex 32  <- PROVIDER ENCRYPTION KEY
```

> If you add or change variables in `.env` for an already running container:
> `podman-compose up -d --force-recreate backend`

---

## 4. Provider Management

Providers live in the DB (`providers`, `provider_models`, `model_routes` tables).
The router is **agnostic**: any OpenAI-compatible upstream works.

### 4.1 Adding a Real Provider

From the dashboard: **Router → Catalog** (`/router`), ADD PROVIDER KEY form
(name, base url, api key, models, wire format, cost/mtok). `POST /api/router/providers`
encrypts the key and does not return it.

The CLI workflow remains available for e2e/scripts:

```bash
podman exec cardinal-backend sh -c 'cd /app && bun backend/src/seed-provider.ts --name deepseek-direct --base-url https://api.deepseek.com/v1 --api-key <KEY> --model deepseek-v4-flash --model deepseek-v4-pro'
```

> (If the `seed-provider.ts` script does not exist yet, the pattern is in
> `backend/src/seed-router.ts` — it is the same: `upsertProvider` + `addProviderModel`.)

Reference one-shot (2026-09-05): the **public monthly** catalog from
FreeLLMAPI (`GET https://api.freellmapi.co/v1/latest`, tier `monthly` v2026.09.04)
was imported as `disabled` rows (without keys). Keyless providers (`kilo`, `ovh`, `aihorde`) remained
`active`. This is not the paid live feed; the next personal step is a custom
catalog, not subscribing.

The `api_key` is encrypted with AES-256-GCM using `POOL_SECRET` — **it is never stored in
plaintext and never leaves Cardinal**. To list providers without exposing keys:

```bash
podman exec cardinal-backend sh -c 'cd /app && bun -e "import { createDb, listProviders } from \"@cardinal/db\"; const db = createDb(process.env.DB_PATH); console.log(listProviders(db).map(p => ({ name: p.name, status: p.status, base_url: p.base_url })))"'
```

### 4.2 Defining an Alias with Fallback

```bash
podman exec cardinal-backend sh -c 'cd /app && bun -e "
import { createDb, upsertModelRoute } from \"@cardinal/db\";
const db = createDb(process.env.DB_PATH);
upsertModelRoute(db, \"fast\", [
  { provider: \"deepseek-direct\", model: \"deepseek-v4-flash\" },
  { provider: \"mock-local\", model: \"test-model\" },
]);
console.log(\"alias fast → 2 hops\");
"'
```

Now `model: "fast"` tests deepseek-direct first and, if it fails, falls back to the mock.
The client always sees `model: "fast"` in the response (rewritten), never the
real model of the provider that responded.

### 4.3 Autorouter (without Alias)

If there are providers serving `deepseek-v4-flash` (multiple), request
`model: "deepseek-v4-flash"` directly and the router builds the pool automatically, ordered by
`providers.id`, with automatic failover between them.

### 4.4 Disabling a Provider

```bash
podman exec cardinal-backend sh -c 'cd /app && bun -e "
import { createDb, setProviderStatus } from \"@cardinal/db\";
const db = createDb(process.env.DB_PATH);
setProviderStatus(db, \"mock-local\", \"disabled\");
"'
```

`disabled` providers are filtered out of the autorouter and aliases.

### 4.5 Fusion / MoA

This is not failover: N proposers in parallel and a judge synthesizes **one** response.
The JSON in `model_routes.fallback_chain` is an **object**, not an array.
`upsertModelRoute` / `PUT /api/router/routes/:alias` do not accept it (hops only);
seed with SQL. Details:
[`docs/features/2026-09-03-router-fusion.md`](../features/2026-09-03-router-fusion.md).

```json
{
  "mode": "fusion",
  "panel": [
    { "provider": "p1", "model": "m1" },
    { "provider": "p2", "model": "m2" }
  ],
  "judge": { "provider": "judge-p", "model": "judge-m" },
  "strategy": "synthesize"
}
```

Client: `model: "fusion"` (or the alias of that row) + Bearer `sk-cardinal-*`
with scope `fusion` or `*`. `stream: true` → 400. `best_of` → 501.

In `/router`, that row displays hops as `—` (the GET only parses arrays). Follow-up.

---

## 5. Key Management (Client Identity)

From the dashboard (`/keys`, JWT cookie), create a key with scopes, token
budget, expiration, and USD cap. Plaintext is displayed **only once**. The CLI
remains available:

```bash
# Key with open autorouter (scope "*")
podman exec cardinal-backend sh -c 'cd /app && bun run keygen -- --agent <name> --kind agent'

# Key scoped to a specific alias/model + 50k token budget
podman exec cardinal-backend sh -c 'cd /app && bun run keygen -- --agent <name> --kind agent --scope fast --scope pro --budget 50000'

# List keys / revoke
podman exec cardinal-backend sh -c 'cd /app && bun run keygen -- --list'
podman exec cardinal-backend sh -c 'cd /app && bun run keygen -- --revoke <name>'
```

### Scope Semantics

| Scope | Effect |
|-------|--------|
| `["*"]` (default) | Can request any model/alias (open autorouter) |
| `["fast"]` | Only the `fast` alias |
| `["deepseek-v4-pro"]` | Only that model, from any provider serving it |

### Budget Semantics

- `budget_limit` in cumulative **tokens** (`budget_used` increments on each call).
- Optional `budget_usd_limit`: `(tokens/1e6)*cost_per_mtok` for the hop. Cost 0 does
  not increment USD. Overshoot → auto-revoke (same as tokens).
- Expired `expires_at` → key is inactive (`unauthorized`).
- If a call exceeds the remaining budget, the router revokes the key automatically
  (auto-revoke) — public agents cannot continue consuming.
- `created_by=system` → one-shot/public agents, auto-revocable.
- `created_by=human` → never touched except via explicit action.

> [warning] The key is printed **only once** upon creation. If lost, revoke and recreate it.
> [warning] The terminal renderer redacts `sk-cardinal-*` in outputs — for e2e scripts,
> generate the key inside the script without printing it (see `backend/src/e2e-router.ts`).

---

## 6. Client Usage

Any OpenAI-compatible client works (OpenAI SDK, curl, Claude Code, etc.).

### curl (non-streaming)

```bash
curl -s http://127.0.0.1:8787/v1/chat/completions \
  -H "Authorization: Bearer sk-cardinal-<KEY>" \
  -H "Content-Type: application/json" \
  -d '{"model":"fast","messages":[{"role":"user","content":"Hola"}],"max_tokens":100}'
```

### curl (streaming SSE)

```bash
curl -N http://127.0.0.1:8787/v1/chat/completions \
  -H "Authorization: Bearer sk-cardinal-<KEY>" \
  -H "Content-Type: application/json" \
  -d '{"model":"fast","messages":[{"role":"user","content":"Hola"}],"stream":true}'
```

### OpenAI SDK (Python)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:8787/v1",
    api_key="sk-cardinal-<KEY>",
)
resp = client.chat.completions.create(
    model="fast",
    messages=[{"role": "user", "content": "Hola"}],
)
print(resp.choices[0].message.content)
```

### OpenAI SDK (TypeScript/Bun)

```ts
import OpenAI from "openai";
const client = new OpenAI({ baseURL: "http://127.0.0.1:8787/v1", apiKey: "sk-cardinal-<KEY>" });
const resp = await client.chat.completions.create({ model: "fast", messages: [{ role: "user", content: "Hola" }] });
console.log(resp.choices[0].message.content);
```

### Tool Calling

The request body is passed through as-is to upstream: `tools`, `tool_choice`, `temperature`,
and `max_tokens` are forwarded. Watch out for providers that drop tools (Nogal Hive pitfall) —
verify passthrough per provider.

---

## 7. Error Codes

| HTTP | `error` | Meaning |
|------|---------|---------|
| 400 | `invalid_json` | Unparseable body |
| 401 | `unauthorized` | Missing Bearer or unknown/revoked key |
| 402 | `budget_exceeded` | Key has consumed its entire budget |
| 403 | `scope_denied` | Key is not permitted to request that model/alias |
| 404 | `model_not_found` | No provider serves that model |
| 502 | `all_providers_failed` | All hops failed; `details.attempts` contains the trail |

---

## 8. Metering and Monitoring

Usage is tracked in two places:

- `agent_keys.budget_used` — cumulative per key (for budget enforcement).
- `usage_log` — one row per successful call: `agent_name`, `key_hash`,
  `provider_name`, `model_id`, `prompt_tokens`, `completion_tokens`,
  `total_tokens`, `created_at`.

Query usage:

```bash
podman exec cardinal-backend sh -c 'cd /app && bun -e "
import { createDb, listUsage } from \"@cardinal/db\";
const db = createDb(process.env.DB_PATH);
console.log(listUsage(db, 20));
"'
```

Note: in streaming without `usage` in the payload, the router estimates tokens as
`bytes/4` (order of magnitude, not exact). Providers returning `usage` (the majority)
record the actual count.

---

## 9. E2E / Quick Test (Local Mock)

The repo includes an OpenAI-compatible upstream mock for testing without a real LLM:

```bash
# Terminal 1: mock on :18999
python3 scripts/mock-upstream.py

# Terminal 2: seed + e2e (creates mock-local provider, alias "fast", e2e key)
podman exec cardinal-backend sh -c 'cd /app && bun backend/src/seed-router.ts'
podman exec cardinal-backend sh -c 'cd /app && bun backend/src/e2e-router.ts'
```

The e2e validates: `/v1/models`, completion by alias, 401 without Bearer, SSE streaming,
metering (`budget_used` + `usage_log`), scope.

---

## 10. Troubleshooting

| Symptom | Cause / Fix |
|---------|-------------|
| Backend does not start: `POOL_SECRET is required` | Missing `POOL_SECRET` in `.env` + recreate container |
| Backend in crash loop: `EBUSY: Failed to replace old lockfile` | New workspace without updated lockfile. Fix: `podman-compose stop backend`, `podman run --rm -v <repo>:/repo -w /repo docker.io/oven/bun:1 sh -c 'bun install'`, `podman-compose up -d backend` |
| `Cannot find module '@cardinal/db' from '/app/[eval]'` | `bun -e` from `/app` does not resolve workspaces. Run from `/app/backend` or use a script in `backend/src/` |
| 502 `all_providers_failed` | All providers in the chain are down or in cooldown (60s after 429/5xx). Check `details.attempts` and `setProviderStatus` |
| 404 `model_not_found` | No active provider serves that model. Check `provider_models` and provider statuses |
| Key revoked on its own | Exceeded `budget_limit` or `budget_usd_limit` → auto-revoke by design |
| 401 with previously working key | `expires_at` has passed, or revoked |
| 400 `fusion_not_configured` | Requested `fusion` without an object route in `model_routes` |
| Frontend fails to start (dev) | Environment blocker: rolldown native binding + noexec on `~/Data` (ERR_DLOPEN_FAILED). Does not affect the router (pure backend) |

---

## 11. Providers Available Today (2026-08-20)

| Provider | Status | Notes |
|----------|--------|-------|
| `mock-local` | [active] (e2e) | OpenAI-compatible mock on host `:18999` via `host.containers.internal` |
| `opencode-zen` (`opencode/*-free`) | [active] Works as CLI | To use as upstream, requires `opencode-llm-proxy` (:4010, plugin in GLOBAL opencode config) |
| `opencode-go` (`opencode-go/*`) | [failed] Down | Subscription expired 2026-08 — do not use |
| `deepseek-direct` | [pending] | Add when the owner has an API key (seed 4.1) |

**How to connect zen free (whenever needed):**
1. Install plugin in global config: `npm install opencode-llm-proxy` + register it in `~/.config/opencode/opencode.json`
2. Run `opencode serve` with the plugin → starts `:4010` with OpenAI wire format
3. Seed the provider: `base_url: http://host.containers.internal:4010/v1`
4. Alias: `upsertModelRoute(db, "fast", [{provider: "opencode-zen", model: "deepseek-v4-flash-free"}])`

---

## References

- Spec: `docs/superpowers/specs/2026-08-12-cardinal-v2-architecture.md`
- Backlog: `docs/superpowers/plans/2026-08-17-cardinal-v2-backlog.md`
- Index v0.2.5: `docs/features/2026-09-03-router-surface.md`
- Sprint: `docs/sprints/2026-09-03-router-surface.md`
- Code: `packages/router/` (core + `fusion.ts`), `backend/src/api/router.ts` (`/v1`),
  `backend/src/api/router-dashboard.ts` (JWT), `backend/src/seed-router.ts`,
  `backend/src/e2e-router.ts`, `scripts/mock-upstream.py`

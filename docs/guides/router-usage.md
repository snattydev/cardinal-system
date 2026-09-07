# Cardinal LLM Router — Manual de Uso

Router interno de LLM del Cardinal: pool de providers configurables + endpoints
OpenAI-compatible con failover transparente, scopes por key y metering.

> Spec: `docs/superpowers/specs/2026-08-12-cardinal-v2-architecture.md` (sección 6).
> Estado: v0.2.6 (2026-09-07). Índice:
> [`docs/features/2026-09-03-router-surface.md`](../features/2026-09-03-router-surface.md).
> Catálogo + picker: [`docs/features/2026-09-07-router-catalog-key-scope.md`](../features/2026-09-07-router-catalog-key-scope.md).

---

## 1. Conceptos en 30 segundos

- **Provider**: un upstream de LLM (DeepSeek directo, OpenRouter, un mock local, lo
  que sea). Se define como fila en la DB — no hay que tocar código para agregar uno.
- **Modelo**: un modelo físico que sirve un provider (`deepseek-v4-flash-free`, ...).
- **Alias**: nombre lógico con una cadena de fallback (`fast` → [provider A → provider B]).
- **Key derivada**: `sk-cardinal-*` que identifica a un cliente (agente, app). Define
  qué modelos puede pedir (scopes) y cuánto puede consumir (budget).
- **Autorouter**: pedís un modelo por nombre real y el router arma el pool de
  providers que lo sirven; si uno falla (429/5xx/timeout), pasa al siguiente sin
  que el cliente se entere. El failover es transparente.
- **Fusion / MoA**: alias cuyo `fallback_chain` es un objeto JSON
  (`"mode":"fusion"`), no un array. Fan-out paralelo + judge; no es failover.
  Ver [`docs/features/2026-09-03-router-fusion.md`](../features/2026-09-03-router-fusion.md).

```
Cliente (cualquier SDK OpenAI-compatible)
        │  Bearer sk-cardinal-...
        ▼
POST http://127.0.0.1:8787/v1/chat/completions
        │  model: "fast" (alias)  o  "deepseek-v4-flash" (autorouter)
        ▼
   Router Cardinal
        │  auth (scope + budget) → resolve chain → failover → metering
        ▼
   Provider 1 ──► Provider 2 ──► Provider 3 (si el anterior falla)
```

---

## 2. Endpoints

| Endpoint | Auth | Descripción |
|----------|------|-------------|
| `POST /v1/chat/completions` | Bearer `sk-cardinal-*` | Completion OpenAI-compatible (streaming, no-streaming, Fusion) |
| `GET /v1/models` | — | Lista de modelos y aliases disponibles (formato OpenAI) |
| `GET /api/router/providers` | cookie JWT | Dashboard: providers + modelos (sin `api_key_enc`) |
| `POST /api/router/providers` | cookie JWT | Alta/rotación de provider: `name`, `base_url`, `api_key`. Modelos se descubren del upstream. La key se cifra (AES-256-GCM) y **nunca** vuelve en la respuesta |
| `GET /api/router/catalog` | cookie JWT | Dashboard: ids confirmados `{ id, kind }` (`model` \| `alias` \| `fusion`) |
| `GET /api/router/routes` | cookie JWT | Dashboard: aliases y `fallback_chain` (arrays; Fusion se ve vacío) |
| `PATCH /api/router/providers/:id` | cookie JWT | status, base_url, wire_format, cost, api_key, `sync_models` |
| `POST /api/router/providers/:id/sync-models` | cookie JWT | Re-fetch del catálogo del provider |
| `DELETE /api/router/providers/:id` | cookie JWT | Borra provider + sus modelos (no limpia aliases) |
| `PUT /api/router/routes/:alias` | cookie JWT | Upsert de cadena de hops (solo arrays) |
| `POST /api/keys` | cookie JWT | Crear key (plaintext una vez). Ver `/keys` |
| `GET /api/health` | — | Health check del backend |

Dashboard: `http://127.0.0.1:5173/router` y `/keys` (login JWT).
Base URL API: `http://127.0.0.1:8787/v1` (completions) y `http://127.0.0.1:8787/api` (admin).

---

## 3. Levantar el stack

```bash
cd ~/Data/Projects/ai-agents/cardinal-system
podman-compose up -d        # backend :8787 + frontend :5173
curl -s http://127.0.0.1:8787/api/health   # {"status":"ok","version":"0.2.6"}
```

Requisitos en `.env` (crear desde `deploy/env.example` si no existe):

```
ADMIN_USER=
ADMIN_PASSWORD_HASH=
JWT_SECRET=            # openssl rand -hex 32
POOL_SECRET=           # openssl rand -hex 32  ← CLAVE DE ENCRIPTACIÓN DE PROVIDERS
```

> Si agregás o cambiás variables en `.env` de un container ya corriendo:
> `podman-compose up -d --force-recreate backend`

---

## 4. Gestión de providers

Los providers viven en la DB (tablas `providers`, `provider_models`, `model_routes`).
El router es **agnóstico**: cualquier upstream OpenAI-compatible sirve.

### 4.1 Agregar un provider real

Desde el dashboard: **Router → Catalog** (`/router`), formulario ADD PROVIDER KEY
(name, base url, api key, wire format, cost/mtok). Al guardar, Cardinal pega
`GET …/models` del upstream y persiste el catálogo. `POST /api/router/providers`
cifra la key y no la devuelve. Sync manual: **sync models** en la fila.

Sigue existiendo el camino CLI para e2e/scripts:

```bash
podman exec cardinal-backend sh -c 'cd /app && bun backend/src/seed-provider.ts --name deepseek-direct --base-url https://api.deepseek.com/v1 --api-key <KEY> --model deepseek-v4-flash --model deepseek-v4-pro'
```

> (Si el script `seed-provider.ts` todavía no existe, el patrón está en
> `backend/src/seed-router.ts` — es el mismo: `upsertProvider` + `addProviderModel`.)

One-shot de referencia (2026-09-05): se importó el catálogo **mensual público** de
FreeLLMAPI (`GET https://api.freellmapi.co/v1/latest`, tier `monthly` v2026.09.04)
como filas `disabled` (sin key). Los keyless (`kilo`, `ovh`, `aihorde`) quedaron
`active`. No es el feed live de pago; el siguiente paso personal es un catálogo
propio, no suscribirse.

La api_key se encripta con AES-256-GCM usando `POOL_SECRET` — **nunca se guarda en
claro y nunca sale del Cardinal**. Para listar providers sin exponer keys:

```bash
podman exec cardinal-backend sh -c 'cd /app && bun -e "import { createDb, listProviders } from \"@cardinal/db\"; const db = createDb(process.env.DB_PATH); console.log(listProviders(db).map(p => ({ name: p.name, status: p.status, base_url: p.base_url })))"'
```

### 4.2 Definir un alias con fallback

```bash
podman exec cardinal-backend sh -c 'cd /app && bun -e "
import { createDb, upsertModelRoute } from \"@cardinal/db\";
const db = createDb(process.env.DB_PATH);
upsertModelRoute(db, \"fast\", [
  { provider: \"deepseek-direct\", model: \"deepseek-v4-flash\" },
  { provider: \"mock-local\", model: \"test-model\" },
]);
console.log(\"alias fast → 2 eslabones\");
"'
```

Ahora `model: "fast"` prueba deepseek-direct primero y, si falla, cae al mock.
El cliente ve siempre `model: "fast"` en la respuesta (se reescribe), nunca el
modelo real del provider que respondió.

### 4.3 Autorouter (sin alias)

Si hay providers que sirven `deepseek-v4-flash` (varios), pedís directamente
`model: "deepseek-v4-flash"` y el router arma el pool solo, ordenado por
`providers.id`, con failover automático entre ellos.

### 4.4 Deshabilitar un provider

```bash
podman exec cardinal-backend sh -c 'cd /app && bun -e "
import { createDb, setProviderStatus } from \"@cardinal/db\";
const db = createDb(process.env.DB_PATH);
setProviderStatus(db, \"mock-local\", \"disabled\");
"'
```

Los providers `disabled` se filtran del autorouter y de los aliases.

### 4.5 Fusion / MoA

No es failover: N proposers en paralelo y un judge sintetiza **una** respuesta.
El JSON de `model_routes.fallback_chain` es un **objeto**, no un array.
`upsertModelRoute` / `PUT /api/router/routes/:alias` no lo aceptan (solo hops);
seed con SQL. Detalle:
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

Cliente: `model: "fusion"` (o el alias de esa fila) + Bearer `sk-cardinal-*`
con scope `fusion` o `*`. `stream: true` → 400. `best_of` → 501.

En `/router` esa fila se ve con hops `—` (el GET parsea solo arrays). Follow-up.

---

## 5. Gestión de keys (identidad del cliente)

Desde el dashboard (`/keys`, cookie JWT) se crea una key eligiendo **un** id
del catálogo (modelo, alias o Fusion), más budget de tokens, expiración y tope
USD. El plaintext se muestra **una sola vez**. No hay `*` en la UI; el CLI
sigue aceptando `*` y scopes libres:

```bash
# Key con autorouter libre (scope "*")
podman exec cardinal-backend sh -c 'cd /app && bun run keygen -- --agent <nombre> --kind agent'

# Key con scope a un alias/modelo puntual + budget de 50k tokens
podman exec cardinal-backend sh -c 'cd /app && bun run keygen -- --agent <nombre> --kind agent --scope fast --scope pro --budget 50000'

# Listar keys / revocar
podman exec cardinal-backend sh -c 'cd /app && bun run keygen -- --list'
podman exec cardinal-backend sh -c 'cd /app && bun run keygen -- --revoke <nombre>'
```

### Semántica de scopes

| Scope | Efecto |
|-------|--------|
| `["*"]` (default) | Puede pedir cualquier modelo/alias (autorouter libre) |
| `["fast"]` | Solo el alias `fast` |
| `["deepseek-v4-pro"]` | Solo ese modelo, de cualquier provider que lo sirva |

### Semántica de budget

- `budget_limit` en **tokens** acumulados (`budget_used` suma en cada llamada).
- `budget_usd_limit` opcional: `(tokens/1e6)*cost_per_mtok` del hop. Costo 0 no
  mueve USD. Overshoot → auto-revoke (igual que tokens).
- `expires_at` pasado → la key no es activa (`unauthorized`).
- Si una llamada excede el budget restante, el router revoca la key automáticamente
  (auto-revoke) — el agente público no puede seguir consumiendo.
- `created_by=system` → one-shot/agentes públicos, auto-revocables.
- `created_by=human` → jamás se tocan salvo acción explícita.

> ⚠️ La key se imprime **una sola vez** al crear. Si la perdés, revocá y recreá.
> ⚠️ El renderer de terminal redacta `sk-cardinal-*` en outputs — para scripts e2e
> generá la key dentro del script sin imprimirla (ver `backend/src/e2e-router.ts`).

---

## 6. Uso desde un cliente

Cualquier cliente OpenAI-compatible sirve (OpenAI SDK, curl, Claude Code, etc.).

### curl (no-streaming)

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

### Tool calling

El body se pasa tal cual al upstream: `tools`, `tool_choice`, `temperature`,
`max_tokens` viajan. Ojo con providers que descartan tools (pitfall Nogal Hive) —
validar passthrough por provider.

---

## 7. Códigos de error

| HTTP | `error` | Significado |
|------|---------|-------------|
| 400 | `invalid_json` | Body no parseable |
| 401 | `unauthorized` | Falta Bearer o key desconocida/revocada |
| 402 | `budget_exceeded` | La key ya consumió todo su budget |
| 403 | `scope_denied` | La key no puede pedir ese modelo/alias |
| 404 | `model_not_found` | No hay ningún provider que sirva ese modelo |
| 502 | `all_providers_failed` | Todos los eslabones fallaron; `details.attempts` tiene el trail |

---

## 8. Metering y monitoreo

El consumo se registra en dos lugares:

- `agent_keys.budget_used` — acumulado por key (para el corte de budget).
- `usage_log` — una fila por llamada exitosa: `agent_name`, `key_hash`,
  `provider_name`, `model_id`, `prompt_tokens`, `completion_tokens`,
  `total_tokens`, `created_at`.

Consultar el consumo:

```bash
podman exec cardinal-backend sh -c 'cd /app && bun -e "
import { createDb, listUsage } from \"@cardinal/db\";
const db = createDb(process.env.DB_PATH);
console.log(listUsage(db, 20));
"'
```

Nota: en streaming sin `usage` en el payload, el router estima tokens como
`bytes/4` (orden de magnitud, no exacto). Los providers que devuelven
`usage` (la mayoría) registran el número real.

---

## 9. E2E / prueba rápida (mock local)

El repo incluye un mock upstream OpenAI-compatible para probar sin LLM real:

```bash
# Terminal 1: mock en :18999
python3 scripts/mock-upstream.py

# Terminal 2: seed + e2e (crea provider mock-local, alias "fast", key e2e)
podman exec cardinal-backend sh -c 'cd /app && bun backend/src/seed-router.ts'
podman exec cardinal-backend sh -c 'cd /app && bun backend/src/e2e-router.ts'
```

El e2e valida: /v1/models, completion por alias, 401 sin Bearer, streaming SSE,
metering (budget_used + usage_log), scope.

---

## 10. Troubleshooting

| Síntoma | Causa / Fix |
|---------|-------------|
| Backend no arranca: `POOL_SECRET is required` | Falta `POOL_SECRET` en `.env` + recrear container |
| Backend en crash loop: `EBUSY: Failed to replace old lockfile` | Workspace nuevo sin lockfile actualizado. Fix: `podman-compose stop backend`, `podman run --rm -v <repo>:/repo -w /repo docker.io/oven/bun:1 sh -c 'bun install'`, `podman-compose up -d backend` |
| `Cannot find module '@cardinal/db' from '/app/[eval]'` | `bun -e` desde `/app` no resuelve workspaces. Correr desde `/app/backend` o usar un script en `backend/src/` |
| 502 `all_providers_failed` | Todos los providers del chain están caídos o en cooldown (60s tras 429/5xx). Revisar `details.attempts` y `setProviderStatus` |
| 404 `model_not_found` | Ningún provider activo sirve ese modelo. Chequear `provider_models` y status de providers |
| La key revocada sola | Excedió `budget_limit` o `budget_usd_limit` → auto-revoke por diseño |
| 401 con key que existía | `expires_at` pasado, o revoked |
| 400 `fusion_not_configured` | Pediste `fusion` sin ruta objeto en `model_routes` |
| Frontend no levanta (dev) | Blocker de entorno: rolldown native binding + noexec en `~/Data` (ERR_DLOPEN_FAILED). No afecta al router (backend puro) |

---

## 11. Providers disponibles hoy (2026-08-20)

| Provider | Estado | Notas |
|----------|--------|-------|
| `mock-local` | ✅ Activo (e2e) | Mock OpenAI-compatible en host `:18999` vía `host.containers.internal` |
| `opencode-zen` (`opencode/*-free`) | ✅ Funciona como CLI | Para usarlo como upstream necesita `opencode-llm-proxy` (:4010, plugin en config GLOBAL de opencode) |
| `opencode-go` (`opencode-go/*`) | ❌ Caído | Suscripción vencida 2026-08 — no usar |
| `deepseek-direct` | ⏸️ Pendiente | Agregar cuando Santi tenga key (seed 4.1) |

**Cómo conectar zen free (cuando quieras):**
1. Instalar plugin en config global: `npm install opencode-llm-proxy` + registrarlo en `~/.config/opencode/opencode.json`
2. Correr `opencode serve` con el plugin → levanta `:4010` con wire OpenAI
3. Seed del provider: `base_url: http://host.containers.internal:4010/v1`
4. Alias: `upsertModelRoute(db, "fast", [{provider: "opencode-zen", model: "deepseek-v4-flash-free"}])`

---

## Referencias

- Spec: `docs/superpowers/specs/2026-08-12-cardinal-v2-architecture.md`
- Backlog: `docs/superpowers/plans/2026-08-17-cardinal-v2-backlog.md`
- Índice v0.2.5: `docs/features/2026-09-03-router-surface.md`
- Sprint: `docs/sprints/2026-09-03-router-surface.md`
- Código: `packages/router/` (core + `fusion.ts`), `backend/src/api/router.ts` (`/v1`),
  `backend/src/api/router-dashboard.ts` (JWT), `backend/src/seed-router.ts`,
  `backend/src/e2e-router.ts`, `scripts/mock-upstream.py`

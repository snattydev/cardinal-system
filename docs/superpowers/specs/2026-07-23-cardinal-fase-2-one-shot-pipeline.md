# Cardinal System — Fase 2: Pipeline de Agentes One-Shot

> **Diseño completo del pipeline: creación, ejecución y destrucción de agentes one-shot**
> Fecha: 2026-07-23 · Estado: diseño aprobado para implementación
> Basado en el flujo definido por Santiago: Shinon → subagente coding → PR → one-shot review → @mention para análisis pesado

---

## 1. Visión General

El pipeline de **agentes one-shot** convierte al Cardinal de un sistema pasivo (Fase 0: solo recibe conexiones y sirve estado) a un **orquestador activo**: el Cardinal crea, ejecuta y destruye agentes con modelos específicos para tareas acotadas, **sin estado persistente entre invocaciones**.

### Flujo deseado (de arriba a abajo)

```
Santi → "hacé esta feature"
  └─ Shinon (deepseek-v4-flash, default profile)
       └─ Subagente local de coding (deepseek-v4-flash)
            ├─ Implementa la feature
            ├─ git commit + push → GitHub PR
            └─ Notifica a Cardinal: "PR #N listo para review"

Cardinal System
  ├─ Crea one-shot agent de CODE REVIEW
  │    ├─ Modelo: kimi-k2.6 (mid-tier) o deepseek-v4-pro
  │    ├─ Contexto: diff del PR + description
  │    ├─ max_turns = 1 → EXACTAMENTE 1 review (NO loop)
  │    └─ Salida: review posteado como comentario en el PR
  │
  ├─ Destruye el one-shot agent
  └─ Registra resultado en DB

Santi lee el PR + el review
  └─ Si necesita más poder:
       └─ @menciona un agente en GitHub (ej: @cardinal-deep-review)
            └─ Cardinal detecta @mention via webhook
                 ├─ Crea one-shot agent con modelo premium (qwen3.7-max)
                 ├─ Pasa el PR completo como contexto
                 ├─ max_turns = 1
                 └─ Resultado: comentario en el PR o en dashboard
```

---

## 2. Endpoints y Capacidades Nuevas del Cardinal

### 2.1 Endpoint LLM Router — `/v1/chat/completions`

**Propósito:** Reemplazar a FreeLLMAPI como router de modelos central. Los agentes one-shot y los agentes SAO existentes pueden consumir LLM directamente del Cardinal.

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| `POST` | `/v1/chat/completions` | API key `sk-cardinal-*` | Proxy/compat OpenAI, model routing según tarea |

**Modelo de datos nuevo — tabla `model_routes`:**

```sql
CREATE TABLE model_routes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  task_type     TEXT NOT NULL UNIQUE,      -- 'coding', 'review', 'deep_analysis', 'light'
  primary_model TEXT NOT NULL,             -- ej: deepseek-v4-flash
  fallback1     TEXT,                      -- ej: gpt-oss-120b
  fallback2     TEXT,                      -- ej: kimi-k2.6
  max_tokens    INTEGER DEFAULT 4096,
  temperature   REAL DEFAULT 0.7,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Lógica de routing:**

```
POST /v1/chat/completions
  body: { model, messages, max_tokens?, temperature?, task_type? }

  1. Si task_type está presente → lookup model_routes[task_type] → primary → fallback
  2. Si model está presente → usarlo directamente (override)
  3. El router intenta FreeLLMAPI primero, luego OpenCode Zen como fallback
  4. Response: OpenAI-compatible streaming o no-streaming
```

**Implementación como proxy:**

```typescript
// backend/src/router/index.ts
// NO hace llamadas LLM directas — delega a FreeLLMAPI u OpenCode Zen
// Solo maneja routing + fallback + rate limiting

export async function handleChatCompletions(req: Request, db: Database): Promise<Response> {
  const body = await req.json();
  const model = resolveModel(body.task_type ?? 'light', body.model, db);
  const freellmResponse = await proxyToFreeLLMAPI(model, body.messages, {
    max_tokens: body.max_tokens,
    temperature: body.temperature,
    stream: body.stream === true,
  });
  return freellmResponse;
}
```

### 2.2 Orchestration Endpoint — `POST /api/one-shot`

**Propósito:** Spawnear un agente one-shot con parámetros específicos y obtener su resultado.

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| `POST` | `/api/one-shot` | API key `sk-cardinal-*` o JWT humano | Crear y ejecutar un agente one-shot |
| `GET` | `/api/one-shot/:id` | API key o JWT | Obtener resultado de un one-shot |

**Request body `POST /api/one-shot`:**

```json
{
  "name": "review-pr-42",
  "task_type": "review",
  "model": "kimi-k2.6",
  "context": {
    "pr_url": "https://github.com/owner/repo/pull/42",
    "pr_diff": "diff --git a/src/auth.ts b/src/auth.ts\n...",
    "pr_description": "Adds JWT refresh token rotation",
    "repo": "owner/repo",
    "pr_number": 42
  },
  "max_turns": 1,
  "ttl_seconds": 300,
  "output_channel": "github_comment",
  "created_by": "shinon"
}
```

**Response:**

```json
{
  "id": "os_a1b2c3d4",
  "status": "running",
  "agent_name": "review-pr-42",
  "model": "kimi-k2.6",
  "key": "sk-cardinal-os_a1b2c3d4...",
  "created_at": "2026-07-23T12:00:00Z"
}
```

### 2.3 Webhook Endpoint — `POST /api/webhooks/github`

**Propósito:** Recibir eventos de GitHub (PR opened, PR commented, @mention).

| Método | Path | Auth | Descripción |
|--------|------|------|-------------|
| `POST` | `/api/webhooks/github` | Secret compartido | Eventos de GitHub |

---

## 3. Ciclo de Vida de un Agente One-Shot

El modelo de datos central para uno-shot agents:

```sql
CREATE TABLE one_shot_agents (
  id              TEXT PRIMARY KEY,            -- ej: os_a1b2c3d4 (prefijo 'os_')
  name            TEXT NOT NULL,               -- nombre descriptivo: "review-pr-42"
  task_type       TEXT NOT NULL,               -- 'coding', 'review', 'deep_analysis'
  model           TEXT NOT NULL,               -- modelo asignado
  status          TEXT NOT NULL DEFAULT 'created',
                  -- 'created' → 'spawning' → 'running' → 'completed' | 'failed' | 'timed_out'
  context         TEXT NOT NULL,               -- JSON: prompt, PR diff, instrucciones
  result          TEXT,                        -- JSON: review output, análisis
  key_hash        TEXT,                        -- hash de la key dinámica (sk-cardinal-os_*)
  key_revoked_at  TEXT,                        -- cuándo se revocó la key
  podman_id       TEXT,                        -- container ID si usó Podman
  pid             INTEGER,                     -- process ID si usó terminal
  ttl_seconds     INTEGER NOT NULL DEFAULT 300,-- tiempo de vida máximo
  expires_at      TEXT NOT NULL,               -- ttl_seconds desde created_at
  max_turns       INTEGER NOT NULL DEFAULT 1,  -- anti-loop: default 1
  output_channel  TEXT,                        -- 'github_comment', 'dashboard', 'webhook'
  created_by      TEXT NOT NULL,               -- 'shinon', 'system', 'github_webhook'
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at    TEXT
);
```

### Fases del ciclo de vida

```
FASE 1: CREACIÓN
  Cardinal recibe POST /api/one-shot o detecta trigger
  ├─ Valida parámetros (modelo existe, task_type válido)
  ├─ Genera ID único (os_$random)
  ├─ Genera key dinámica: sk-cardinal-os_$id (created_by='system')
  ├─ Guarda row en one_shot_agents (status='created')
  └─ Responde con ID + key

FASE 2: SPAWNING (2 estrategias, ver §5)
  ├─ Opción A (ligero): `hermes chat -q "prompt..."` vía terminal
  │   └─ Proceso efímero con timeout = ttl_seconds
  ├─ Opción B (pesado): `podman run --rm` container
  │   └─ Podman exec con resource limits + mount temporario
  ├─ Actualiza status → 'spawning'
  └─ Inicia watchdog timer (ttl_seconds)

FASE 3: EJECUCIÓN
  ├─ El agente recibe contexto + key dinámica
  ├─ El agente puede llamar Cardinal /v1/chat/completions si necesita LLM
  ├─ max_turns impide loops
  └─ Watchdog: si expires_at se alcanza → kill + status='timed_out'

FASE 4: RESULTADO
  ├─ Agente completa su tarea
  ├─ Postea output según output_channel
  │   ├─ github_comment → GitHub API: POST /repos/:owner/:repo/issues/:n/comments
  │   ├─ dashboard → queda disponible en GET /api/one-shot/:id
  │   └─ webhook → POST a URL configurada
  ├─ Guarda result en one_shot_agents
  ├─ Revoca la key dinámica (key_revoked_at)
  └─ Status → 'completed'

FASE 5: CLEANUP
  ├─ Si usó Podman: podman rm (ya --rm, pero forzar si no)
  ├─ Revoca key (DISTINTO de revocar keys humanas — las system keys se auto-revocan)
  ├─ Si expiró sin completar: status='timed_out'
  └─ GC periódico: borra rows viejas + old > 7d
```

### Anti-loop: `max_turns = 1`

**La regla FUNDAMENTAL** (exigida por el usuario):

> El one-shot review agent hace **EXACTAMENTE 1 review** y entrega resultado. No hay loop infinito.

Implementación:
- `one_shot_agents.max_turns` default = 1
- En la ejecución del agente, el prompt incluye "You have exactly ONE pass to analyze this. Do your complete analysis now. No follow-ups, no iterations."
- Si se usa `hermes chat -q`, el flag `--max-turns 1` (o equivalente según el tool de agente)
- Si se usa un subagente Hermes, `delegate_task` con limitación de iteraciones
- El watchdog timer garantiza que incluso si el agente intenta loopear, el timeout lo mata

---

## 4. Integración con GitHub PRs

### 4.1 Auto-Review Post-PR

**Trigger:** Shinon (o subagente de coding) crea un PR en GitHub.

**Flujo:**

```
1. Coding subagent completa feature, hace git push, crea PR:
   gh pr create --title "feat: JWT refresh rotation" --body "..."

2. PR creado → subagente notifica a Cardinal:
   POST /api/one-shot {
     name: "review-pr-42",
     task_type: "review",
     model: "kimi-k2.6",
     context: {
       pr_url: "https://github.com/owner/repo/pull/42",
       pr_diff: "<obtener diff via gh pr diff 42 o API GitHub>",
       pr_description: "Adds JWT refresh token rotation"
     },
     max_turns: 1,
     output_channel: "github_comment"
   }

3. Cardinal spawns one-shot review agent (ver §5)

4. Review agent recibe el diff + descripción, analiza, produce review

5. Review agent postea resultado como comentario en el PR:
   gh pr review 42 --comment --body "## Code Review\n\n### Critical\n...\n### Warnings\n..." 

6. Cardinal registra resultado, revoca key, cleanup
```

### 4.2 @Mention en GitHub — Deep Analysis

**Trigger:** Alguien @menciona un agente conocido en un comentario de GitHub.

**Formato de @mention:**

```
@cardinal-review        → modelo mid-tier (kimi-k2.6)
@cardinal-deep          → modelo premium (qwen3.7-max)
@cardinal-coding        → coding ligero (deepseek-v4-flash)
```

**Flujo:**

```
1. GitHub envía webhook a Cardinal:
   POST /api/webhooks/github
   Event: issue_comment (PR comment)
   Body: { action: "created", issue: { number: 42 }, comment: { body: "@cardinal-deep can you review the auth refactor?" } }

2. Cardinal procesa el webhook:
   a. Verifica secret del webhook
   b. Parsea el body del comentario buscando @mentions
   c. Extrae el modelo según el mapping:
      - @cardinal-review → kimi-k2.6
      - @cardinal-deep → qwen3.7-max (o qwen3.7-plus)
      - @cardinal-coding → deepseek-v4-flash
   d. Obtiene el diff del PR via GitHub API
   
3. Cardinal crea one-shot:
   POST /api/one-shot (auto-generado internamente)
   name: "deep-review-pr-42-@santi"
   task_type: "deep_analysis"
   model: "qwen3.7-max"
   output_channel: "github_comment"
   max_turns: 1

4. Spawn, ejecuta, postea resultado como reply al comentario

5. Cardinal registra, cleanup
```

**Modelo de datos — tabla `github_mentions`:**

```sql
CREATE TABLE github_mentions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  mention         TEXT NOT NULL UNIQUE,    -- '@cardinal-deep'
  model           TEXT NOT NULL,           -- 'qwen3.7-max'
  task_type       TEXT NOT NULL DEFAULT 'deep_analysis',
  description     TEXT,                    -- 'Análisis pesado con modelo premium'
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 4.3 Cómo Cardinal obtiene el diff del PR

Dos estrategias complementarias:

**Estrategia A — gh CLI (recomendada para el VPS donde corre Cardinal):**

```bash
gh pr diff 42 --repo owner/repo
```

**Estrategia B — GitHub API (fallback, funciona sin gh CLI):**

```bash
curl -s -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/owner/repo/pulls/42
# Obtiene diff_url → lo fetchea
```

**Implementación en Cardinal:**

El contexto del PR se recolecta antes de spawnear el one-shot y se pasa como parte del `context` — el one-shot NO necesita llamar a GitHub. Esto asegura que el one-shot tenga todo lo necesario desde el inicio.

```
context: {
  pr_url: "...",
  pr_diff: "<diff completo>",
  pr_description: "...",
  pr_title: "...",
  changed_files: ["src/auth.ts", "src/lib/jwt.ts"],
  repo: "owner/repo",
  pr_number: 42
}
```

### 4.4 Determinación de modelo según tarea

Cada task_type tiene un modelo por defecto configurable en `model_routes`:

| task_type | Modelo primario | Fallback | Uso |
|-----------|----------------|----------|-----|
| `coding` | deepseek-v4-flash | gpt-oss-120b | Features, bug fixes, scripting |
| `review` | kimi-k2.6 | deepseek-v4-pro | Code review mid-tier (default) |
| `deep_analysis` | qwen3.7-max | kimi-k2.6 → deepseek-v4-pro | Análisis pesado (@mention) |
| `light` | deepseek-v4-flash | auto | Consultas rápidas, one-liners |

El @mention mapping permite override directo del modelo, lo que da al usuario control total sobre qué modelo se usa.

---

## 5. Estrategias de Ejecución

### 5.1 Opción A: Hermes Delegation (Ligero — Recomendado para Review)

Usa `hermes chat -q` vía terminal con un perfil específico.

**Cómo funciona:**

```bash
# Cardinal genera un key dinámica
CARDINAL_KEY=$(bun run keygen -- --agent "review-pr-42" --kind subagent --quiet)

# Ejecuta un subagente Hermes que tiene acceso al modelo y al contexto
echo "Eres un code reviewer. Analiza este PR diff:
<diff>
...
</diff>

Produce un review estructurado con:
- Critical Issues (must fix)
- Warnings (should fix)
- Suggestions (optional)

MAX_TURNS=1 — No hagas iteraciones. Haz tu análisis completo AHORA." | \
hermes chat -q "$(cat)" -t file -p review-profile --model kimi-k2.6 --max-turns 1

# Revoca la key
bun run keygen -- --revoke "review-pr-42"
```

**Ventajas:**
- Sin overhead de contenedores
- Usa el perfil Hermes existente (skills, tools, configuración)
- Extremadamente rápido de spawnear
- Fácil de limitar a 1 turn

**Desventajas:**
- Aislamiento limitado (mismo proceso host)
- Comparte recursos del sistema Hermes
- No escala a modelos muy pesados bien

### 5.2 Opción B: Podman Container (Pesado — Recomendado para Deep Analysis)

Usa `podman run --rm` con un contenedor efímero.

**Containerfile para one-shot agents:**

```dockerfile
FROM oven/bun:latest
WORKDIR /agent
COPY agent.ts .
CMD ["bun", "run", "agent.ts"]
```

**Cómo funciona:**

```bash
# Cardinal genera key dinámica
KEY=$(bun run keygen -- --agent "deep-review-pr-42" --kind subagent --quiet)

# Spawnea contenedor one-shot
podman run --rm \
  --name "cardinal-os-deep-review-pr-42" \
  -e CARDINAL_KEY="$KEY" \
  -e CARDINAL_URL="ws://host.containers.internal:8787/ws" \
  -e LLM_API_URL="http://host.containers.internal:3001/v1" \
  -e LLM_MODEL="qwen3.7-max" \
  -e TASK_CONTEXT="<contexto del PR>" \
  --memory=4g --cpus=2 \
  --network=host \
  --timeout=300 \
  cardinal-one-shot:latest

# Revoca key (podman --rm lo limpia automáticamente)
bun run keygen -- --revoke "deep-review-pr-42"
```

**Ventajas:**
- Aislamiento completo (filesystem, procesos, red)
- Resource limits explícitos (CPU, memory)
- No contamina el sistema Hermes principal
- Apropiado para modelos pesados

**Desventajas:**
- Startup overhead (3-5 segundos para tirar el container)
- Más consumo de recursos
- Más complejidad de implementación

### 5.3 Estrategia Recomendada: Híbrida

| Peso de tarea | Estrategia | Modelo | Ejemplo |
|--------------|-----------|--------|---------|
| Review estándar | Hermes delegation | kimi-k2.6 | Code review post-PR |
| Análisis pesado @mention | Podman container | qwen3.7-max | Deep analysis per @mention |
| Coding quick-fix | Hermes delegation | deepseek-v4-flash | Subagente de Shinon |

**Regla de decisión en el Cardinal:**

```typescript
function selectExecutionStrategy(task_type: string, model: string): 'hermes' | 'podman' {
  const HEAVY_MODELS = ['qwen3.7-max', 'qwen3.7-plus', 'deepseek-v4-pro'];
  if (HEAVY_MODELS.includes(model)) return 'podman';
  if (task_type === 'deep_analysis') return 'podman';
  return 'hermes';
}
```

---

## 6. Arquitectura del Orquestador

### 6.1 Módulos Nuevos en Cardinal

```
backend/src/
├── router/
│   ├── index.ts              # /v1/chat/completions handler + model routing
│   ├── routing.test.ts
│   └── provider.ts           # Provider abstraction (FreeLLMAPI, OpenCode Zen, etc.)
│
├── oneshot/
│   ├── index.ts              # POST /api/one-shot handler + lifecycle management
│   ├── orquestador.ts        # Orchestrator: spawn, monitor, cleanup
│   ├── executor-hermes.ts    # Ejecutor vía Hermes terminal
│   ├── executor-podman.ts    # Ejecutor vía Podman container
│   ├── watchdog.ts           # TTL watchdog timer
│   └── oneshot.test.ts
│
├── webhooks/
│   ├── index.ts              # Webhook receiver (GitHub, etc.)
│   ├── github.ts             # GitHub webhook parser + @mention detector
│   └── webhook.test.ts
│
├── db/
│   ├── repos.ts              # + funciones para one_shot_agents, model_routes, github_mentions
│   └── index.ts              # + migrations para nuevas tablas
│
└── api/
    ├── one-shot.ts           # Handlers REST para one-shot management (list, get, cancel)
    └── webhooks.ts           # Handlers de webhook
```

### 6.2 Flujo Interno del Orquestador

```
POST /api/one-shot
  │
  ▼
oneshot/index.ts: handleCreateOneShot()
  ├─ ValidateTaskType(task_type) → buscar model_routes
  ├─ DetermineModel(task_type, model_override) → model_routes.primary_model
  ├─ SelectStrategy(task_type, model) → 'hermes' | 'podman'
  ├─ GenerateID() → "os_a1b2c3d4"
  ├─ CreateDynamicKey(agent_name) → keyHash, guarda en agent_keys (created_by='system')
  ├─ InsertDB({ id, name, task_type, model, status='created', ... })
  └─ Response: { id, status, agent_name, model, key }
  │
  ▼  (background: no bloquea al caller)
  
oneshot/orquestador.ts: spawnOneShot(id)
  ├─ UPDATE status → 'spawning'
  ├─ PrepareContext(db, id)
  │   └─ Si output_channel === 'github_comment': armar prompt con diff + instrucciones
  │
  ├─ IF strategy === 'hermes':
  │   └─ executor-hermes.ts: runHermesOneShot(id, context, model, max_turns)
  │       ├─ Construye prompt con instrucciones + contexto
  │       ├─ terminal("hermes chat -q '<prompt>' --model <model> --max-turns <max_turns>",
  │       │           background=true, timeout=ttl_seconds, notify_on_complete=true)
  │       └─ Guarda PID en DB
  │
  ├─ IF strategy === 'podman':
  │   └─ executor-podman.ts: runPodmanOneShot(id, context, model, max_turns)
  │       ├─ Construye prompt file temporario
  │       ├─ podman run --rm ... (con resource limits)
  │       └─ Guarda podman_id en DB
  │
  ├─ UPDATE status → 'running'
  └─ StartWatchdog(id, ttl_seconds)
  │
  ▼  (when process/container exits)

oneshot/orquestador.ts: onOneShotComplete(id, output)
  ├─ Parse output → result JSON
  ├─ IF output_channel === 'github_comment':
  │   └─ Post comment via GitHub API
  ├─ UPDATE result, status='completed', completed_at
  ├─ RevokeDynamicKey(id) → agent_keys SET revoked_at
  └─ StopWatchdog(id)

oneshot/orquestador.ts: onOneShotTimeout(id)
  ├─ Kill process: process.kill(pid, 'SIGKILL') o podman kill <container>
  ├─ UPDATE status='timed_out', result={ error: 'timeout' }
  ├─ RevokeDynamicKey(id)
  └─ Log event

oneshot/orquestador.ts: cleanupStale()
  ── Cron interno cada 5 minutos:
     ├─ Busca one_shot_agents WHERE status='running' AND expires_at < now()
     └─ Por cada uno: onOneShotTimeout(id)
```

### 6.3 Dynamic Key Factory

**Regla clave:** Las keys `created_by='system'` son auto-revocables por el Cardinal. Las keys `created_by='human'` NUNCA se tocan automáticamente (regla de Fase 0).

```typescript
// oneshot/orquestador.ts
function createDynamicKey(agentName: string): string {
  const key = generateKey();
  createAgentKey(db, {
    keyHash: hashKey(key),
    agentName: agentName,
    kindOverride: 'subagent',  // Los one-shot son siempre subagents
    createdBy: 'system',       // ← clave: el sistema puede revocarlas
  });
  return key;  // Se devuelve UNA vez, se imprime en la response
}

function revokeDynamicKey(osId: string): void {
  const os = getOneShot(db, osId);
  if (!os || !os.key_hash) return;
  // Solo revocar keys 'system', nunca 'human'
  db.run("UPDATE agent_keys SET revoked_at = datetime('now') WHERE key_hash = ? AND created_by = 'system'", [os.key_hash]);
}
```

---

## 7. Tablas Nuevas en SQLite

```sql
-- Migración para Fase 2

CREATE TABLE model_routes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  task_type     TEXT NOT NULL UNIQUE,             -- 'coding', 'review', 'deep_analysis', 'light'
  primary_model TEXT NOT NULL,                    -- deepseek-v4-flash
  fallback1     TEXT,                              -- gpt-oss-120b
  fallback2     TEXT,                              -- auto
  max_tokens    INTEGER NOT NULL DEFAULT 4096,
  temperature   REAL NOT NULL DEFAULT 0.7,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE one_shot_agents (
  id              TEXT PRIMARY KEY,                -- 'os_a1b2c3d4'
  name            TEXT NOT NULL,
  task_type       TEXT NOT NULL,
  model           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'created'
                  CHECK (status IN ('created','spawning','running','completed','failed','timed_out')),
  context         TEXT NOT NULL,                   -- JSON
  result          TEXT,                            -- JSON (nullable hasta que complete)
  key_hash        TEXT,                            -- hash de la key dinámica
  key_revoked_at  TEXT,
  podman_id       TEXT,
  pid             INTEGER,
  ttl_seconds     INTEGER NOT NULL DEFAULT 300,
  expires_at      TEXT NOT NULL,
  max_turns       INTEGER NOT NULL DEFAULT 1,
  output_channel  TEXT,                            -- 'github_comment', 'dashboard', 'webhook', NULL
  output_url      TEXT,                            -- URL del target (ej: PR comment URL)
  created_by      TEXT NOT NULL DEFAULT 'system',   -- 'shinon', 'system', 'github_webhook'
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at    TEXT
);

CREATE TABLE github_mentions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  mention         TEXT NOT NULL UNIQUE,            -- '@cardinal-deep'
  model           TEXT NOT NULL,
  task_type       TEXT NOT NULL DEFAULT 'deep_analysis',
  description     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE webhook_subscriptions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source          TEXT NOT NULL,                   -- 'github'
  event_type      TEXT NOT NULL,                   -- 'pull_request', 'issue_comment'
  secret          TEXT NOT NULL,                   -- shared secret para verificar
  config          TEXT NOT NULL DEFAULT '{}',      -- JSON: repo filter, etc.
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source, event_type)
);

-- Índices
CREATE INDEX idx_one_shot_status ON one_shot_agents(status);
CREATE INDEX idx_one_shot_expires ON one_shot_agents(expires_at);
CREATE INDEX idx_one_shot_created ON one_shot_agents(created_by);
CREATE INDEX idx_agent_keys_created_by ON agent_keys(created_by);
```

---

## 8. Nuevos Endpoints REST

### 8.1 Endpoints Públicos (no requieren auth)

| Método | Path | Descripción |
|--------|------|-------------|
| `POST` | `/api/webhooks/github` | Webhook de GitHub (usa secret compartido) |

### 8.2 Endpoints Protegidos (requieren JWT o API key)

| Método | Path | Descripción |
|--------|------|-------------|
| `POST` | `/v1/chat/completions` | LLM proxy con model routing |
| `POST` | `/api/one-shot` | Crear nuevo one-shot agent |
| `GET` | `/api/one-shot` | Listar one-shots (filtro por status, task_type) |
| `GET` | `/api/one-shot/:id` | Detalle + resultado de un one-shot |
| `POST` | `/api/one-shot/:id/cancel` | Cancelar un one-shot en ejecución |
| `GET` | `/api/routes` | Listar model routes configuradas |
| `POST` | `/api/routes` | Crear/actualizar model route |
| `GET` | `/api/mentions` | Listar @mention mappings |
| `POST` | `/api/mentions` | Crear @mention mapping |

### 8.3 Mensajes WS Nuevos

El protocolo WS se extiende para reportar estado de one-shots:

```
# Dashboard recibe updates de one-shot agents
cardinal → { type: "one_shot_update", os: { id, name, status, task_type, created_at } }

# Dashboard cuando un one-shot completa
cardinal → { type: "one_shot_complete", os: { id, name, status: "completed", result_summary: "..." } }
```

---

## 9. Integración con el Dashboard SAO

### Nuevas vistas en el frontend

**Página: One-Shot Agents (`/one-shot`)**
- Tabla de one-shot agents (recientes, filtrable por status)
- Cada row: nombre, modelo, task_type, status, tiempo transcurrido, creado por
- Expandible: contexto, resultado
- Botón "Cancel" para running ones

**Página: Model Routes (`/routes`)**
- CRUD de task_type → model mappings
- Editar primary, fallback1, fallback2 para cada tipo de tarea

**Página: GitHub Mentions (`/mentions`)**
- CRUD de @mention → model mappings
- Lista de webhooks activos

**Sidebar: nuevo ítem "⚡ One-Shot"**

---

## 10. Comparación: Hermes Delegation vs Podman Containers

| Aspecto | Hermes Delegation (`hermes chat -q`) | Podman Containers (`podman run --rm`) |
|---------|---------------------------------------|---------------------------------------|
| **Startup time** | <1s | 3-5s |
| **Aislamiento** | Bajo (mismo process tree) | Alto (namespace completo) |
| **Resource limits** | No nativo (solo vía OS) | Sí (--memory, --cpus) |
| **Overhead** | Mínimo (un proceso más) | ~50-100MB RAM por container (base image) |
| **Tool access** | Todo lo que tenga el perfil Hermes | Solo lo que se monte/pase al container |
| **Network** | Misma red que el host | Aislada o host según flag |
| **Llama al LLM** | Usa el provider configurado en Hermes | Usa FreeLLMAPI endpoint directo |
| **Seguridad** | Menor (puede acceder a archivos del host) | Mayor (chroot filesystem) |
| **Complejidad de impl.** | Baja (wrapper de terminal) | Media (Containerfile, volúmenes, networking) |
| **Caso de uso ideal** | Review estándar, coding ligero | Deep analysis, @mention con modelos premium |

**Recomendación:** Empezar con Hermes Delegation (más rápido de implementar, suficiente para review y coding). Migrar análisis pesados a Podman cuando se necesite aislamiento.

---

## 11. Consideraciones de Seguridad

### 11.1 Keys Dinámicas vs Keys Humanas

| Tipo | created_by | Puede ser revocada automáticamente | Visible en dashboard |
|------|-----------|------------------------------------|---------------------|
| Humana | `'human'` | **NUNCA** (regla de Fase 0) | Sí, en sección principal |
| Sistema | `'system'` | **SÍ**, por el one-shot lifecycle | En subsección "One-Shot Keys" |

### 11.2 Rate Limiting

- El endpoint `/v1/chat/completions` tiene rate limiting por key
- El endpoint `/api/one-shot` tiene rate limiting por caller (`created_by`)
- Máximo N one-shots concurrentes (configurable, default 5)

### 11.3 GitHub Credentials

- El token de GitHub se almacena en variable de entorno (`GITHUB_TOKEN`), no en DB
- El webhook secret se guarda en `webhook_subscriptions.secret` (hash)
- Sólo el orquestador usa el token de GitHub (los one-shots no lo reciben)

### 11.4 Principio de Mínimo Privilegio

- El one-shot agent recibe solo el contexto necesario (diff, no todo el repo)
- No tiene acceso a la DB del Cardinal
- Su key dinámica solo le permite llamar `/v1/chat/completions` (no otros endpoints)
- La key expira automáticamente al completar o por TTL

---

## 12. Implementación por Capas

### Fase 2a — Core + Hermes Execution (Prioridad Alta)

1. Tablas nuevas + migraciones
2. `/v1/chat/completions` proxy a FreeLLMAPI (sin routing complejo aún)
3. `POST /api/one-shot` con ejecución vía Hermes delegation
4. Dynamic key factory (`created_by='system'`)
5. Auto-revoke al completar
6. Output a dashboard (guardar resultado en DB)
7. Anti-loop: `max_turns=1` hardcodeado en el prompt

### Fase 2b — GitHub Integration (Prioridad Media)

1. Webhook receiver para GitHub
2. Obtención de diff vía API GitHub
3. Posteo de review como comentario en PR
4. @mention parsing y mapping a modelo
5. Output channel `github_comment`

### Fase 2c — Podman Execution + Hardening (Prioridad Baja)

1. Containerfile para one-shot agents
2. `executor-podman.ts` — Podman run con resource limits
3. Watchdog timer con TTL
4. GC de one-shots expirados
5. Rate limiting

---

## 13. Éxito vs Hermes `delegate_task` Existente

### ¿Por qué no usar simplemente `delegate_task` de Hermes?

`delegate_task` es excelente para subagentes dentro de una sesión de Hermes, pero tiene limitaciones para el pipeline one-shot:

| Requisito | `delegate_task` | Cardinal One-Shot |
|-----------|----------------|-------------------|
| **Persistencia fuera de sesión** | ❌ Muere si el padre muere | ✅ Corre como proceso independiente |
| **Output a GitHub** | ❌ Solo devuelve texto al caller | ✅ Postea directamente al PR |
| **TTL y watchdog** | ❌ No tiene timeout externo | ✅ Watchdog con fuerza bruta |
| **Key dinámica revocable** | ❌ Usa la misma sesión de Hermes | ✅ Key aislada, auto-revocable |
| **Visibilidad en dashboard** | ❌ No hay registro | ✅ Historial completo en DB |
| **Aislamiento de recursos** | ❌ Comparte todo con el padre | ✅ Podman isolation opcional |
| **Trigger por webhook** | ❌ Solo invocación manual | ✅ GitHub webhook + @mention |

**Conclusión:** `delegate_task` es para subagentes dentro de una sesión activa de Hermes. Cardinal One-Shot es para agentes que trascienden sesiones, se disparan por eventos externos, y necesitan lifecycle management independiente. Son complementarios.

---

## 14. Diagrama de Secuencia Completo

### Escenario: Feature → PR → Review → @mention

```
Santi                          Shinon                  Cardinal                  GitHub
  │                              │                        │                        │
  │ "hacé esta feature"          │                        │                        │
  │─────────────────────────────>│                        │                        │
  │                              │                        │                        │
  │                              │ Spawn subagente coding │                        │
  │                              │───────────────────────>│                        │
  │                              │  POST /api/one-shot    │                        │
  │                              │  {task_type: "coding", │                        │
  │                              │   model: deepseek-v4-flash,                      │
  │                              │   max_turns: 10}       │                        │
  │                              │                        │                        │
  │                              │  <─ {id: "os_xxx", key}│                        │
  │                              │                        │                        │
  │                              │ Ejecuta coding agent   │                        │
  │                              │ (Hermes delegation)    │                        │
  │                              │────────────────────────>│                        │
  │                              │   git add + commit + push                         │
  │                              │──────────────────────────────────────────────────>│
  │                              │   gh pr create         │                        │
  │                              │──────────────────────────────────────────────────>│
  │                              │                        │                        │
  │                              │ "PR #42 created"       │                        │
  │                              │<───────────────────────│                        │
  │                              │                        │                        │
  │                              │ NOTA: Santi no lee el PR todavía                  │
  │                              │                        │                        │
  │                              │ Dispara review one-shot│                        │
  │                              │───────────────────────>│                        │
  │                              │  POST /api/one-shot    │                        │
  │                              │  {task_type: "review", │                        │
  │                              │   model: kimi-k2.6,    │                        │
  │                              │   max_turns: 1,        │                        │
  │                              │   output_channel:      │                        │
  │                              │     "github_comment",  │                        │
  │                              │   context: {pr_diff...}│                        │
  │                              │                        │                        │
  │                              │  <─ {id: "os_review42"}│                        │
  │                              │                        │                        │
  │                              │  Spawn review agent    │                        │
  │                              │  (Hermes delegation)   │                        │
  │                              │  max_turns=1           │                        │
  │                              │────────────────────────>│                        │
  │                              │                        │  Postea review como     │
  │                              │                        │  comentario en PR #42   │
  │                              │                        │────────────────────────>│
  │                              │                        │                        │
  │                              │  <─ completed          │                        │
  │                              │  Revoca key + cleanup  │                        │
  │                              │                        │                        │
  │ Santi: acá está el PR + el review                      │                        │
  │<─────────────────────────────│                        │                        │
  │                              │                        │                        │
  │ @cardinal-deep profundizá   │                        │                        │
  │ en este análisis             │                        │                        │
  │──────────────────────────────────────────────────────────────────────────────>│
  │                              │                        │                        │
  │                              │  Webhook detecta       │                        │
  │                              │  @cardinal-deep        │                        │
  │                              │───────────────────────>│                        │
  │                              │  Parse mention → model │                        │
  │                              │  Crea one-shot deep    │                        │
  │                              │  task_type:            │                        │
  │                              │    "deep_analysis"     │                        │
  │                              │  model: qwen3.7-max    │                        │
  │                              │  max_turns: 1          │                        │
  │                              │  output_channel:       │                        │
  │                              │    "github_comment"    │                        │
  │                              │                        │                        │
  │                              │  Podman container      │                        │
  │                              │  with resource limits  │                        │
  │                              │────────────────────────>│                        │
  │                              │                        │  Postea análisis como  │
  │                              │                        │  reply al comentario    │
  │                              │                        │────────────────────────>│
  │                              │                        │                        │
  │                              │  <─ completed          │                        │
  │                              │  Revoca key + cleanup  │                        │
  │                              │                        │                        │
```

---

## 15. Implementación Mínima Viable (MVP)

Para llegar a un pipeline funcional rápidamente, el orden de implementación es:

1. **Migración DB** — tablas `model_routes`, `one_shot_agents`, `github_mentions`, `webhook_subscriptions`
2. **`/v1/chat/completions`** — proxy a FreeLLMAPI con model routing básico
3. **`POST /api/one-shot`** — solo Hermes delegation (sin Podman)
4. **Dynamic key factory** — `created_by='system'` + auto-revoke
5. **Output channel `dashboard`** — guarda resultado en DB, disponible en REST
6. **Webhook GitHub** — `POST /api/webhooks/github` con parseo de @mention
7. **Output channel `github_comment`** — postea review al PR
8. **Watchdog + TTL** — seguridad anti-cuelgues
9. **Podman execution** — para deep analysis
10. **Frontend** — vistas de one-shot en dashboard

---

## Apéndice A: Prompt Template para Review Agent

```
Eres un Code Reviewer automático del ecosistema SAO.

INSTRUCCIONES:
- Tienes EXACTAMENTE UNA (1) oportunidad para hacer tu análisis.
- No hay iteraciones, no hay follow-ups, no hay loops.
- Haz tu análisis completo y estructurado AHORA.

TAREA: Revisa el siguiente Pull Request diff.

PR: #{pr_number} — {pr_title}
REPO: {repo}
DESCRIPCIÓN: {pr_description}

FILES CHANGED:
{changed_files}

DIFF:
{pr_diff}

FORMATO DE RESPUESTA (usar GitHub Markdown):
## Code Review: {pr_title}

### ✅ Resumen
[1-2 párrafos describiendo qué hace el PR y evaluación general]

### 🔴 Critical Issues
[Problemas que DEBEN corregirse antes de merge: bugs, seguridad, regresión]

### 🟡 Warnings
[Problemas importantes que deberían corregirse: code smells, perf, mantenibilidad]

### 🔵 Suggestions
[Mejoras opcionales: estilo, refactors menores, convenciones]

### 📊 Verdict
**APPROVED** | **CHANGES_REQUESTED** | **COMMENT**
[razón breve]
```

## Apéndice B: Configuración Inicial de Model Routes

```sql
INSERT INTO model_routes (task_type, primary_model, fallback1, fallback2, max_tokens, temperature) VALUES
('coding',       'deepseek-v4-flash', 'gpt-oss-120b', 'auto',          8192,  0.3),
('review',       'kimi-k2.6',        'deepseek-v4-pro', NULL,         4096,  0.5),
('deep_analysis','qwen3.7-max',      'kimi-k2.6',     'deepseek-v4-pro', 16384, 0.7),
('light',        'deepseek-v4-flash', 'auto',          NULL,          2048,  0.7);

INSERT INTO github_mentions (mention, model, task_type, description) VALUES
('@cardinal-review', 'kimi-k2.6',        'review',        'Code review mid-tier (modelo recomendado)'),
('@cardinal-deep',   'qwen3.7-max',      'deep_analysis', 'Análisis pesado con modelo premium'),
('@cardinal-coding', 'deepseek-v4-flash', 'coding',        'Coding ligero y scripting');
```

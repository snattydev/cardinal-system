# Cardinal System — FASE 2: One-Shot Agent Pipeline

> **Complete pipeline design: creation, execution, and destruction of one-shot agents**
> Date: 2026-07-23 · Status: design approved for implementation
> Based on the flow defined by the owner: Shinon → coding subagent → PR → one-shot review → @mention for heavy analysis

---

## 1. Overview

The **one-shot agent** pipeline transforms Cardinal from a passive system (FASE 0: only receives connections and serves state) to an **active orchestrator**: Cardinal creates, executes, and destroys agents with specific models for bounded tasks, **with no persistent state between invocations**.

### Desired flow (top to bottom)

```
Owner → "implement this feature"
  └─ Shinon (deepseek-v4-flash, default profile)
       └─ Local coding subagent (deepseek-v4-flash)
            ├─ Implements the feature
            ├─ git commit + push → GitHub PR
            └─ Notifies Cardinal: "PR #N ready for review"

Cardinal System
  ├─ Creates one-shot CODE REVIEW agent
  │    ├─ Model: kimi-k2.6 (mid-tier) or deepseek-v4-pro
  │    ├─ Context: PR diff + description
  │    ├─ max_turns = 1 → EXACTLY 1 review (NO loop)
  │    └─ Output: review posted as comment on the PR
  │
  ├─ Destroys the one-shot agent
  └─ Records result in DB

Owner reads the PR + the review
  └─ If more power is needed:
       └─ @mentions an agent on GitHub (e.g.: @cardinal-deep-review)
            └─ Cardinal detects @mention via webhook
                 ├─ Creates one-shot agent with premium model (qwen3.7-max)
                 ├─ Passes the full PR as context
                 ├─ max_turns = 1
                 └─ Result: comment on the PR or on dashboard
```

---

## 2. New Cardinal Endpoints and Capabilities

### 2.1 LLM Router Endpoint — `/v1/chat/completions`

**Purpose:** Replace FreeLLMAPI as the central model router. One-shot agents and existing SAO agents can consume LLM directly from Cardinal.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/v1/chat/completions` | API key `sk-cardinal-*` | OpenAI-compatible proxy/compat, model routing by task |

**New data model — table `model_routes`:**

```sql
CREATE TABLE model_routes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  task_type     TEXT NOT NULL UNIQUE,      -- 'coding', 'review', 'deep_analysis', 'light'
  primary_model TEXT NOT NULL,             -- e.g.: deepseek-v4-flash
  fallback1     TEXT,                      -- e.g.: gpt-oss-120b
  fallback2     TEXT,                      -- e.g.: kimi-k2.6
  max_tokens    INTEGER DEFAULT 4096,
  temperature   REAL DEFAULT 0.7,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Routing logic:**

```
POST /v1/chat/completions
  body: { model, messages, max_tokens?, temperature?, task_type? }

  1. If task_type is present → lookup model_routes[task_type] → primary → fallback
  2. If model is present → use directly (override)
  3. Router tries FreeLLMAPI first, then OpenCode Zen as fallback
  4. Response: OpenAI-compatible streaming or non-streaming
```

**Implementation as proxy:**

```typescript
// backend/src/router/index.ts
// NO direct LLM calls — delegates to FreeLLMAPI or OpenCode Zen
// Only handles routing + fallback + rate limiting

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

**Purpose:** Spawn a one-shot agent with specific parameters and get its result.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/one-shot` | API key `sk-cardinal-*` or human JWT | Create and execute a one-shot agent |
| `GET` | `/api/one-shot/:id` | API key or JWT | Get the result of a one-shot |

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

**Purpose:** Receive GitHub events (PR opened, PR commented, @mention).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/webhooks/github` | Shared secret | GitHub events |

---

## 3. One-Shot Agent Lifecycle

The central data model for one-shot agents:

```sql
CREATE TABLE one_shot_agents (
  id              TEXT PRIMARY KEY,            -- e.g.: os_a1b2c3d4 (prefix 'os_')
  name            TEXT NOT NULL,               -- descriptive name: "review-pr-42"
  task_type       TEXT NOT NULL,               -- 'coding', 'review', 'deep_analysis'
  model           TEXT NOT NULL,               -- assigned model
  status          TEXT NOT NULL DEFAULT 'created',
                  -- 'created' → 'spawning' → 'running' → 'completed' | 'failed' | 'timed_out'
  context         TEXT NOT NULL,               -- JSON: prompt, PR diff, instructions
  result          TEXT,                        -- JSON: review output, analysis
  key_hash        TEXT,                        -- hash of the dynamic key (sk-cardinal-os_*)
  key_revoked_at  TEXT,                        -- when the key was revoked
  podman_id       TEXT,                        -- container ID if Podman was used
  pid             INTEGER,                     -- process ID if terminal was used
  ttl_seconds     INTEGER NOT NULL DEFAULT 300,-- maximum lifetime
  expires_at      TEXT NOT NULL,               -- ttl_seconds from created_at
  max_turns       INTEGER NOT NULL DEFAULT 1,  -- anti-loop: default 1
  output_channel  TEXT,                        -- 'github_comment', 'dashboard', 'webhook'
  created_by      TEXT NOT NULL,               -- 'shinon', 'system', 'github_webhook'
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at    TEXT
);
```

### Lifecycle Phases

```
PHASE 1: CREATION
  Cardinal receives POST /api/one-shot or detects a trigger
  ├─ Validates parameters (model exists, task_type valid)
  ├─ Generates unique ID (os_$random)
  ├─ Generates dynamic key: sk-cardinal-os_$id (created_by='system')
  ├─ Saves row in one_shot_agents (status='created')
  └─ Responds with ID + key

PHASE 2: SPAWNING (2 strategies, see §5)
  ├─ Option A (light): `hermes chat -q "prompt..."` via terminal
  │   └─ Ephemeral process with timeout = ttl_seconds
  ├─ Option B (heavy): `podman run --rm` container
  │   └─ Podman exec with resource limits + temporary mount
  ├─ Updates status → 'spawning'
  └─ Starts watchdog timer (ttl_seconds)

PHASE 3: EXECUTION
  ├─ Agent receives context + dynamic key
  ├─ Agent can call Cardinal /v1/chat/completions if LLM is needed
  ├─ max_turns prevents loops
  └─ Watchdog: if expires_at is reached → kill + status='timed_out'

PHASE 4: RESULT
  ├─ Agent completes its task
  ├─ Posts output according to output_channel
  │   ├─ github_comment → GitHub API: POST /repos/:owner/:repo/issues/:n/comments
  │   ├─ dashboard → available at GET /api/one-shot/:id
  │   └─ webhook → POST to configured URL
  ├─ Saves result in one_shot_agents
  ├─ Revokes the dynamic key (key_revoked_at)
  └─ Status → 'completed'

PHASE 5: CLEANUP
  ├─ If Podman was used: podman rm (already --rm, but force if not)
  ├─ Revoke key (DIFFERENT from revoking human keys — system keys self-revoke)
  ├─ If expired without completing: status='timed_out'
  └─ Periodic GC: deletes old rows > 7d
```

### Anti-loop: `max_turns = 1`

**The FUNDAMENTAL rule** (required by the owner):

> The one-shot review agent performs **EXACTLY 1 review** and delivers the result. No infinite loop.

Implementation:
- `one_shot_agents.max_turns` default = 1
- In the agent execution, the prompt includes "You have exactly ONE pass to analyze this. Do your complete analysis now. No follow-ups, no iterations."
- If `hermes chat -q` is used, the `--max-turns 1` flag (or equivalent per agent tool)
- If a Hermes subagent is used, `delegate_task` with iteration limits
- The watchdog timer guarantees that even if the agent tries to loop, the timeout kills it

---

## 4. GitHub PR Integration

### 4.1 Auto-Review Post-PR

**Trigger:** Shinon (or coding subagent) creates a PR on GitHub.

**Flow:**

```
1. Coding subagent completes feature, does git push, creates PR:
   gh pr create --title "feat: JWT refresh rotation" --body "..."

2. PR created → subagent notifies Cardinal:
   POST /api/one-shot {
     name: "review-pr-42",
     task_type: "review",
     model: "kimi-k2.6",
     context: {
       pr_url: "https://github.com/owner/repo/pull/42",
       pr_diff: "<get diff via gh pr diff 42 or GitHub API>",
       pr_description: "Adds JWT refresh token rotation"
     },
     max_turns: 1,
     output_channel: "github_comment"
   }

3. Cardinal spawns one-shot review agent (see §5)

4. Review agent receives the diff + description, analyzes, produces review

5. Review agent posts result as a comment on the PR:
   gh pr review 42 --comment --body "## Code Review\n\n### Critical\n...\n### Warnings\n..." 

6. Cardinal records result, revokes key, cleanup
```

### 4.2 @Mention on GitHub — Deep Analysis

**Trigger:** Someone @mentions a known agent in a GitHub comment.

**@mention format:**

```
@cardinal-review        → mid-tier model (kimi-k2.6)
@cardinal-deep          → premium model (qwen3.7-max)
@cardinal-coding        → light coding (deepseek-v4-flash)
```

**Flow:**

```
1. GitHub sends webhook to Cardinal:
   POST /api/webhooks/github
   Event: issue_comment (PR comment)
   Body: { action: "created", issue: { number: 42 }, comment: { body: "@cardinal-deep can you review the auth refactor?" } }

2. Cardinal processes the webhook:
   a. Verifies webhook secret
   b. Parses the comment body looking for @mentions
   c. Extracts the model based on the mapping:
      - @cardinal-review → kimi-k2.6
      - @cardinal-deep → qwen3.7-max (or qwen3.7-plus)
   d. Gets the PR diff via GitHub API

3. Cardinal creates one-shot:
   POST /api/one-shot (auto-generated internally)
   name: "deep-review-pr-42-@owner"
   task_type: "deep_analysis"
   model: "qwen3.7-max"
   output_channel: "github_comment"
   max_turns: 1

4. Spawn, execute, post result as reply to the comment

5. Cardinal records, cleanup
```

**Data model — table `github_mentions`:**

```sql
CREATE TABLE github_mentions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  mention         TEXT NOT NULL UNIQUE,    -- '@cardinal-deep'
  model           TEXT NOT NULL,           -- 'qwen3.7-max'
  task_type       TEXT NOT NULL DEFAULT 'deep_analysis',
  description     TEXT,                    -- 'Heavy analysis with premium model'
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 4.3 How Cardinal Gets the PR Diff

Two complementary strategies:

**Strategy A — gh CLI (recommended for the VPS where Cardinal runs):**

```bash
gh pr diff 42 --repo owner/repo
```

**Strategy B — GitHub API (fallback, works without gh CLI):**

```bash
curl -s -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/owner/repo/pulls/42
# Gets diff_url → fetches it
```

**Implementation in Cardinal:**

The PR context is collected before spawning the one-shot and passed as part of the `context` — the one-shot does NOT need to call GitHub. This ensures the one-shot has everything it needs from the start.

```
context: {
  pr_url: "...",
  pr_diff: "<full diff>",
  pr_description: "...",
  pr_title: "...",
  changed_files: ["src/auth.ts", "src/lib/jwt.ts"],
  repo: "owner/repo",
  pr_number: 42
}
```

### 4.4 Model Selection by Task

Each task_type has a configurable default model in `model_routes`:

| task_type | Primary model | Fallback | Use |
|-----------|----------------|----------|-----|
| `coding` | deepseek-v4-flash | gpt-oss-120b | Features, bug fixes, scripting |
| `review` | kimi-k2.6 | deepseek-v4-pro | Mid-tier code review (default) |
| `deep_analysis` | qwen3.7-max | kimi-k2.6 → deepseek-v4-pro | Heavy analysis (@mention) |
| `light` | deepseek-v4-flash | auto | Quick queries, one-liners |

The @mention mapping allows direct model override, giving the user full control over which model is used.

---

## 5. Execution Strategies

### 5.1 Option A: Hermes Delegation (Light — Recommended for Review)

Uses `hermes chat -q` via terminal with a specific profile.

**How it works:**

```bash
# Cardinal generates a dynamic key
CARDINAL_KEY=$(bun run keygen -- --agent "review-pr-42" --kind subagent --quiet)

# Executes a Hermes subagent that has access to the model and context
echo "You are a code reviewer. Analyze this PR diff:
<diff>
...
</diff>

Produce a structured review with:
- Critical Issues (must fix)
- Warnings (should fix)
- Suggestions (optional)

MAX_TURNS=1 — Do not iterate. Do your complete analysis NOW." | \
hermes chat -q "$(cat)" -t file -p review-profile --model kimi-k2.6 --max-turns 1

# Revoke the key
bun run keygen -- --revoke "review-pr-42"
```

**Advantages:**
- No container overhead
- Uses existing Hermes profile (skills, tools, configuration)
- Extremely fast to spawn
- Easy to limit to 1 turn

**Disadvantages:**
- Limited isolation (same host process)
- Shares Hermes system resources
- Does not scale well to very heavy models

### 5.2 Option B: Podman Container (Heavy — Recommended for Deep Analysis)

Uses `podman run --rm` with an ephemeral container.

**Containerfile for one-shot agents:**

```dockerfile
FROM oven/bun:latest
WORKDIR /agent
COPY agent.ts .
CMD ["bun", "run", "agent.ts"]
```

**How it works:**

```bash
# Cardinal generates dynamic key
KEY=$(bun run keygen -- --agent "deep-review-pr-42" --kind subagent --quiet)

# Spawns one-shot container
podman run --rm \
  --name "cardinal-os-deep-review-pr-42" \
  -e CARDINAL_KEY="$KEY" \
  -e CARDINAL_URL="ws://host.containers.internal:8787/ws" \
  -e LLM_API_URL="http://host.containers.internal:3001/v1" \
  -e LLM_MODEL="qwen3.7-max" \
  -e TASK_CONTEXT="<PR context>" \
  --memory=4g --cpus=2 \
  --network=host \
  --timeout=300 \
  cardinal-one-shot:latest

# Revoke key (podman --rm cleans it up automatically)
bun run keygen -- --revoke "deep-review-pr-42"
```

**Advantages:**
- Full isolation (filesystem, processes, network)
- Explicit resource limits (CPU, memory)
- Does not contaminate the main Hermes system
- Appropriate for heavy models

**Disadvantages:**
- Startup overhead (3-5 seconds to pull the container)
- Higher resource consumption
- More implementation complexity

### 5.3 Recommended Strategy: Hybrid

| Task weight | Strategy | Model | Example |
|--------------|-----------|--------|---------|
| Standard review | Hermes delegation | kimi-k2.6 | Code review post-PR |
| Heavy @mention analysis | Podman container | qwen3.7-max | Deep analysis per @mention |
| Coding quick-fix | Hermes delegation | deepseek-v4-flash | Shinon subagent |

**Decision rule in Cardinal:**

```typescript
function selectExecutionStrategy(task_type: string, model: string): 'hermes' | 'podman' {
  const HEAVY_MODELS = ['qwen3.7-max', 'qwen3.7-plus', 'deepseek-v4-pro'];
  if (HEAVY_MODELS.includes(model)) return 'podman';
  if (task_type === 'deep_analysis') return 'podman';
  return 'hermes';
}
```

---

## 6. Orchestrator Architecture

### 6.1 New Modules in Cardinal

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
│   ├── executor-hermes.ts    # Executor via Hermes terminal
│   ├── executor-podman.ts    # Executor via Podman container
│   ├── watchdog.ts           # TTL watchdog timer
│   └── oneshot.test.ts
│
├── webhooks/
│   ├── index.ts              # Webhook receiver (GitHub, etc.)
│   ├── github.ts             # GitHub webhook parser + @mention detector
│   └── webhook.test.ts
│
├── db/
│   ├── repos.ts              # + functions for one_shot_agents, model_routes, github_mentions
│   └── index.ts              # + migrations for new tables
│
└── api/
    ├── one-shot.ts           # REST handlers for one-shot management (list, get, cancel)
    └── webhooks.ts           # Webhook handlers
```

### 6.2 Internal Orchestrator Flow

```
POST /api/one-shot
  │
  ▼
oneshot/index.ts: handleCreateOneShot()
  ├─ ValidateTaskType(task_type) → look up model_routes
  ├─ DetermineModel(task_type, model_override) → model_routes.primary_model
  ├─ SelectStrategy(task_type, model) → 'hermes' | 'podman'
  ├─ GenerateID() → "os_a1b2c3d4"
  ├─ CreateDynamicKey(agent_name) → keyHash, saved in agent_keys (created_by='system')
  ├─ InsertDB({ id, name, task_type, model, status='created', ... })
  └─ Response: { id, status, agent_name, model, key }
  │
  ▼  (background: does not block the caller)
  
oneshot/orquestador.ts: spawnOneShot(id)
  ├─ UPDATE status → 'spawning'
  ├─ PrepareContext(db, id)
  │   └─ If output_channel === 'github_comment': build prompt with diff + instructions
  │
  ├─ IF strategy === 'hermes':
  │   └─ executor-hermes.ts: runHermesOneShot(id, context, model, max_turns)
  │       ├─ Build prompt with instructions + context
  │       ├─ terminal("hermes chat -q '<prompt>' --model <model> --max-turns <max_turns>",
  │       │           background=true, timeout=ttl_seconds, notify_on_complete=true)
  │       └─ Save PID in DB
  │
  ├─ IF strategy === 'podman':
  │   └─ executor-podman.ts: runPodmanOneShot(id, context, model, max_turns)
  │       ├─ Build temporary prompt file
  │       ├─ podman run --rm ... (with resource limits)
  │       └─ Save podman_id in DB
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
  ├─ Kill process: process.kill(pid, 'SIGKILL') or podman kill <container>
  ├─ UPDATE status='timed_out', result={ error: 'timeout' }
  ├─ RevokeDynamicKey(id)
  └─ Log event

oneshot/orquestador.ts: cleanupStale()
  ── Internal cron every 5 minutes:
     ├─ Finds one_shot_agents WHERE status='running' AND expires_at < now()
     └─ For each: onOneShotTimeout(id)
```

### 6.3 Dynamic Key Factory

**Key rule:** Keys with `created_by='system'` are auto-revocable by Cardinal. Keys with `created_by='human'` are NEVER touched automatically (FASE 0 rule).

```typescript
// oneshot/orquestador.ts
function createDynamicKey(agentName: string): string {
  const key = generateKey();
  createAgentKey(db, {
    keyHash: hashKey(key),
    agentName: agentName,
    kindOverride: 'subagent',  // One-shots are always subagents
    createdBy: 'system',       // ← key: the system can revoke them
  });
  return key;  // Returned ONCE, printed in the response
}

function revokeDynamicKey(osId: string): void {
  const os = getOneShot(db, osId);
  if (!os || !os.key_hash) return;
  // Only revoke 'system' keys, never 'human'
  db.run("UPDATE agent_keys SET revoked_at = datetime('now') WHERE key_hash = ? AND created_by = 'system'", [os.key_hash]);
}
```

---

## 7. New SQLite Tables

```sql
-- Migration for FASE 2

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
  result          TEXT,                            -- JSON (nullable until complete)
  key_hash        TEXT,                            -- hash of the dynamic key
  key_revoked_at  TEXT,
  podman_id       TEXT,
  pid             INTEGER,
  ttl_seconds     INTEGER NOT NULL DEFAULT 300,
  expires_at      TEXT NOT NULL,
  max_turns       INTEGER NOT NULL DEFAULT 1,
  output_channel  TEXT,                            -- 'github_comment', 'dashboard', 'webhook', NULL
  output_url      TEXT,                            -- target URL (e.g.: PR comment URL)
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
  secret          TEXT NOT NULL,                   -- shared secret for verification
  config          TEXT NOT NULL DEFAULT '{}',      -- JSON: repo filter, etc.
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source, event_type)
);

-- Indexes
CREATE INDEX idx_one_shot_status ON one_shot_agents(status);
CREATE INDEX idx_one_shot_expires ON one_shot_agents(expires_at);
CREATE INDEX idx_one_shot_created ON one_shot_agents(created_by);
CREATE INDEX idx_agent_keys_created_by ON agent_keys(created_by);
```

---

## 8. New REST Endpoints

### 8.1 Public Endpoints (no auth required)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/webhooks/github` | GitHub webhook (uses shared secret) |

### 8.2 Protected Endpoints (require JWT or API key)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/chat/completions` | LLM proxy with model routing |
| `POST` | `/api/one-shot` | Create new one-shot agent |
| `GET` | `/api/one-shot` | List one-shots (filter by status, task_type) |
| `GET` | `/api/one-shot/:id` | Detail + result of a one-shot |
| `POST` | `/api/one-shot/:id/cancel` | Cancel a running one-shot |
| `GET` | `/api/routes` | List configured model routes |
| `POST` | `/api/routes` | Create/update model route |
| `GET` | `/api/mentions` | List @mention mappings |
| `POST` | `/api/mentions` | Create @mention mapping |

### 8.3 New WS Messages

The WS protocol is extended to report one-shot agent state:

```
# Dashboard receives one-shot agent updates
cardinal → { type: "one_shot_update", os: { id, name, status, task_type, created_at } }

# Dashboard when a one-shot completes
cardinal → { type: "one_shot_complete", os: { id, name, status: "completed", result_summary: "..." } }
```

---

## 9. Dashboard SAO Integration

### New Views in the Frontend

**Page: One-Shot Agents (`/one-shot`)**
- Table of one-shot agents (recent, filterable by status)
- Each row: name, model, task_type, status, elapsed time, created by
- Expandable: context, result
- "Cancel" button for running ones

**Page: Model Routes (`/routes`)**
- CRUD for task_type → model mappings
- Edit primary, fallback1, fallback2 for each task type

**Page: GitHub Mentions (`/mentions`)**
- CRUD for @mention → model mappings
- List of active webhooks

**Sidebar: new item "One-Shot"**

---

## 10. Comparison: Hermes Delegation vs Podman Containers

| Aspect | Hermes Delegation (`hermes chat -q`) | Podman Containers (`podman run --rm`) |
|---------|---------------------------------------|---------------------------------------|
| **Startup time** | <1s | 3-5s |
| **Isolation** | Low (same process tree) | High (full namespace) |
| **Resource limits** | Not native (OS only) | Yes (--memory, --cpus) |
| **Overhead** | Minimal (one more process) | ~50-100MB RAM per container (base image) |
| **Tool access** | Everything the Hermes profile has | Only what is mounted/passed to the container |
| **Network** | Same as host | Isolated or host per flag |
| **LLM calls** | Uses the provider configured in Hermes | Uses FreeLLMAPI endpoint directly |
| **Security** | Lower (can access host files) | Higher (chroot filesystem) |
| **Implementation complexity** | Low (terminal wrapper) | Medium (Containerfile, volumes, networking) |
| **Ideal use case** | Standard review, light coding | Deep analysis, @mention with premium models |

**Recommendation:** Start with Hermes Delegation (faster to implement, sufficient for review and coding). Migrate heavy analysis to Podman when isolation is needed.

---

## 11. Security Considerations

### 11.1 Dynamic Keys vs Human Keys

| Type | created_by | Can be auto-revoked | Visible in dashboard |
|------|-----------|------------------------------------|---------------------|
| Human | `'human'` | **NEVER** (FASE 0 rule) | Yes, in main section |
| System | `'system'` | **YES**, by the one-shot lifecycle | In "One-Shot Keys" subsection |

### 11.2 Rate Limiting

- The `/v1/chat/completions` endpoint has rate limiting per key
- The `/api/one-shot` endpoint has rate limiting per caller (`created_by`)
- Maximum N concurrent one-shots (configurable, default 5)

### 11.3 GitHub Credentials

- The GitHub token is stored in an environment variable (`GITHUB_TOKEN`), not in DB
- The webhook secret is saved in `webhook_subscriptions.secret` (hash)
- Only the orchestrator uses the GitHub token (one-shots do not receive it)

### 11.4 Principle of Least Privilege

- The one-shot agent receives only the necessary context (diff, not the full repo)
- It has no access to Cardinal's DB
- Its dynamic key only allows calling `/v1/chat/completions` (not other endpoints)
- The key expires automatically upon completion or by TTL

---

## 12. Layered Implementation

### FASE 2a — Core + Hermes Execution (High Priority)

1. New tables + migrations
2. `/v1/chat/completions` proxy to FreeLLMAPI (without complex routing yet)
3. `POST /api/one-shot` with Hermes delegation execution
4. Dynamic key factory (`created_by='system'`)
5. Auto-revoke on completion
6. Output to dashboard (save result in DB)
7. Anti-loop: `max_turns=1` hardcoded in the prompt

### FASE 2b — GitHub Integration (Medium Priority)

1. Webhook receiver for GitHub
2. Diff retrieval via GitHub API
3. Post review as PR comment
4. @mention parsing and model mapping
5. Output channel `github_comment`

### FASE 2c — Podman Execution + Hardening (Low Priority)

1. Containerfile for one-shot agents
2. `executor-podman.ts` — Podman run with resource limits
3. Watchdog timer with TTL
4. GC of expired one-shots
5. Rate limiting

---

## 13. This vs Existing Hermes `delegate_task`

### Why not simply use Hermes `delegate_task`?

`delegate_task` is excellent for subagents within a Hermes session, but has limitations for the one-shot pipeline:

| Requirement | `delegate_task` | Cardinal One-Shot |
|-----------|----------------|-------------------|
| **Persistence outside session** | No — dies if parent dies | Yes — runs as independent process |
| **Output to GitHub** | No — only returns text to caller | Yes — posts directly to PR |
| **TTL and watchdog** | No external timeout | Yes — watchdog with brute force |
| **Revocable dynamic key** | No — uses same Hermes session | Yes — isolated key, auto-revocable |
| **Visibility in dashboard** | No record | Yes — full history in DB |
| **Resource isolation** | No — shares everything with parent | Yes — optional Podman isolation |
| **Trigger by webhook** | No — manual invocation only | Yes — GitHub webhook + @mention |

**Conclusion:** `delegate_task` is for subagents within an active Hermes session. Cardinal One-Shot is for agents that transcend sessions, are triggered by external events, and need independent lifecycle management. They are complementary.

---

## 14. Complete Sequence Diagram

### Scenario: Feature → PR → Review → @mention

```
Owner                          Shinon                  Cardinal                  GitHub
  │                              │                        │                        │
  │ "implement this feature"     │                        │                        │
  │─────────────────────────────>│                        │                        │
  │                              │                        │                        │
  │                              │ Spawn coding subagent  │                        │
  │                              │───────────────────────>│                        │
  │                              │  POST /api/one-shot    │                        │
  │                              │  {task_type: "coding", │                        │
  │                              │   model: deepseek-v4-flash,                      │
  │                              │   max_turns: 10}       │                        │
  │                              │                        │                        │
  │                              │  <─ {id: "os_xxx", key}│                        │
  │                              │                        │                        │
  │                              │ Run coding agent       │                        │
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
  │                              │ NOTE: Owner has not read the PR yet               │
  │                              │                        │                        │
  │                              │ Trigger review one-shot│                        │
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
  │                              │                        │  Post review as         │
  │                              │                        │  comment on PR #42      │
  │                              │                        │────────────────────────>│
  │                              │                        │                        │
  │                              │  <─ completed          │                        │
  │                              │  Revoke key + cleanup  │                        │
  │                              │                        │                        │
  │ Owner: here is the PR + review                         │                        │
  │<─────────────────────────────│                        │                        │
  │                              │                        │                        │
  │ @cardinal-deep deepen        │                        │                        │
  │ this analysis                │                        │                        │
  │──────────────────────────────────────────────────────────────────────────────>│
  │                              │                        │                        │
  │                              │  Webhook detects       │                        │
  │                              │  @cardinal-deep        │                        │
  │                              │───────────────────────>│                        │
  │                              │  Parse mention → model │                        │
  │                              │  Create deep one-shot  │                        │
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
  │                              │                        │  Post analysis as      │
  │                              │                        │  reply to comment       │
  │                              │                        │────────────────────────>│
  │                              │                        │                        │
  │                              │  <─ completed          │                        │
  │                              │  Revoke key + cleanup  │                        │
  │                              │                        │                        │
```

---

## 15. Minimum Viable Implementation (MVP)

To reach a functional pipeline quickly, the implementation order is:

1. **DB migration** — tables `model_routes`, `one_shot_agents`, `github_mentions`, `webhook_subscriptions`
2. **`/v1/chat/completions`** — proxy to FreeLLMAPI with basic model routing
3. **`POST /api/one-shot`** — Hermes delegation only (no Podman)
4. **Dynamic key factory** — `created_by='system'` + auto-revoke
5. **Output channel `dashboard`** — saves result in DB, available in REST
6. **GitHub webhook** — `POST /api/webhooks/github` with @mention parsing
7. **Output channel `github_comment`** — posts review to the PR
8. **Watchdog + TTL** — anti-hang safety
9. **Podman execution** — for deep analysis
10. **Frontend** — one-shot views in dashboard

---

## Appendix A: Prompt Template for Review Agent

```
You are an automated Code Reviewer for the SAO ecosystem.

INSTRUCTIONS:
- You have EXACTLY ONE (1) opportunity to do your analysis.
- No iterations, no follow-ups, no loops.
- Do your complete and structured analysis NOW.

TASK: Review the following Pull Request diff.

PR: #{pr_number} — {pr_title}
REPO: {repo}
DESCRIPTION: {pr_description}

FILES CHANGED:
{changed_files}

DIFF:
{pr_diff}

RESPONSE FORMAT (use GitHub Markdown):
## Code Review: {pr_title}

### Summary
[1-2 paragraphs describing what the PR does and overall assessment]

### Critical Issues
[Issues that MUST be fixed before merge: bugs, security, regression]

### Warnings
[Important issues that should be fixed: code smells, perf, maintainability]

### Suggestions
[Optional improvements: style, minor refactors, conventions]

### Verdict
**APPROVED** | **CHANGES_REQUESTED** | **COMMENT**
[brief reason]
```

## Appendix B: Initial Model Routes Configuration

```sql
INSERT INTO model_routes (task_type, primary_model, fallback1, fallback2, max_tokens, temperature) VALUES
('coding',       'deepseek-v4-flash', 'gpt-oss-120b', 'auto',          8192,  0.3),
('review',       'kimi-k2.6',        'deepseek-v4-pro', NULL,         4096,  0.5),
('deep_analysis','qwen3.7-max',      'kimi-k2.6',     'deepseek-v4-pro', 16384, 0.7),
('light',        'deepseek-v4-flash', 'auto',          NULL,          2048,  0.7);

INSERT INTO github_mentions (mention, model, task_type, description) VALUES
('@cardinal-review', 'kimi-k2.6',        'review',        'Mid-tier code review (recommended model)'),
('@cardinal-deep',   'qwen3.7-max',      'deep_analysis', 'Heavy analysis with premium model'),
('@cardinal-coding', 'deepseek-v4-flash', 'coding',        'Light coding and scripting');
```

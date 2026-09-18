# Cardinal System — Central Context Store: Design and Roadmap

> **Date:** 2026-07-23 · **Version:** v0.1.0-draft
> **Context:** Post-FASE 0 design. Cardinal already has a living skeleton (WS Hub, API keys, dashboard). It now becomes the **central Context Store** of the SAO ecosystem.
> **User Vision:** "The cardinal system stores context for everything, and any agents I create across devices consume from it and perform their onboarding."

---

## 1. Current State (Before the Change)

```
┌─────────────────────────────────────────────────────────┐
│                     ECOSYSTEM TODAY                     │
│                                                         │
│  Each Hermes profile is an ISLAND                       │
│                                                         │
│  Owner's PC                                             │
│  ├── Shinon (default)                                   │
│  │   ├── state.db (sessions, messages)                  │
│  │   ├── memories/MEMORY.md, USER.md                    │
│  │   └── skills/ (~50 skills)                           │
│  ├── Asuna (asuna)                                      │
│  │   ├── state.db (own sessions)                        │
│  │   ├── memories/ (Asuna's memory)                     │
│  │   └── profile/config.yaml                            │
│  └── Eugeo (eugeo)                                      │
│       ├── state.db                                      │
│       ├── memories/                                     │
│       └── profile/config.yaml + Telegram gateway        │
│                                                         │
│  Cardinal FASE 0 (out of the loop)                      │
│  └── WS Hub + Dashboard + API keys                      │
│      (only sees connectivity — NOT context)             │
│                                                         │
│  Vault RAG (separate)                                   │
│  └── vault-query CLI → sqlite-vec + FTS5                │
│      (only accessible from local profile terminal)      │
│                                                         │
│  Laptop, Mobile: DO NOT EXIST on the map                │
└─────────────────────────────────────────────────────────┘
```

**Problems:**
- Each Hermes profile reinvents its context — there is no shared source of truth
- A new agent does not know who it is, what skills it has, or how to behave
- Agent A's memory is not visible to Agent B
- Vault RAG is only accessible from the local PC
- No onboarding: if you create an agent on the laptop tomorrow, it starts from scratch

---

## 2. Vision: Cardinal as Central Context Store

```
┌─────────────────────────────────────────────────────────────┐
│                       CARDINAL SYSTEM                       │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  CONTEXT STORE (ecosystem source of truth)          │    │
│  │                                                     │    │
│  │  Profile Registry       → which agents exist        │    │
│  │  SOUL Registry          → personality of each       │    │
│  │  Skill Catalog          → skills for each agent     │    │
│  │  Memory Mirror          → MEMORY.md/USER.md         │    │
│  │  Session Index          → session history           │    │
│  │  Vault RAG Proxy        → semantic search           │    │
│  │  Config Templates       → config.yaml per profile   │    │
│  │  Device Registry        → what runs where           │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐    │
│  │  AGENT   │  │  AGENT   │  │  AGENT   │  │   HUMAN   │    │
│  │  Shinon  │  │  Asuna   │  │  Eugeo   │  │   (Me)    │    │
│  │   (PC)   │  │   (PC)   │  │   (PC)   │  │ Dashboard │    │
│  └──────────┘  └──────────┘  └──────────┘  └───────────┘    │
│         ▲            ▲            ▲              ▲          │
│         └────────────┴────────────┴──────────────┘          │
│                   WebSocket + REST API                      │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │  AGENT   │  │  AGENT   │  │  AGENT   │                   │
│  │  Kirito  │  │ Lisbeth  │  │  Klein   │                   │
│  │ (Laptop) │  │ (Laptop) │  │ (Mobile) │                   │
│  └──────────┘  └──────────┘  └──────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. What the Context Store Stores

### 3.1 Profile Registry (`profiles`)

Master registry of all Hermes profiles existing across the ecosystem.

| Field | Type | Description |
|-------|------|-------------|
| `name` | TEXT PK | Profile name (shinon, asuna, eugeo, kirito...) |
| `display_name` | TEXT | Human-readable name ("Shinon") |
| `emoji` | TEXT | Profile icon/emoji identifier (bow, flower, sword, wrench, etc.) |
| `kind` | TEXT | `permanent` or `one-shot` |
| `status` | TEXT | `active`, `dormant`, `liberated` |
| `model_default` | TEXT | Default model |
| `provider_default` | TEXT | Default provider |
| `device` | TEXT | Current physical host |
| `last_onboarded` | TEXT | Timestamp of last onboarding |
| `created_at` / `updated_at` | TEXT | Timestamps |

### 3.2 SOUL Registry (`souls`)

The personality of each agent — its centralized SOUL.md.

| Field | Type | Description |
|-------|------|-------------|
| `profile_name` | TEXT PK → profiles(name) | Target profile |
| `soul_md` | TEXT | Full SOUL.md content |
| `personality_tags` | TEXT | Tags for search (voseo, argentine, study, etc.) |
| `tool_restrictions` | TEXT | JSON with allowed/disallowed tools |
| `canon_ref` | TEXT | URL to Fandom wiki canon (if applicable) |
| `version` | INTEGER | Change tracking version |
| `updated_at` | TEXT | Timestamp of last update |

**Source of truth:** Cardinal. Agents synchronize their local SOUL.md from here.

### 3.3 Skill Catalog (`skills_catalog`)

Catalog of available skills and which profile has each one.

Two tables:

**`skills`** — master catalog:
| Field | Type | Description |
|-------|------|-------------|
| `name` | TEXT PK | Skill name |
| `description` | TEXT | Purpose and utility |
| `category` | TEXT | autonomous-ai-agents, devops, mlops, etc. |
| `content_hash` | TEXT | SHA-256 of current SKILL.md |
| `path` | TEXT | Canonical path in ecosystem |
| `required_toolsets` | TEXT | JSON array: terminal, web, browser... |
| `updated_at` | TEXT | Timestamp of last update |

**`profile_skills`** — skills mapped to each profile:
| Field | Type | Description |
|-------|------|-------------|
| `profile_name` | TEXT PK → profiles(name) | Target profile |
| `skill_name` | TEXT PK → skills(name) | Target skill |
| `pinned` | INTEGER | 0/1 — whether skill is pinned |
| `added_at` | TEXT | Timestamp when added |

### 3.4 Memory Mirror (`memory_mirror`)

Mirror of the Hermes memory (MEMORY.md + USER.md) for each profile.

| Field | Type | Description |
|-------|------|-------------|
| `profile_name` | TEXT PK → profiles(name) | Target profile |
| `target` | TEXT | `memory` (MEMORY.md) or `user` (USER.md) |
| `content` | TEXT | Full content |
| `char_count` | INTEGER | Character count for budget tracking |
| `content_hash` | TEXT | Hash for change detection |
| `last_synced` | TEXT | Timestamp of last synchronization |
| `sync_direction` | TEXT | `local_primary`, `cardinal_primary`, `bidirectional` |

**Default synchronization strategy:** `local_primary` — the local agent writes first to its local MEMORY.md, and Cardinal receives the mirror in the background. `cardinal_primary` is used when the agent onboards from scratch. `bidirectional` resolves conflicts via last-write-wins.

### 3.5 Session Index (`sessions_index`)

Lightweight index of each agent's sessions — NOT full messages, only metadata.

| Field | Type | Description |
|-------|------|-------------|
| `id` | TEXT | Same session_id as in Hermes state.db |
| `profile_name` | TEXT → profiles(name) | Target profile |
| `title` | TEXT | Session title |
| `model` | TEXT | Model used |
| `started_at` | REAL | Start timestamp |
| `message_count` | INTEGER | Message count |
| `input_tokens` | INTEGER | Input tokens |
| `output_tokens` | INTEGER | Output tokens |
| `estimated_cost` | REAL | Estimated cost in USD |

**Why not store full messages here?** Because the local Hermes state.db already stores them with FTS5. Cardinal may have an optional `messages_archive` compressing older sessions — but it does not replace the local store. The active session always lives locally within the Hermes profile.

### 3.6 Vault RAG Proxy

Does NOT replicate the vector store — Cardinal becomes a **proxy cache** for RAG queries.

Two modes:
1. **Cache mode (default):** Cardinal maintains its own FTS5 DB with vault chunks, indexed incrementally. Agents query Cardinal, which responds with matching chunks.
2. **Passthrough mode (during FASE 1):** Cardinal receives the query, forwards it to the local `vault-query` (wherever the vault is hosted), and caches the result.

Cardinal does NOT run a heavy vector store during FASE 1. It consumes the existing `vault-query` CLI. In FASE 2+, it may run its own vector DB if the vault becomes network-accessible (NFS, Syncthing, or PSI).

### 3.7 Device Registry (`devices`)

| Field | Type | Description |
|-------|------|-------------|
| `id` | TEXT PK | Device identifier |
| `hostname` | TEXT | Hostname |
| `platform` | TEXT | linux, android, macos... |
| `arch` | TEXT | x86_64, aarch64... |
| `gpu` | TEXT | GPU description |
| `ram_gb` | INTEGER | Available RAM |
| `last_seen` | TEXT | Last connection timestamp |
| `ip` | TEXT | IP address (last known) |
| `profiles` | TEXT | JSON array of profiles residing on this device |

### 3.8 Context Cache (`context_cache`)

Ensures onboarding does not rebuild everything on every run.

| Field | Type | Description |
|-------|------|-------------|
| `profile_name` | TEXT → profiles(name) | Target profile |
| `cache_key` | TEXT | `system_prompt`, `skills_prompt`, `soul_context` |
| `content` | TEXT | Prefabricated block |
| `content_hash` | TEXT | Hash for cache invalidation |
| `built_at` | TEXT | Generation timestamp |

A connecting agent can request `cache_key = "system_prompt"` for its profile and receive the assembled system prompt block immediately, without rebuilding it locally from scratch.

---

## 4. Onboarding Flow

### 4.1 Full Flow: New Hermes Agent Connects to Cardinal

```
┌─────────────────┐         ┌──────────────────────┐        ┌──────────────┐
│    NEW AGENT    │         │       CARDINAL       │        │  DASHBOARD   │
│ (Hermes profile)│         │   (Context Store)    │        │   (Human)    │
└────────┬────────┘         └──────────┬───────────┘        └──────┬───────┘
         │                             │                           │
   1. WS hello(key)                    │                           │
    ─────────────────────────►         │                           │
         │                    2. Validates key + marks             │
         │                       hello with device                 │
         │                    3. First time this agent             │
         │                       connects?                         │
         │                      ├── Yes → ONBOARDING state         │
         │                      ├── No  → jumps to step 5          │
         │                             │                           │
         │                    4. Creates profile in registry       │
         │                       (if missing)                      │
         │                    5. Finds config_template             │
         │                       for profile                       │
         │                             │                           │
         │   6. {type:"welcome", onboarding:true/false,            │
         │       config: {...}, soul: "...",                       │
         │       skills: [...], memory: {...}}                     │
         │    ◄─────────────────────────                           │
         │                             │                           │
   7. Applies received config:         │                           │
   ├── Creates profile/config.yaml     │                           │
   ├── Writes local SOUL.md            │                           │
   ├── Downloads missing skills        │                           │
   ├── Memory: pull or merge           │                           │
         │                             │                           │
   8. {type: "onboarding_done",        │                           │
       status: "idle"}                 │                           │
    ─────────────────────────►         │                           │
         │                    9. Marks status=active               │
         │                       broadcasts agent_update           │
         │                             │                           │
         │                            │    10. WebSocket event     │
         │                            │     ◄───── agent_update ───│
         │                            │     "New agent online:     │
         │                            │      Lisbeth (laptop)"     │
```

### 4.2 What Does the Agent Receive in `welcome`?

```json
{
  "type": "welcome",
  "agent": "lisbeth",
  "kind": "agent",
  "onboarding": true,
  "config": {
    "model": {
      "default": "deepseek-v4-flash",
      "provider": "opencode-zen"
    },
    "toolsets": ["terminal", "web", "browser", "file"],
    "agent": {
      "max_turns": 90,
      "disabled_toolsets": []
    }
  },
  "soul": "## Lisbeth — Tooling & DevOps Agent\n\n...full personality in markdown...",
  "skills": [
    {"name": "linux-disk-space-diagnosis", "category": "devops", "required_toolsets": ["terminal"]},
    {"name": "podman-app-deployment", "category": "devops", "required_toolsets": ["terminal", "file"]},
    {"name": "kvm-qemu-setup", "category": "devops", "required_toolsets": ["terminal"]}
  ],
  "memory": {
    "memory": "§\nSpecialist in tooling and DevOps...",
    "user": "§\nThe user is the owner. Use Argentine voseo..."
  },
  "device_registry": {
    "profiles_on_device": ["kirito", "lisbeth"]
  }
}
```

### 4.3 Does This Replace or Complement Current Hermes Profiles?

**It complements them.** The local Hermes profile remains the execution unit — local `config.yaml`, `state.db`, `memories/`, and `skills/` continue to exist. Cardinal serves as the **distributed source of truth**:

1. **First connection = full onboarding.** Cardinal dictates what this agent is.
2. **Subsequent connections = sync.** The agent already has config, skills, and soul — it only checks for diffs.
3. **Cardinal does NOT replace the local profile.** If Cardinal is down, the agent runs with its last known configuration.

---

## 5. Integration with Hermes Memory

### 5.1 Strategy: Mirror + Sync, Not Replacement

**Design Decision: Cardinal does NOT replace the Hermes memory store.**

```
┌─────────────────────────────────────────┐
│             MEMORY STRATEGY             │
│                                         │
│  Hermes local (per-profile)             │
│  ┌─────────────────────────────────┐    │
│  │ MEMORY.md  ← primary source     │    │
│  │ USER.md    ← primary source     │    │
│  │ Writes here on every session    │    │
│  └──────────────┬──────────────────┘    │
│                 │ background sync       │
│                 ▼                       │
│  Cardinal (centralized)                 │
│  ┌─────────────────────────────────┐    │
│  │ memory_mirror ← async mirror    │    │
│  │ Serves agents onboarding from   │    │
│  │ scratch                         │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

**Rationale:**
1. **Performance:** The Hermes memory store is designed for low latency (direct disk reads, frozen snapshot in system prompt). Adding a round-trip to Cardinal on every session disrupts prompt caching.
2. **Resilience:** If Cardinal is down, the agent continues operating exactly as it does today.
3. **Simplicity:** The Hermes memory tool contains ~1,200 lines of concurrency, drift detection, and locking logic. Replicating that inside Cardinal would introduce unnecessary complexity.

### 5.2 Synchronization Mechanism

```
Every N sessions (configurable, default: 10):
1. At the end of a session, the Hermes agent:
   a. Issues GET /api/context/memory/<profile>/<target>?hash=<current_hash>
   b. Cardinal responds:
      - 304 Not Modified → no external changes
      - 200 with content → newer version exists (e.g., from another device)
   c. Merge strategy:
      - If local hash matches → do nothing
      - If Cardinal has entries missing locally → append them (add)
      - If local has entries missing in Cardinal → upload (PUT)

2. Cardinal background sync worker (hourly):
   a. For profiles with sync_direction=local_primary:
      - Does not initiate automatic sync — waits for the agent
   b. For profiles with sync_direction=cardinal_primary:
      - Cardinal is source of truth (e.g., newly created profile)
```

### 5.3 What Happens if Cardinal is Down?

**Nothing breaks.** The agent operates exactly as it does today:
- Reads local MEMORY.md/USER.md
- Starts sessions normally
- Writes memory locally
- When Cardinal recovers, the next sync uploads pending changes

**Maximum loss:** Memory entries written while Cardinal was down are lost **only** if the agent also suffers local disk loss. Cardinal is not a backup system — it is a mirror for onboarding new agents.

---

## 6. Integration with Vault RAG

### 6.1 Architecture: Cached Proxy

```
┌──────────────────┐         ┌──────────────────┐         ┌───────────────┐
│   HERMES AGENT   │         │     CARDINAL     │         │     VAULT     │
│   (any device)   │         │   (RAG Proxy)    │         │  (local PC)   │
└────────┬─────────┘         └────────┬─────────┘         └───────┬───────┘
         │                            │                           │
   POST /api/v1/rag                   │                           │
   {query: "money routing",           │                           │
    top_k: 5}                         │                           │
         │                            │                           │
    ───────────────────────►          │                           │
         │                    1. Check local cache                │
         │                       if cache fresh → return          │
         │                    2. vault-query CLI →                │
         │                       ─────────────────────────►       │
         │                           3. vault-index responds      │
         │                       ◄─────────────────────────       │
         │                    4. Cache result + return            │
         │                            │                           │
         ◄───────────────────────     │                           │
   5. Agent receives chunks           │                           │
      as if local                     │                           │
```

### 6.2 Operating Modes

| Mode | Cardinal | Requirement | Latency |
|------|----------|-------------|---------|
| **Cache mode** (FASE 1) | Caches responses from local vault-query | vault-query accessible from Cardinal (same device) | ~200ms cache hit, ~2s miss |
| **Proxy mode** (FASE 1b) | Delegates to vault-query on PC | Cardinal on VPS, PC accessible via SSH/WS | ~500ms-2s |
| **Native mode** (FASE 2+) | Cardinal maintains its own index | Vault mounted as volume into Cardinal | ~100ms |

### 6.3 Cache Strategy

- TTL: 1 hour default
- Invalidation triggered when vault-query re-indexes (webhook from re-index cron)
- Cache key = hash(query + top_k)
- Limit: 1000 entries in LRU cache

### 6.4 RAG Endpoints

```
POST /api/v1/rag/search
Auth: Agent key (sk-cardinal-*)
Body: { query: string, top_k?: number, mode?: "hybrid"|"semantic"|"keyword" }
Response: { results: [{ path: string, score: number, content: string, source: "cache"|"vault" }], cached_at?: string }

GET /api/v1/rag/status
Auth: Agent key
Response: { indexed_chunks: number, last_indexed: string, cache_hits: number, cache_misses: number }
```

---

## 7. Context Store API

### 7.1 REST Endpoints

```
# Profile Management
GET    /api/v1/context/profiles                          # List all profiles
GET    /api/v1/context/profiles/:name                     # Profile details
PUT    /api/v1/context/profiles/:name                     # Update profile (onboarding)

# SOUL
GET    /api/v1/context/profiles/:name/soul                # Get SOUL.md
PUT    /api/v1/context/profiles/:name/soul                # Update SOUL.md

# Skills
GET    /api/v1/context/skills                             # Full catalog
GET    /api/v1/context/profiles/:name/skills              # Profile skills
POST   /api/v1/context/profiles/:name/skills/sync         # Sync skills from Cardinal

# Memory Mirror
GET    /api/v1/context/profiles/:name/memory/:target      # Get mirror with hash
PUT    /api/v1/context/profiles/:name/memory/:target      # Upload mirror from agent
POST   /api/v1/context/profiles/:name/memory/sync         # Force bidirectional sync
GET    /api/v1/context/profiles/:name/memory/diff          # View diff

# Context Cache
GET    /api/v1/context/profiles/:name/cache/:key          # Get prefabricated block
POST   /api/v1/context/profiles/:name/cache/rebuild       # Rebuild context cache

# Sessions Index
GET    /api/v1/context/profiles/:name/sessions            # Recent sessions
POST   /api/v1/context/profiles/:name/sessions/sync       # Sync from local state.db

# Device Registry
POST   /api/v1/context/devices/heartbeat                  # Agent reports its device
GET    /api/v1/context/devices                            # All known devices
GET    /api/v1/context/devices/:id                        # Device details

# Vault RAG Proxy
POST   /api/v1/rag/search                                 # Semantic search
GET    /api/v1/rag/status                                 # Index status
POST   /api/v1/rag/invalidate                             # Invalidate cache (from local cron)

# Agent Onboarding (extended WS protocol)
# Extended hello → onboarding flow (see Section 4)
```

### 7.2 WS Protocol Extensions

New messages (in addition to existing hello/pong/bye/subscribe):

```typescript
// Agent → Cardinal
{ type: "context_pull", resource: "soul" | "skills" | "config" | "memory" }
  // → Cardinal responds with requested resource

{ type: "context_push", resource: "memory", target: "memory" | "user", content: string, hash: string }
  // → Cardinal receives mirror, updates if hash is newer

{ type: "onboarding_done", status: "idle" | "busy" }
  // → Cardinal marks onboarding_complete and broadcasts

// Cardinal → Agent
{ type: "context_update", resource: "soul" | "skills" | "config", reason: "cardinal_updated" }
  // → SOUL.md changed from dashboard, agent must re-sync

{ type: "memory_invalidate", target: "memory" | "user" | "all", from_agent: string }
  // → Another device updated memory, this agent should consider re-sync
```

---

## 8. Redefined Post-FASE 0 Roadmap

### FASE 0 (COMPLETED [done])
**Living Skeleton** — Cardinal runs, accepts WS connections, provides dashboard.

**Deliverables:**
- WS Hub (hello/pong/bye/subscribe) + ping watchdog
- API keys (sk-cardinal-*) + keygen CLI
- Human login (JWT) + SAO Dashboard + Agent Hub
- Containerized deployment (Podman Quadlet)
- E2E tests

---

### FASE 1 — Context Store + Onboarding (CRITICAL — PRIORITY #1)

**Goal:** Cardinal becomes the central Context Store. Agents onboard from Cardinal.

**Components to build:**

| Component | Detail | Priority |
|-----------|--------|----------|
| Profile Registry | `profiles` table, CRUD API, WS hello integration | P0 |
| SOUL Registry | `souls` table, bidirectional SOUL.md sync | P0 |
| Skill Catalog | `skills` + `profile_skills` tables, central catalog | P0 |
| Onboarding Flow | Extended WS with `onboarding:true/false` in welcome | P0 |
| Memory Mirror | `memory_mirror` table, PUT/GET with hash, lazy sync | P1 |
| Device Registry | `devices` table, heartbeat from agents | P1 |
| Context Cache | `context_cache` table, rebuild endpoint | P1 |
| Vault RAG Cache | `POST /api/v1/rag/search` endpoint, LRU cache | P1 |
| Session Index | `sessions_index` table, sync from state.db | P2 |
| Dashboard: Profile Manager | UI to view/edit profiles, SOUL, skills | P2 |

**Cardinal DB Migration:** Add new tables via SQL migration (`PRAGMA user_version`).

**Risk:** Coordination between Hermes agents and Cardinal for memory synchronization. Mitigation: start with `local_primary` (agent is source of truth, Cardinal is mirror).

**External Dependency:** Communication with `vault-query` CLI (must be accessible from Cardinal).

**Tests:**
- Unit: each new repository (profiles, souls, skills)
- Integration: full onboarding flow (mock agent → hello → welcome with context → onboarding_done)
- Integration: bidirectional memory sync
- E2E: dashboard displays onboarded agents with their profiles

---

### FASE 2 — Router + One-Shot Agents (PRIORITY #2)

**Goal:** Cardinal can spawn one-shot agents and route models.

**Components to build:**

| Component | Detail | Priority |
|-----------|--------|----------|
| Model Router | `/v1/chat/completions` endpoint with sk-cardinal-* | P0 |
| Key Factory | Budgets per key, failsafes, rate limiting | P0 |
| One-Shot Agent Orchestration | Spawning ephemeral Podman/Docker containers | P0 |
| Key Factory (dynamic) | System keys for one-shot agents, auto-revoked upon completion | P1 |
| Consumption Tracking | Tokens, costs per agent/key | P1 |
| Dashboard: Consumption | UI for costs, budgets, key management | P2 |

**Connection to Context Store:**
- One-shot agents receive context from Cardinal (allowed skills, model, instructions)
- Use Context Cache for rapid system prompt generation
- On completion, write results to vault or session index

---

### FASE 3 — Knowledge Graph (PRIORITY #3)

**Goal:** Ecosystem knowledge graphs (vault, skills, agents, relationships).

**Components to build:**

| Component | Detail | Priority |
|-----------|--------|----------|
| Entity Extraction | Extract entities from vault + conversations | P0 |
| Graph DB | Node/edge tables in SQLite or Litestream | P0 |
| Graph API | REST endpoints to query the graph | P1 |
| Graph Visualization | Dashboard with navigable Obsidian-style graph | P2 |
| Relationship Inference | Infer relationships between projects, skills, agents | P2 |

**Dependencies:** FASE 1 (indexed sessions) and running vault RAG.

---

### FASE 4+ — Automations + Multi-Device

**Goal:** Cardinal orchestrates automations and coordinates multi-device agents.

| Component | Priority |
|-----------|----------|
| Centralized Cron Engine (replace limited Hermes native cron) | P1 |
| Webhook subscriptions (events → agents) | P1 |
| Agent-to-agent messaging via Cardinal relay | P2 |
| Cross-device memory merge (conflict resolution) | P2 |
| Dashboard: Automation Builder | P3 |

---

## 9. Recommended Prioritization and Sequence

### What to Build First?

```
FASE 1 step by step (recommended order):

Week 1-2:
┌─────────────────────────────────────────────────────┐
│ 1. Profile Registry + SOUL Registry                 │
│    - DB Migration: CREATE TABLE profiles, souls     │
│    - API: GET/PUT /api/v1/context/profiles/:name    │
│    - Integrate with WS hello: extended welcome      │
├─────────────────────────────────────────────────────┤
│ 2. Onboarding Flow                                  │
│    - Detect first connection or reset               │
│    - Welcome payload includes config + soul + skills│
│    - Agent receives, applies, responds              │
│      onboarding_done                                │
└─────────────────────────────────────────────────────┘

Week 3-4:
┌─────────────────────────────────────────────────────┐
│ 3. Skill Catalog                                    │
│    - skills + profile_skills tables                 │
│    - Sync skills between Cardinal and local profiles│
│    - Dashboard displays skills for each agent       │
├─────────────────────────────────────────────────────┤
│ 4. Memory Mirror (basic)                            │
│    - memory_mirror table + PUT/GET endpoints        │
│    - Manual sync (no background yet)                │
│    - Dashboard can inspect any agent's memory       │
└─────────────────────────────────────────────────────┘

Week 5-6:
┌─────────────────────────────────────────────────────┐
│ 5. Device Registry + Context Cache                  │
│    - devices table + heartbeat endpoint             │
│    - context_cache for fast onboarding              │
├─────────────────────────────────────────────────────┤
│ 6. Vault RAG Proxy (cache)                          │
│    - POST /api/v1/rag/search                        │
│    - LRU results cache                              │
│    - Integrate with vault-query CLI                 │
└─────────────────────────────────────────────────────┘
```

### Dependencies Across Phases

```
FASE 0 ──► FASE 1 ──► FASE 2 ──► FASE 3 ──► FASE 4+
               │            │            │
               ▼            ▼            ▼
          CRITICAL:    depends on:   depends on:
          Without      FASE 1        FASE 1+2
          FASE 1, the  (existing     (indexed
          rest makes   keys provide  sessions +
          no sense     identity +    vault RAG +
          because the  context for   registered
          agents have  one-shot      agents)
          no identity  agents)
```

### What Can Be Done Today with FASE 0?

With Cardinal FASE 0 running today (v0.0.1):

1. [done] See which agents are online in the dashboard
2. [done] Create API keys for new agents
3. [done] Agents connect via WS and report status
4. [done] Local subagents (device="localhost" → kind="subagent") appear in collapsible section
5. [done] Event history of connected/disconnected
6. [missing] NO onboarding (agents do not receive context)
7. [missing] NO shared memory

---

## 10. Suggested Technical Architecture

### 10.1 Stack for FASE 1+

**Recommendation:** Maintain Bun + TypeScript (the current stack). Do NOT migrate to Python/FastAPI.

**Rationale:**
1. FASE 0 is already written and tested in Bun — rewriting in Python introduces unnecessary overhead
2. Bun includes native `bun:sqlite`, which is faster than Python + sqlite3 for our volume
3. Bun type safety + existing test suite
4. The WS hub already runs on Bun — rewriting WebSockets in FastAPI introduces bug risk

| Component | Stack |
|-----------|-------|
| REST API | Bun (Bun.serve, existing routing) |
| WebSocket | Bun (existing hub.ts, extended) |
| DB | bun:sqlite with WAL |
| Migrations | PRAGMA user_version (existing pattern) |
| Agent auth | sk-cardinal-* (existing) |
| Human auth | JWT (existing) |
| Cache | In-memory LRU Map (sufficient for FASE 1) |
| Tests | Bun test (existing) |

### 10.2 Future Considerations

If data volume grows substantially (100k+ sessions, heavy vault index), consider:
- Migrating DB to SQLite with Litestream for live replication
- Or migrating directly to Postgres if higher concurrency is required
- However, **do not over-engineer early** — begin with bun:sqlite as in FASE 0

### 10.3 DB Migration Plan (FASE 1)

```sql
-- Migration 2: Context Store
BEGIN;

-- Profile Registry
CREATE TABLE IF NOT EXISTS profiles (
  name            TEXT PRIMARY KEY,
  display_name    TEXT NOT NULL,
  emoji           TEXT NOT NULL DEFAULT 'default',
  kind            TEXT NOT NULL DEFAULT 'permanent' CHECK (kind IN ('permanent','one-shot')),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','dormant','liberated','onboarding')),
  model_default   TEXT,
  provider_default TEXT,
  device          TEXT,
  last_onboarded  TEXT,
  onboarding_key_hash TEXT REFERENCES agent_keys(key_hash),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- SOUL Registry
CREATE TABLE IF NOT EXISTS souls (
  profile_name      TEXT PRIMARY KEY REFERENCES profiles(name),
  soul_md           TEXT NOT NULL,
  personality_tags  TEXT,
  tool_restrictions TEXT,
  canon_ref         TEXT,
  version           INTEGER NOT NULL DEFAULT 1,
  content_hash      TEXT NOT NULL,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Skill Catalog
CREATE TABLE IF NOT EXISTS skills (
  name              TEXT PRIMARY KEY,
  description       TEXT NOT NULL DEFAULT '',
  category          TEXT,
  content_hash      TEXT NOT NULL,
  path              TEXT,
  required_toolsets TEXT,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Profile-Skills mapping
CREATE TABLE IF NOT EXISTS profile_skills (
  profile_name  TEXT NOT NULL REFERENCES profiles(name),
  skill_name    TEXT NOT NULL REFERENCES skills(name),
  pinned        INTEGER NOT NULL DEFAULT 0,
  added_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (profile_name, skill_name)
);

-- Memory Mirror
CREATE TABLE IF NOT EXISTS memory_mirror (
  profile_name  TEXT NOT NULL REFERENCES profiles(name),
  target        TEXT NOT NULL CHECK (target IN ('memory','user')),
  content       TEXT NOT NULL,
  char_count    INTEGER NOT NULL DEFAULT 0,
  content_hash  TEXT NOT NULL,
  sync_direction TEXT NOT NULL DEFAULT 'local_primary' CHECK (sync_direction IN ('local_primary','cardinal_primary','bidirectional')),
  last_synced   TEXT,
  PRIMARY KEY (profile_name, target)
);

-- Device Registry
CREATE TABLE IF NOT EXISTS devices (
  id            TEXT PRIMARY KEY,
  hostname      TEXT,
  platform      TEXT,
  arch          TEXT,
  gpu           TEXT,
  ram_gb        INTEGER,
  ip            TEXT,
  last_seen     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Device-Profile mapping
CREATE TABLE IF NOT EXISTS device_profiles (
  device_id     TEXT NOT NULL REFERENCES devices(id),
  profile_name  TEXT NOT NULL REFERENCES profiles(name),
  PRIMARY KEY (device_id, profile_name)
);

-- Session Index
CREATE TABLE IF NOT EXISTS sessions_index (
  id              TEXT PRIMARY KEY,
  profile_name    TEXT NOT NULL REFERENCES profiles(name),
  title           TEXT,
  model           TEXT,
  started_at      REAL NOT NULL,
  message_count   INTEGER DEFAULT 0,
  input_tokens    INTEGER DEFAULT 0,
  output_tokens   INTEGER DEFAULT 0,
  estimated_cost  REAL
);
CREATE INDEX IF NOT EXISTS idx_sessions_profile ON sessions_index(profile_name, started_at DESC);

-- Context Cache
CREATE TABLE IF NOT EXISTS context_cache (
  profile_name  TEXT NOT NULL REFERENCES profiles(name),
  cache_key     TEXT NOT NULL CHECK (cache_key IN ('system_prompt','skills_prompt','soul_context','config_context')),
  content       TEXT NOT NULL,
  content_hash  TEXT NOT NULL,
  built_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (profile_name, cache_key)
);

-- Vault RAG Cache
CREATE TABLE IF NOT EXISTS rag_cache (
  query_hash   TEXT PRIMARY KEY,
  query        TEXT NOT NULL,
  top_k        INTEGER NOT NULL DEFAULT 5,
  mode         TEXT NOT NULL DEFAULT 'hybrid',
  results      TEXT NOT NULL,
  cached_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT NOT NULL
);

-- Migration bookkeeping
PRAGMA user_version = 2;

COMMIT;
```

### 10.4 Module Splitting Strategy

Preserving the existing `backend/src/` structure:

```
backend/src/
├── index.ts              # bootstrap (unchanged)
├── config.ts             # + new env vars (DB_PATH remains identical)
├── db/
│   ├── index.ts          # createDb + migrate (new migration v2)
│   ├── repos.ts          # existing + new repos:
│   │                     # profiles/, souls/, skills/, memory/, devices/, sessions/, cache/
│   └── db.test.ts
├── auth/                 # unchanged (JWT login remains identical)
├── keys/                 # unchanged (keygen remains identical)
├── ws/
│   ├── protocol.ts       # + new schemas (context_pull, context_push, onboarding_done)
│   ├── hub.ts            # + onboarding flow in hello, + context_update events
│   └── hub.test.ts
├── api/
│   ├── health.ts         # unchanged
│   ├── agents.ts         # unchanged
│   └── api.test.ts
├── context/              # NEW Context Store module
│   ├── index.ts          # router /api/v1/context/*
│   ├── profiles.ts       # CRUD profiles + SOUL
│   ├── skills.ts         # Catalog + sync
│   ├── memory.ts         # Memory mirror endpoints
│   ├── devices.ts        # Device registry
│   ├── sessions.ts       # Session index
│   ├── cache.ts          # Context cache builder
│   └── context.test.ts
├── rag/                  # NEW Vault RAG module
│   ├── index.ts          # router /api/v1/rag/*
│   ├── cache.ts          # LRU results cache
│   ├── vault_client.ts   # Client for vault-query CLI
│   └── rag.test.ts
├── server.ts             # + new routes /api/v1/context/* and /api/v1/rag/*
├── server.test.ts        # + new E2E tests
```

---

## 11. Hermes Agent-Side Integration

For a Hermes agent to consume the Cardinal Context Store, it requires a **skill or plugin** implementing the protocol. This does NOT modify the Hermes core.

### Cardinal Client Skill (`~/.hermes/skills/autonomous-ai-agents/cardinal-client/`)

```
cardinal-client/
├── SKILL.md                    # Documentation
├── scripts/
│   ├── cardinal-onboard.sh     # Onboarding: connects to Cardinal, applies config
│   └── cardinal-sync.sh        # Memory + sessions sync
└── references/
    └── protocol.md             # Extended WS protocol documentation
```

**Skill responsibilities:**

1. At session initialization, verify Cardinal connection
2. If onboarding is required → execute flow (receive config, soul, skills)
3. In the background: memory synchronization (MEMORY.md → Cardinal)
4. Provide `cardinal_context_pull` and `cardinal_context_push` tools for explicit access

**Onboarding script (`cardinal-onboard.sh`):**

```bash
#!/bin/bash
# CARDINAL_URL and CARDINAL_AGENT_KEY from profile .env
CARDINAL_URL="${CARDINAL_URL:-http://localhost:8787}"
KEY="${CARDINAL_AGENT_KEY}"

# 1. Connect WS and send hello
# 2. Receive welcome with onboarding context
# 3. Apply:
#    - Write config.yaml (merge with existing if present)
#    - Write SOUL.md
#    - Synchronize skills (install missing ones)
#    - Pull memory if first time
# 4. Send onboarding_done
```

---

## 12. Design Decisions — Summary

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Cardinal does NOT replace Hermes memory store** | Resilience, latency, prompt caching. Mirroring is asynchronous |
| 2 | **Cardinal does NOT run its own vector store in FASE 1** | vault-query already exists and functions well. Cache + proxy is sufficient |
| 3 | **Local profiles remain the execution unit** | Cardinal is a distributed source of truth, not a runtime dictator |
| 4 | **Bun + TypeScript maintained for FASE 1+** | Avoid rewriting in Python; current stack works and is well tested |
| 5 | **Onboarding is a WS flow, not REST** | The agent already maintains an open WS connection for heartbeats; extends existing protocol |
| 6 | **Memory sync is lazy and asynchronous** | Avoid blocking session startup on memory synchronization |
| 7 | **Skills live in Cardinal as a catalog, not a mirror** | Skills are large files; Cardinal only stores metadata + hash. Agents download actual SKILL.md from local filesystem or repository |
| 8 | **Device registry is pushed from agent** | Agent knows its device upon sending hello; Cardinal does not scan |
| 9 | **Context Cache is rebuilt on demand** | Avoid stale caches; rebuild when requested by the agent |
| 10 | **One-shot agents receive context inline, not via onboarding** | They are ephemeral and do not need persistent profiles |

---

## 13. Success Metrics

How to verify this design works in practice:

- [done] A new agent (e.g., Kirito on laptop) connects to Cardinal and receives its full configuration without human intervention
- [done] The dashboard displays not only connectivity, but also profile, skills, and SOUL for each agent
- [done] Asuna's memory (written on PC) is visible to Shinon when querying "what does Asuna know?"
- [done] vault-query works from any agent connected to Cardinal (not only from the local PC)
- [done] If Cardinal is down, all agents continue running without degradation
- [done] The session index allows viewing activity history for any agent from the dashboard

---

## Appendix A: Tables Summary (Post-FASE 1 Cardinal DB)

| Table | Purpose | Phase |
|-------|---------|-------|
| `agents` | Agent registry + online status | FASE 0 [done] |
| `agent_keys` | API keys with hash | FASE 0 [done] |
| `agent_events` | Connect/disconnect/status history | FASE 0 [done] |
| `profiles` | Hermes ecosystem profiles | FASE 1 [new] |
| `souls` | Centralized SOUL.md | FASE 1 [new] |
| `skills` | Master skills catalog | FASE 1 [new] |
| `profile_skills` | Skills per profile | FASE 1 [new] |
| `memory_mirror` | Mirror of MEMORY.md / USER.md | FASE 1 [new] |
| `devices` | Known physical devices | FASE 1 [new] |
| `device_profiles` | Which profiles on which device | FASE 1 [new] |
| `sessions_index` | Session metadata | FASE 1 [new] |
| `context_cache` | Prefabricated context blocks | FASE 1 [new] |
| `rag_cache` | vault-query results cache | FASE 1 [new] |

## Appendix B: Glossary

| Term | Meaning |
|------|---------|
| **Profile** | Native Hermes profile (`~/.hermes/profiles/<name>/`) containing config, memory, and skills |
| **Skin** | Cosmetic SAO identity (Shinon, Asuna). A profile can adopt a skin |
| **Onboarding** | Process by which a new Hermes agent receives its identity, configuration, and skills from Cardinal |
| **Context Store** | Set of tables and APIs establishing Cardinal as the ecosystem's source of truth |
| **Memory Mirror** | Asynchronously synchronized copy of MEMORY.md/USER.md hosted in Cardinal |
| **RAG Proxy** | Cardinal receives semantic search queries, delegates them to vault-query, and caches results |
| **Context Cache** | Prefabricated system prompt blocks to accelerate agent onboarding |
| **One-shot Agent** | Ephemeral agent without a persistent profile, created for a targeted task |

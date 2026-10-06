# Cardinal v2 — Architecture (MCP Hub + Blackboard + Key Pool)

> Date: 2026-08-12
> Status: Design record (2026-08-12 decisions). Pillar rows below are that snapshot.
> Implementation status (2026-10-06): Phase 2 is complete on `main` at v0.2.6 (PR #12, merged 2026-09-18). Current priorities live in [`docs/roadmap.md`](../../roadmap.md).
> v3 added Cardinal-owned maintenance workers. N1 is on `dev` only (PR #36, 2026-10-05). See [`docs/features/2026-10-05-internal-maintenance-worker.md`](../../features/2026-10-05-internal-maintenance-worker.md).
> Roadmap relationship: re-scopes Phase 2 (see final section).

---

## 1. Context and Why v2

The ecosystem evolved significantly since Phase 2 was originally designed (July 2026). Responsibilities that Cardinal previously had to handle alone—orchestrating one-shot agents in containers—are now addressed by existing tools that should be leveraged rather than reinvented:

- **herdr.dev** — local multiplexer recognizing 16 agent kinds (opencode, claude, codex, cursor, gemini, grok, hermes, etc.), managing panes/tabs and lifecycle (idle/working/blocked/done). Integrates via `*-agent-state` hooks in each agent's config directory.
- **MCP** — mature agent↔tool standard (Linux Foundation). Supported everywhere: Hermes (native client), Claude, Cursor, Codex.
- **A2A (Google)** — emerging agent↔agent standard (Agent Cards, delegation). Complements MCP rather than competing with it.

Conclusion: **orchestration is a commodity**. What remains exclusive to Cardinal is the global brain: identity, context, and cross-provider coordination.

**Thesis:** Cardinal = brain/memory/identity. herdr/Hermes/CLIs = hands.

---

## 2. The Four Pillars

| # | Pillar | Description | Status |
|---|--------|-------------|--------|
| 1 | Multi-vault MCP context hub | MCP server serving context from multiple indexed Obsidian vaults | Design (spike-002) |
| 2 | Key pool + internal router | Provider API key pool; Cardinal mints derived `sk-cardinal-*` keys with scopes/budgets and routes `/v1/chat/completions` to the correct upstream with automatic fallback | Design (spike-003) |
| 3 | Blackboard + mailbox | Cross-provider agent↔agent coordination via a shared task board | Design (spike-001) |
| 4 | Identity | `sk-cardinal-*`, "the key IS the identity", cross-device | [done] Already exists (Phase 0) |

---

## 3. Division of Responsibilities: herdr ↔ Cardinal

No overlap. They are complementary layers.

| Layer | herdr | Cardinal |
|-------|-------|----------|
| Scope | Local (single machine) | Global (cross-device) |
| Responsibilities | Panes, tabs, local lifecycle, human TUI, spawning/reading agents | Identity, multi-vault context, blackboard, pool/router |
| State | Ephemeral (local process) | Persistent (DB) |
| Visibility | Human in the TUI | Agents + dashboard |

### Integration (do not reimplement)

1. **Roster bridge (passive, lightweight):** Cardinal reads `herdr agent list` (JSON) and the dashboard reflects reality—what is genuinely running along with its lifecycle. Zero modifications to agents.
2. **Blackboard via MCP:** MCP-capable agents consume Cardinal tools directly. No custom client required.
3. **Per-agent `cardinal-agent-state` plugin** (mirroring herdr's hook pattern): only if necessary, for agents lacking MCP or needing richer status. Not the initial path.

**Spawn rule (v2 → v3):** Cardinal is the system, not a passive component.

- **CLI agents** (opencode, claude, cursor, codex): Cardinal NEVER tells
  herdr to "spawn an agent". Triggers for these reside externally (human,
  herdr hook, cron). The agent, upon starting, PULLS its next task
  from the board. This rule is maintained from v2.
- **Cardinal internal workers** (image `cardinal-worker`): Cardinal can
  create and terminate ephemeral containers to execute one-shot tasks
  (tasks v2, chatbot, automations). The backend owns the
  lifecycle (quadlet + TTL + cleanup). The container runs a Cardinal
  worker with a JSON stdin/stdout contract, without DB access or real
  keys, and with no open network access except what the orchestrator declares.
- Cardinal NEVER invokes an external CLI from inside its own container.
  If a task requires a CLI agent, it is delegated to herdr as before.

Rationale: "agent" ≠ "worker". A CLI agent possesses judgment and is
interactive; a worker is a scoped, disposable executor. The original v2
rule ("agent-less core") guards against Cardinal duplicating CLI
orchestration; allowing internal workers extends the core rather than
breaking the rule.

Implementation spec: `docs/superpowers/plans/2026-09-07-cardinal-v3-backlog.md`
item **N1**.

---

## 4. Blackboard (Agent↔Agent Coordination)

Linear / real-team style model: tasks with status, assignee, parent/child tree, bounded comments, references to artifacts. The "shared objective" is a task tree; agents claim leaf tasks, record outputs, and other agents follow up.

### Data Model (design, validate via spike)

```
tasks
├── id            (uuid)
├── goal          (short text)
├── status        open | claimed | done | blocked
├── assigned_to   (agent name, nullable)
├── created_by    (agent name)
├── parent_id     (nullable — goal tree)
├── context_refs  (JSON — refs to vault notes / sessions / memories)
├── artifact_ref  (pointer to result, NOT the content)
├── summary       (bounded summary, token budget)
└── created_at / updated_at

messages  (mailbox for targeted handoffs)
├── id, from_agent, to_agent, type, payload_ref, read, created_at
```

### Lifecycle

```
open → claimed (claimed by an agent)
     → blocked (requires input/unblocking)
     → done    (with artifact_ref + summary)
```

Each `done` task constitutes a graph node in Phase 3.

### Anti-Inflation Rules (GOLDEN — originating from the Hermes-chat incident)

1. **Out-of-band:** agent↔agent traffic NEVER travels through the human channel. It consists of DB rows (tasks/messages), not conversation messages.
2. **Pull, not push:** nothing is dumped into anyone's context automatically. An agent queries the board (`task_list`, `task_get`) when NEEDED, within a token budget.
3. **Isolated memory:** agent↔agent traffic NEVER touches the memory mirror or the user profile. Memory is written only via explicit action (human, or an agent calling `memory_set` with a bounded summary). Zero auto-ingest.
4. **Results as references:** the board stores `artifact_ref` + bounded `summary`, not full prose. The full transcript of the work resides in the agent's own session.
5. **Ephemeral by default:** state in DB, never in-process.

> Why it broke previously: agent↔agent traffic was routed through Hermes chat, which treated it as human conversation → inflated transcript AND triggered memory writes to the profile. The bug was the channel, not the communication itself.

---

## 5. MCP Surface (Cardinal Tools)

```
Context       search_vaults(query, vault?) · list_vaults · get_note(path)
Memory        memory_get(target) · memory_set(target, summary)   # set = explicit, never auto
Sessions      session_search(query)
Board         task_create · task_list · task_claim · task_complete · task_comment
Mailbox       agent_send · agent_inbox
Roster        who_is_online
```

Multi-vault: currently there is a single index (the portal). The target architecture supports N indexed vaults, with each chunk tagged by origin vault, queryable across all vaults or filtered by vault.

---

## 6. Key Pool + Internal Router (Architecture Finalized 2026-08-20)

Provider-agnostic router inspired by FreeLLMAPI, but with client identity. The derived key (`sk-cardinal-*`) IS the identity: it defines scopes (which models can be requested), budget, and metering per agent.

### Data Model (all in DB, nothing hardcoded)

```
providers                      — configured dynamically by the admin without code changes
├── id, name, base_url, api_key (AES-256-GCM, never leaves Cardinal)
├── wire_format: openai | anthropic | gemini
├── status: active | disabled
├── optional rate_limits (rpm, tpm)
└── cost_per_mtok (metering)

provider_models                — physical models per provider
├── provider_id, model_id (e.g., "deepseek-v4-flash-free")
├── capabilities (tools/vision/streaming), context_window

model_routes                   — logical aliases (the only thing consumers see)
├── alias (e.g., "pro", "fast") OR real model name ("deepseek-v4-flash")
└── fallback_chain ordered JSON: [{provider, model_id}, ...]

agent_keys (extended)          — client identity
├── scopes JSON (list of allowed aliases/models; "*" = unrestricted autorouter)
├── budget_limit (tokens), budget_used (accumulated)
└── created_by=system → auto-revocable (one-shot); created_by=human → never touched automatically
```

Dashboard `/keys` (spec `2026-08-20-keys-dashboard-design.md`): main list =
active human keys; history (log icon) = revoked human keys. **Future (not now):**
active one-shot keys in a compact block **bottom-left**; upon one-shot completion,
the row is **deleted** (does not go to history; the trace remains in that agent's log).

### Resolution (autorouter + aliases)

- `model="deepseek-v4-flash"` (real name) → AUTOROUTER: the router builds the pool of
  providers serving that model, uses the first healthy one, and on failure jumps to the next.
- `model="pro"` (logical alias) → FIXED CHAIN defined by the admin in model_routes.
- The key determines access: scope ["fast"] = only that alias;
  scope ["*"] = unrestricted autorouter; scope ["deepseek-v4-pro"] = only that model.

### Flow POST /v1/chat/completions (Bearer sk-cardinal-*)

1. Auth: SHA-256 hash of key → validate + scope (allowed to request this model?) + budget (remaining balance?)
2. Resolve model → fallback_chain
3. For each link: health check + cooldown (429/5xx) → decrypt api_key → call upstream
4. Success: stream SSE or return standard completion (do not break stream while routing)
5. Metering: record tokens per derived key + per provider (usage dashboard)
6. If all fail: return error with attempt trail

### Transparent Failover (Core Design Principle)

"If deepseek-v4-flash is requested and 4 free providers exist, provider 1 is used; if interrupted, the router fails over to the next WITHOUT interrupting the end user." The client never observes the failover—they only see the requested model. Similar to FreeLLMAPI unified models, with client identity added: the key knows who it is, what it can request, and its consumption to date.

**Implementation status (2026-09-03, v0.2.5):** `/v1` engine [done]; dashboard
JWT `/router` [done] (read-only UI); key creation with tokens/expiry/USD [done];
Fusion/MoA (`mode:fusion` + judge synthesize) [done]. Index:
[`docs/features/2026-09-03-router-surface.md`](../../features/2026-09-03-router-surface.md).
Follow-ups: mutate chains from UI, display Fusion on `/router`, hop-level USD
in Fusion, free zen e2e.

### Upstreams (Real Status 2026-08-20)

| Upstream | Description | Status |
|----------|-------------|--------|
| opencode-zen | Free tier via opencode CLI (`opencode/*-free`) | [done] Functional (validated: deepseek-v4-flash-free responds) |
| opencode-llm-proxy | KochC plugin on :4010 — adapts opencode to OpenAI wire | [done] Concept validated; use as adapter |
| opencode-go | GO subscription | [failed] DOWN (subscription expired 2026-08) — do not use as primary upstream |
| deepseek-direct | Direct DeepSeek API | [pending] Pending key acquisition |
| Future | OpenRouter, Groq, etc. | --- (provider-agnostic: added as rows) |

Note spike-003 (2026-08-20): `opencode serve` DOES NOT expose `/v1/chat/completions`
(returns SPA for unknown routes; native API is session/prompt/event). To use opencode as an OpenAI-compatible upstream, `opencode-llm-proxy` is required (plugin listening on :4010 exposing OpenAI/Anthropic/Gemini wire formats, streaming + tool calling).

### Security Boundary (Key Pool Core Guarantee)

"Lending" keys to one-shot or public agents (portfolio chatbot) DOES NOT lend
real keys: it mints derived keys with scope and budget limits. The public agent NEVER
sees the provider key. If budget is exceeded, Cardinal terminates access automatically.
**The real key never leaves Cardinal.**

---

## 7. Open Decisions / Spikes

| Spike | Validates (Given/When/Then) | Risk |
|-------|------------------------------|------|
| 001 blackboard-no-inflation | Given the board, when A posts and B resumes, neither inflates context nor writes memory | High (invalidates concept if failed) |
| 002 mcp-multivault | Given RAG proxy + thin MCP server, when an agent calls search_vaults, it receives chunks with vault origin and token budget | Medium |
| 003 pool-opencode-go | Given opencode serve (GO), when the router sends a completion, it returns real tokens and metering functions | Medium |

Order: 001 first.

---

## 8. Roadmap Relationship (Phase 2 Re-scope)

| Original Phase 2 Item | Destination |
|-----------------------|-------------|
| 2.1 LLM Router (`/v1/chat/completions`) | [done] Retained — core of pillar 2 |
| 2.2 API Key Factory (scopes + budgets) | [done] Retained — pillar 2 |
| 2.3 One-Shot Agents (Podman API) | [superseded] Generic CLI orchestration stays with herdr. v3 N1 (2026-10-05, `dev` only) is a separate Cardinal-owned worker with a JSON contract |
| 2.4 PR Review Pipeline (GitHub webhook) | [deferred] Postponed — handled via blackboard + external trigger when needed |
| 2.5 @mention trigger | [deferred] Postponed — same |

The local GitHub API polling workaround (decision 2026-08-10) remains valid as an alternative if needed by an external trigger, but ceases to be the Phase 2 bottleneck: the bottleneck is now validating pillars via spikes.

---

*Living document. Updated when spikes yield verdicts or priorities shift.*

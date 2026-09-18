# Nogal Hive — Anatomy of a Multi-Agent Platform

> Technical talk by **Agustín Diez** (github.com/agusisa), Nogal Labs · July 2026
> Source: https://nogal-labs.com.ar/hive-charla/
> 
> *"The models are already here. The work is the platform."*

---


## Index

1. [What is Hive](#what-is-hive)
2. [Design Philosophy](#design-philosophy)
3. [4-Layer Architecture](#4-layer-architecture)
4. [nogal-ai Gateway](#nogal-ai-gateway)
5. [Ephemeral Workers](#ephemeral-workers)
6. [Git Fork Model](#git-fork-model)
7. [Token Economics (tiers)](#token-economics-tiers)
8. [Human-in-the-loop](#human-in-the-loop)
9. [Shared Memory](#shared-memory)
10. [Real Incident: the USD 10 Night](#real-incident-the-usd-10-night)
11. [Post-mortem Fixes](#post-mortem-fixes)
12. [Executable Plans](#executable-plans)
13. [5 Transferable Lessons](#5-transferable-lessons)
14. [What Applies to the Cardinal System](#what-applies-to-the-cardinal-system)

---

## What is Hive

Nogal Labs' internal multi-agent platform where AI agents work as a software team:

```
CHAT → QUEUE → WORKER → PR → HUMAN (merge)
```

- **6 roles**: developer, devops, research, analyst, writer, secops
- **1 VPS**: Next.js + Express + Postgres + Docker. No Kubernetes.
- **100% in production**: everything runs today and has merged PRs behind it.
- **Flow**: request work via chat → a task is created → a worker picks it up → resolves it → PR → human merges.

---

## Design Philosophy

**Thesis**: many small agents with minimal permissions vs. one mega-agent with access to everything.

| Mega-agent (no) | Hive Swarm (yes) |
|---|---|
| Single process with access to everything | Each worker is born for ONE task and dies |
| One hallucination = damage anywhere | Role-scoped permissions: the token sees the minimum |
| Gigantic context, very expensive per turn | Small, fresh context per run |
| Impossible to audit: who did what? | Every event stays in the feed, auditable |

**Golden rule**: the system assumes the agent can lie. Every claim with side effects (PR opened, branch pushed) is verified against GitHub before being trusted.

---

## 4-Layer Architecture

| Layer | Technology | Function |
|---|---|---|
| **UI** | Next.js | CEO Chat, live memory feed, WorkerDock, multi-repo PR view |
| **Orchestration** | Express + Postgres | Task queue, task_events via SSE, worker runner, scheduler, RAG with pgvector |
| **Gateway** | nogal-ai | SOLE exit point to Anthropic. Daily budget per key, usage per project, model tiers |
| **Muscle** | Docker | Ephemeral Hermes workers: 512MB, half CPU, no docker socket, no host mounts |

---

## nogal-ai Gateway

**Nobody talks to the provider directly.** Everything goes through the proprietary gateway.

- **Daily budget** per key: exceeded → 429, spending stops
- **usage.jsonl**: model, tokens, USD, project
- **Tiers**: haiku / sonnet / opus
- **Fallback**: second key on 401/429

### Expensive Lesson: the lobotomizing proxy

> The OpenAI-compat endpoint **discarded the tools**. Workers narrated commands in markdown without executing anything, and reported success.
>
> ```
> # what the worker "did":
> "I ran git push and it went fine"
> # what actually happened in the real world:
> nothing.
> ```

**Fix**: native Anthropic passthrough that respects tools and streaming.

---

## Ephemeral Workers

Lifecycle:

```
SPAWN (docker run, ~5s) → HEALTH (poll 60s) → WORK (30 turns max) → PUSH (branch to fork) → TEARDOWN (rm container, always in finally)
```

**Why ephemeral**: the expensive part is tokens. The container costs 5 seconds and zero tokens. An idle worker burns 512MB and a cap slot for days. Same mental model as GitHub Actions runners: state lives in git, not in the process.

### Gotcha: the double sandbox

> Hermes inside Docker with its internal sandbox active: files **evaporated between commands**. "The file was created successfully" + `cat: No such file`. The container is already the sandbox: the internal one should be off.

---

## Git Fork Model

**Problem**: GitHub Free ignores branch rulesets on private repos. Token with write = can push to main. The only barrier would be the prompt.

**Solution**: fork model (like classic open source):
- The worker token writes **ONLY** to the mirror org fork
- The cross-repo PR is opened by the **server** with its own session
- Physically impossible to touch main of the principal repo with the worker's credentials

**Trust but verify**: the runner confirms with `git ls-remote` that the branch exists in the fork before trusting the `BRANCH-READY` report. Workers also hallucinate success reports.

---

## Token Economics (tiers)

Marker in the task title: `[haiku]`, `[sonnet]`, `[opus]`. No marker → opus (default).

| Tier | Price (in) | For |
|---|---|---|
| haiku | $0.8/MTok | Mechanical and bounded: delete dead code, rename, a single file |
| sonnet | $3/MTok | Medium refactor: multiple files, simple logic, review comments |
| opus | $15/MTok | Judgment: architecture, security, subtle bugs, ambiguous tasks |

> *"A dumb worker costs more in **human time** reviewing a bad PR than it saves in tokens."*
> 
> That's why the default is the expensive model, and the cheap one must be requested explicitly.

---

## Human-in-the-loop

The human is not a bureaucratic step: they are the **anti-loop**.

Where the human intervenes:
- **Merge**: always a person, no exceptions
- **One-shot review bot**: a PR triggers ONE review; new commits do not re-trigger (avoids infinite token loop)
- **Chat with confirmation**: breaks down the plan but waits for OK before creating tasks
- **Pipeline gates**: approval via Telegram at irreversible steps

> Two agents responding to each other is an infinite token loop. Each iteration of the cycle is closed by a person: that puts a natural ceiling on spending and damage.

---

## Shared Memory

Three systems:

1. **MCP nogal-memory**: key-value per agent + activity log. The Mac, the VPS, and Hive read/write the same store. One agent picks up where another left off.

2. **Live feed**: `pg_notify` triggers on business tables → SSE → every thought, action, and error from every worker in real time.

3. **Navigable RAG**: tasks and memories embedded with `nomic-embed` locally (Ollama) in `pgvector`. Similarity graph: each node is explained and connected.

**UI rule**: two layers. Deterministic human headline ("The worker finished and there is a PR waiting for merge") on top, technical detail collapsed below.

---

## Real Incident: the USD 10 Night

July 2026. Three bugs aligned:

1. **Agent cron with no concept of "active project"**: running every 15 min with Opus, 14 hours, with zero work to do → **55 useless runs, USD 10 burned**.

2. **Parallel tool calls**: the chat created 2 identical tasks in the same second. Both ran.

3. **Impossible task**: the token could not see the target repo → the worker burned 30 turns against 404s. And ran **twice** (due to bug 2).

> The model did its job. **The platform had the holes.**

---

## Post-mortem Fixes

Each bug became a structural defense:

| Bug | Fix |
|---|---|
| Senseless cron | Cron policy: paused when the project is not active |
| Duplicate tasks | **DB-level dedup**: partial unique index on live tasks. The race condition is cut at Postgres |
| Impossible task | **Token fail-fast**: before spawning the container, the server tests that the token CAN SEE the target repo. Fails in second 1, zero tokens |
| No cost visibility | **Per-run metering**: each worker attributes consumption to its task. On finish, real cost in the feed and DB |

> If the agent can be wrong, the defense goes where the agent **cannot reach**: DB, tokens, network.

---

## Executable Plans

The most expensive deliverable (Opus analysis) was buried as truncated text in an event. Now:

```
ANALYST (delivers plan, event kind:plan) → FEED (complete plan, markdown, with cost) → EXECUTE (button → chat, plan as context) → CHAT (breaks into tasks, with suggested tier) → HUMAN (confirms, tasks created only then)
```

> One agent analyzes, one person decides, other agents execute. Everything is measured and audited.

---

## 5 Transferable Lessons

1. **Every claim with side effects is verified against the real world.** Agents also hallucinate success.

2. **Permissions are defined by physical capability** (scoped token, fork), the prompt only accompanies.

3. **Ephemeral by default.** State lives in git and in the DB, never in the agent process.

4. **Every spent token must be attributable** to a task. What is measured, is controlled.

5. **The human closes every loop**: merge, confirmation, gates. It is the ceiling on spending and damage.

> None of this depends on the model provider. It is **platform design**.

---

## What Applies to the Cardinal System

### Direct Alignments (already in the design)

| Hive Concept | Cardinal System |
|---|---|
| Ephemeral workers (container per task) | FASE 2: one-shot agents with Podman |
| Human-in-the-loop | Cardinal foundational principle |
| API keys with scopes and budgets | FASE 2: API Key Factory |
| Single gateway for models | FASE 2: Model Router |
| RAG with vector store | FASE 1: Vault Context Service |
| Live feed | WS already implemented in FASE 0 (Agent Hub) |
| Shared memory between agents | FASE 1: Memory Store |
| Model tier per task | Not planned yet → candidate for FASE 2 |

### Lessons to Incorporate

1. **Double sandbox**: if Hermes is used inside containers, verify that the internal sandbox is off. The container IS the sandbox.

2. **Tool-calling in proxies**: if the Model Router uses an OpenAI-compat endpoint, validate that tools reach the model intact. Consider native passthrough.

3. **Task dedup**: in FASE 2, when Cardinal can create tasks, use a unique index in DB to avoid duplicates from parallel tool calls.

4. **Permission fail-fast**: before spawning a container, verify that the token/agent actually has access to what it needs.

5. **Per-run metering**: each one-shot agent must report tokens consumed and cost. The feed must show `$X.XX USD` on completion.

6. **Git fork model**: if agents will write code, the fork model is safer than trusting branch protection rules.

7. **One-shot review bot**: a PR triggers ONE review. It does not re-trigger. Avoid agent-to-agent loops.

8. **Plans as first-class nodes**: the output of an analyst agent should be executable (button → create tasks).

9. **Two-layer UI**: deterministic human headline + collapsed technical detail. Applies to the dashboard feed.

10. **Default to the expensive model**: "a dumb worker costs more in human time reviewing". Opus/default by default, cheap only when explicitly requested.

---

## Cross-references

- **Nogal Hive**: https://nogal-labs.com.ar/hive
- **AI Onboarding (same author)**: https://nogal-labs.com.ar/onboarding-ia/ (referenced in `context/ecosystem.md`)
- **Author**: Agustín Diez — github.com/agusisa

---

*Document generated from the technical talk of 2026-07-24. The lessons are transferable regardless of the stack.*

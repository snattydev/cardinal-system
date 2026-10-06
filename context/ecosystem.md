# Cardinal System — SAO Ecosystem

Cardinal System is the central backend that connects and coordinates the SAO agent ecosystem across devices (workstations, laptops, mobile terminals), managing API keys, context stores, model routing, and an SAO-themed operational dashboard. Detailed architecture, technology decisions, and delivery milestones are defined in [`../docs/vision.md`](../docs/vision.md), [`../docs/stack.md`](../docs/stack.md), and [`../docs/roadmap.md`](../docs/roadmap.md).

Principles: [`../docs/vision.md`](../docs/vision.md).

## Skins and Physical Agents

Agent identifiers (e.g., Shinon, Kirito, Asuna, Eugeo) serve as cosmetic skins or persona interfaces for agents running on physical host devices. A single physical agent runtime may present different skins depending on operational context. Cardinal registers and displays skin metadata but does not parse or enforce semantic behavior based on skins.

---

## Agent and Subagent Classification

Agents are classified on connection:
- **Subagents (`kind: "subagent"`)**: Any agent reporting `device == "localhost"` (such as one-shot ephemeral runs or internal background tasks) defaults to `subagent`. Subagents are filtered out of the primary dashboard grid by default unless explicitly configured with `kind_override` at key creation.
- **Agents (`kind: "agent"`)**: Agents connecting from external devices (e.g., PC, laptop, mobile) classify as `agent` and populate the primary Agent Hub.

---

## Agent WebSocket Protocol

Agents establish direct outbound WebSocket connections to Cardinal without requiring a specialized SDK (`examples/ws-agent.ts` provides a reference client).

- **Key as identity**: Authentication uses an OpenAI-compatible API key format (`sk-cardinal-*`). The agent presents this key in the initial `hello` payload. Cardinal verifies the SHA-256 hash stored in SQLite and resolves the agent identity directly from the key.
- **Agent-less core**: Cardinal does not spawn or initiate work on connected agents. Agents report status and query services on their own initiative.

### Protocol Flow

1. Agent connects and transmits `hello` with credentials and device metadata.
2. Cardinal verifies credentials, registers the session, and responds with `welcome`.
3. Cardinal issues a `ping` heartbeat every 30 seconds; agent returns `pong`. Unresponsive agents are marked offline after 2 missed pings.
4. Agent sends `bye` on clean shutdown.

### Message Schemas

```json
// Agent messages
-> { "type": "hello", "key": "sk-cardinal-...", "device": "pc", "status": "idle" }
<- { "type": "welcome", "agent": "shinon", "kind": "agent" }
<- { "type": "error", "reason": "auth_failed" } // Closes with code 4401
<- { "type": "ping" }
-> { "type": "pong", "status": "busy" }
-> { "type": "bye" }

// Dashboard messages (authenticated via httpOnly session cookie)
-> { "type": "subscribe" }
<- { "type": "roster", "agents": [...] }
<- { "type": "agent_update", "agent": { ... } }
```

---

## Dashboard Routes

Active routes available in the frontend dashboard:

| Route | View | Purpose |
|---|---|---|
| `/` | Overview (Agent Hub) | Active agent grid, status indicators, subagent panel |
| `/agents` | Agents Directory | Registered agent list and host device breakdown |
| `/agents/:name` | Agent Detail | Status, uptime metrics, event history, live activity |
| `/keys` | API Keys | Key generation, permission scopes, spending budgets, revocations |
| `/tasks` | Tasks Blackboard | Task creation, status lifecycle, assignment tracking |
| `/router` | Model Router | Provider health, model catalogs, route mappings, aliases |
| `/settings` | System Settings | Account details, system health check, theme configuration |

---

## SAO Visual Tokens

| Token | Specification | Application |
|---|---|---|
| Background | `#0a0e27`, `#08070c` | Deep blue-black surfaces and viewports |
| Primary Accent | `#00d4ff`, `#7ED3C1` | Luminous cyan borders, highlights, active glow |
| Secondary Accent | `#8b5cf6` | Metallic violet badges and secondary accents |
| Typography | JetBrains Mono, Inter | Monospace for metrics/telemetry; Sans for interface copy |
| Panel Geometry | Rectangular and angular panels | Fine illuminated borders, clean dividers |
| Avatars | Circular containers | Glow rings reflecting connection and operational state |

---

## Multi-Agent Architecture Lessons (Nogal Hive)

Production multi-agent architectural principles derived from field deployments. Full context: [`../docs/references/nogal-hive-charla.md`](../docs/references/nogal-hive-charla.md).

| # | Lesson | Implementation in Cardinal |
|---|---|---|
| 1 | Verify claims against the real world | Prevent hallucinated success ("PR ready") by requiring empirical verification steps for one-shot runs. |
| 2 | Permissions by physical capacity, not prompt | Enforce security via scoped keys and isolated Podman containers without host filesystem mounts. |
| 3 | Ephemeral by default | Keep state exclusively in git and the database; clean up containers with `finally: rm`. |
| 4 | Every token attributable | Meter execution per run; model router tracks and attributes token usage per key. |
| 5 | Human closes every loop | Critical actions (merges, confirmations, external gates) require human approval. |
| 6 | Double sandbox pitfall | When running agent harnesses inside containers, disable inner nested sandboxes. |
| 7 | Tool calling in proxies | Ensure OpenAI-compatible model proxy layers preserve and forward tool call schemas. |
| 8 | DB-level deduplication | Use partial unique indexes on task tables to prevent parallel duplicate task dispatches. |
| 9 | Default to high-tier models | Human review overhead outweighs token cost savings; route complex reasoning to capable models. |
| 10 | One-shot review bot | Structure automated reviews as one-shot runs per PR without recursive trigger loops. |

---

## Versioning and Status

Cardinal follows `MAJOR.FASE.PATCH` versioning. Root `package.json` is the source of truth, surfaced via `GET /api/health`.

- **Version**: `0.2.6` on `main` and on `dev` (2026-10-06). No git tags and no GitHub Actions workflows. CHANGELOG, tag, and a PATCH bump are proposed in [#47](https://github.com/snattydev/cardinal-system/issues/47). CI is proposed in [#42](https://github.com/snattydev/cardinal-system/issues/42).
- **Runtime**: TypeScript + Bun, React + Vite + Tailwind, SQLite via `bun:sqlite`. [`../docs/stack.md`](../docs/stack.md) still describes that core; the rewrite that adds MCP `:8789`, the `/v1` router, and the N1 worker is [#46](https://github.com/snattydev/cardinal-system/issues/46).
- **Phase 0 (Living Skeleton)**: Complete
- **Phase 1 (Context Store)**: Complete (v0.2.0+)
- **Phase 2 (Blackboard + MCP + Router)**: Complete on `main`. Freeze PR [#12](https://github.com/snattydev/cardinal-system/pull/12) merged 2026-09-18.
- **Phase 2.5 (Cardinal v3)**: N1 maintenance worker is on `dev` only (PR [#36](https://github.com/snattydev/cardinal-system/pull/36), 2026-10-05). The rest is planning under [#28](https://github.com/snattydev/cardinal-system/issues/28).

Detailed priorities: [`../docs/roadmap.md`](../docs/roadmap.md).

## Decisions on record

There is no ADR directory and no separate decision log. Adopted decisions below are the ones evidenced by merged PRs, specs, or code on `dev` / `main`. Items that exist only as open issues stay marked proposed.

### Adopted

- **Orchestration is commodity.** Cardinal is the brain (identity, context, blackboard, router). herdr, Hermes, and CLIs are the hands. Recorded in the [v2 architecture spec](../docs/superpowers/specs/2026-08-12-cardinal-v2-architecture.md) and shipped in the Phase 2 freeze ([PR #12](https://github.com/snattydev/cardinal-system/pull/12)).
- **The v0.2.6 freeze excludes N1.** PR #12's body states the worker is outside that merge. `main` has no `packages/worker`.
- **N1 workers are Cardinal-owned and bounded.** Ephemeral Podman containers, JSON stdin/stdout, one `sk-cardinal-*` key per run (revoked afterward). Herdr still owns CLI agents. Landed on `dev` in [PR #36](https://github.com/snattydev/cardinal-system/pull/36). Detail: [`../docs/features/2026-10-05-internal-maintenance-worker.md`](../docs/features/2026-10-05-internal-maintenance-worker.md). `POST /api/tasks` does not call the worker yet (that is N2, [#21](https://github.com/snattydev/cardinal-system/issues/21)).
- **GitHub Issues are the SDLC. The Blackboard is runtime only.** Policy: [`../AGENTS/issues.md`](../AGENTS/issues.md).
- **`Closes #N` auto-closes on `main` only.** The default branch is `main`. PR #36 merged to `dev` with `Closes #20`. The 2026-10-06 QA reported [#20](https://github.com/snattydev/cardinal-system/issues/20) still open. Housekeeping for that class of follow-up is [#49](https://github.com/snattydev/cardinal-system/issues/49).

### Proposed

These are open issues or plan items. They are not decisions already implemented on `dev` or `main`.

| Topic | Issue |
|-------|-------|
| Charge USD budgets on fusion hops | [#40](https://github.com/snattydev/cardinal-system/issues/40) |
| Require auth on `GET /v1/models` and document the catalog | [#41](https://github.com/snattydev/cardinal-system/issues/41) |
| GitHub Actions, wider typecheck, lint | [#42](https://github.com/snattydev/cardinal-system/issues/42) |
| Rate-limit login, chat completions, and WS auth | [#43](https://github.com/snattydev/cardinal-system/issues/43) |
| Forward the caller Bearer on MCP RAG search | [#44](https://github.com/snattydev/cardinal-system/issues/44) |
| Deploy headers, non-root `USER`, pinned image digests | [#45](https://github.com/snattydev/cardinal-system/issues/45) |
| Rewrite [`docs/stack.md`](../docs/stack.md) | [#46](https://github.com/snattydev/cardinal-system/issues/46) |
| CHANGELOG, tag `v0.2.6`, PATCH bump on `dev` | [#47](https://github.com/snattydev/cardinal-system/issues/47) |
| Enforce board and mailbox scopes | [#48](https://github.com/snattydev/cardinal-system/issues/48) |
| Post-QA housekeeping (including manual close of #20) | [#49](https://github.com/snattydev/cardinal-system/issues/49) |
| English-only sweep | [#31](https://github.com/snattydev/cardinal-system/issues/31) |
| Playwright for `/keys` and `/router` | [#18](https://github.com/snattydev/cardinal-system/issues/18) |
| N9 wrapper hops internal-only | [#26](https://github.com/snattydev/cardinal-system/issues/26) |
| Remaining Cardinal v3 (N2 and after) | [#28](https://github.com/snattydev/cardinal-system/issues/28) |

The v3 plan also still proposes Tasks v2, the `/vaults` monolith, the cockpit, and in-app notifications. Target `v0.3.0` after N1+N2+N3 is a plan target, not a released version. See [`../docs/superpowers/plans/2026-09-07-cardinal-v3-backlog.md`](../docs/superpowers/plans/2026-09-07-cardinal-v3-backlog.md).

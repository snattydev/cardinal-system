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

Cardinal follows `MAJOR.FASE.PATCH` versioning (e.g. `0.2.7`), with root `package.json` acting as the source of truth, surfaced via `GET /api/health`.

- **Current Status**: `v0.2.7`
- **Phase 0 (Living Skeleton)**: Complete
- **Phase 1 (Context Store)**: Complete
- **Phase 2 (Blackboard + MCP + Router)**: Complete (`v0.2.6`)
- **Context Hub v2 (Stage 1)**: Shipped (`v0.2.7` on `main`; 30-day usage gate active in `#62`)

Detailed milestone tracking and phase deliverables are maintained in [`../docs/roadmap.md`](../docs/roadmap.md).

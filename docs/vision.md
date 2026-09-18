# Cardinal System — Vision and Goals

> Why this project exists. For new agents that need the "big picture."

---

## What it is

**Cardinal System** is the central backend of the SAO ecosystem — a TypeScript + Bun monolith that:

- Connects agents regardless of where they live (PC, laptop, phone)
- Provides centralized context (memory, RAG, history)
- Routes models (`POST /v1/chat/completions`) as a Phase 2 capability in service of the brain
- Issues API keys with scopes, budgets, and failsafes
- Handles human authentication and access
- Exposes a web dashboard with Sword Art Online aesthetic
- Eventually: knowledge graph, automations, cron

---

## Final goal

That any SAO agent — new or existing — does automatic onboarding:

```
New agent → connects to Cardinal → receives:
  ├── Its SOUL (personality)
  ├── Its skills (capabilities)
  ├── Its memory (historical context)
  ├── Access to vault RAG
  └── An API key with budget
```

Without configuring anything by hand. Cardinal is the source of truth.

---

## Principles

- **Modular** — each piece interchangeable, without forced coupling
- **Human-in-the-loop** — the final word is always the human's
- **SSOT Core** — Cardinal is the 24/7 Single Source of Truth for identity, routing, and memory
- **Division of Labor** — lightweight maintenance workers inside; persistent coding agents in Herdr; ephemeral CLI tools on workstations
- **SAO aesthetic** — consistent visual identity (Aincrad Orange, Sinon Turquoise, Underworld Purple, Slash Red on Obsidian/Graphite)
- **Security first** — nothing exposed without auth, keys with path-level scopes and USD budgets

---

## Architecture Topology (24/7 Server Target)

```
┌─────────────────────────────────────────────────────────┐
│                   SERVER CARDINAL 24/7                  │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │               CARDINAL CORE (Monolith)            │  │
│  │  ├── Router LLM (/v1) + Key Factory               │  │
│  │  ├── Memory Monolith (/vaults .md + RAG + ACL)     │  │
│  │  ├── Blackboard / Tasks Engine                     │  │
│  │  ├── MCP Hub (:8789)                              │  │
│  │  └── Dashboard Web (SAO Cockpit + Herdr View)     │  │
│  └────────┬──────────────────────┬───────────────────┘  │
│           │ (ephemeral spawns)   │ (via MCP / Router)   │
│           ▼                      ▼                      │
│  ┌─────────────────┐    ┌────────────────────────────┐  │
│  │ Internal Workers│    │ Container HERDR            │  │
│  │ (Podman 1-shot) │    │ (Persistent SAO Agents:    │  │
│  │ Maintenance/MCP │    │  Kirito, Lisbeth, Agil)    │  │
│  └─────────────────┘    └──────────────▲─────────────┘  │
└────────────────────────────────────────┼────────────────┘
                                         │ (SSH / Web TUI)
┌────────────────────────────────────────┴─────┐
│ WORKSTATION / LAPTOP (Shuts down)            │
│  ├── External Agents (Cursor, Claude, CLIs)  │
│  └── Web Cockpit Browser                     │
└──────────────────────────────────────────────┘
```

### Agent Classification

1. **Internal Workers:** Ephemeral containers run by Cardinal for routine system maintenance, summarization, and memory hygiene. Lightweight Bun runtime + MCP client, bounded by ephemeral `sk-cardinal-*` keys.
2. **Persistent Role Agents:** Long-running agents (Kirito, Lisbeth, Agil) hosted in a separate Herdr container on the server. Identified by persistent `sk-cardinal-*` keys, supervised via SSH or web TUI, handling heavy development and critical PRs.
3. **External Ephemeral Agents:** Workstation-bound agents (Cursor, Claude Code, local CLIs) that consume Cardinal Router and MCP as needed and stop when the workstation powers down.

---

## Non-goals (what it is NOT)

- A generic commercial model router (Cardinal provides `POST /v1/chat/completions` in service of the ecosystem)
- A general-purpose task manager for human projects (tasks serve internal system coordination)
- A replacement for Hermes Agent or Herdr (Herdr remains the sovereign host for interactive CLI agents)
- A SaaS product — personal sovereign infrastructure
---

## Where everything is

| Resource | Location |
|----------|----------|
| Development rules | [`AGENTS.md`](../AGENTS.md) |
| Technical stack | [`docs/stack.md`](stack.md) |
| Security | [`docs/security.md`](security.md) |
| Roadmap | [`docs/roadmap.md`](roadmap.md) |
| SAO ecosystem | [`context/ecosystem.md`](../context/ecosystem.md) |
| Specs per phase | [`docs/superpowers/specs/`](superpowers/specs/) |

---

*Updated: 2026-09-10.*

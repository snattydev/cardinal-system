# Cardinal System — Vision and Goals

> Why this project exists. For new agents that need the "big picture."

---

## What it is

**Cardinal System** is the central backend of the SAO ecosystem — a TypeScript + Bun monolith that:

- Connects agents regardless of where they live (PC, laptop, phone)
- Provides centralized context (memory, RAG, history)
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
- **Agent-less core** — Cardinal does not need to know what an agent is; it just serves context
- **SAO aesthetic** — consistent visual identity across the dashboard
- **Security first** — nothing exposed without auth, keys with limits

---

## Non-goals (what it is NOT)

- A model router (although it includes one)
- A monitoring dashboard (although it has one)
- A task orchestrator (agents self-manage)
- A replacement for Hermes Agent
- A SaaS product — it is personal infrastructure

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

*Updated: 2026-07-28.*

# Cardinal System — Vision and Goals

> Why this project exists. For agents and contributors that need the big picture.

---

## What it is

**Cardinal System** is the **Sovereign Context Policy Plane + SAO Cockpit** for personal AI agents — a TypeScript + Bun core that:

- Authenticates agents across devices (`sk-cardinal-*` keys with scopes, budgets, and expiry)
- Enforces path-glob ACLs over Markdown knowledge vaults (read-only vaults vs. isolated writable agent state, with `personal/**` denied by default)
- Serves progressive-disclosure onboarding (`coding` and `hermes` modes), hybrid/BM25 search (built-in SQLite FTS5 + optional QMD sidecar), and sandboxed cross-session handoffs via Streamable HTTP MCP (`:8789`)
- Measures real MCP usage (`mcp_usage`) to gate future work behind demonstrated daily utility
- Retains an optional human dashboard (SAO aesthetic), blackboard/mailbox APIs, and legacy router/key management

---

## Final goal

Any agent harness — stateless coding CLI or persistent assistant — connects to one MCP endpoint with a scoped key and immediately receives only the context it is permitted to see:

```text
Agent harness → Streamable HTTP MCP (Bearer sk-cardinal-*) → receives:
  ├── Deterministic onboarding packet (conduct rules, mode setup, topic map)
  ├── Scoped hybrid/BM25 search & bounded markdown reads (:ro vaults)
  ├── Sandboxed handoffs & skill proposals (:rw isolated agent-state)
  └── Hard server-side denial on personal/** and unauthorized paths
```

---

## Principles

- **Compose commodities, guard sovereignty** — orchestration, routing, and TUIs live in commodity tools (T3 Code, Hermes, QMD, optional Bifrost); Cardinal focuses on identity, vault ACLs, and anti-inflation memory hygiene
- **Physical R/W separation** — source vaults mount `:ro`; agent writes land in an isolated `:rw` directory (`agent-state`) for human review
- **Progressive disclosure** — return compact topic maps and bounded snippets first, never dump entire vaults into context
- **Human-in-the-loop** — the human approves skill proposals, merges, and external gates
- **Usage-gated evolution** — track real calls (`mcp_calls_7d` / `mcp_calls_30d`) before investing in Stage 2 features
- **Security first** — fail-closed auth, path-glob ACLs, symlink-escape rejection, zero secrets or personal host paths in code

---

## Architecture Topology (Context Hub v2)

```text
  Workstation / Mobile / VPS Agents (T3 Code, Claude Code, Codex, Cursor, OpenCode, Hermes)
                    │  Streamable HTTP MCP (:8789, Bearer sk-cardinal-*)
                    ▼
  ┌──────────────────────────────────────────────────────────┐
  │                 CARDINAL POD (Podman)                    │
  │                                                          │
  │  ┌──────────────────────┐    ┌────────────────────────┐  │
  │  │ cardinal-mcp (:8789) │───▶│ cardinal-backend (:8787│  │
  │  │ • @modelcontextproto │    │ • Key validation       │  │
  │  │ • Path-glob ACL      │    │ • SQLite (keys/usage)  │  │
  │  │ • FTS5 search        │    │ • Scoped board/mailbox │  │
  │  │ • Onboard + Writer   │    └────────────────────────┘  │
  │  └──────────┬───────────┘                                │
  │             │ (optional --profile qmd)                   │
  │             ▼                                            │
  │  ┌──────────────────────┐    Mounts:                     │
  │  │ cardinal-qmd (:8181) │    • /data/vaults (:ro)        │
  │  │ • Hybrid GGUF search │    • /data/agent-state (:rw)   │
  │  └──────────────────────┘                                │
  └──────────────────────────────────────────────────────────┘
```

---

## Non-goals (what it is NOT)

- An agent container orchestrator or CLI spawner (delegated to T3 Code / Hermes / herdr)
- A commercial or general-purpose multi-tenant SaaS LLM gateway (legacy `/v1` router is frozen; use BYO subscriptions or a Bifrost sidecar if needed)
- A replacement for interactive coding harnesses — Cardinal is the context policy boundary

---

## Where everything is

| Resource | Location |
|----------|----------|
| Development rules | [`AGENTS.md`](../AGENTS.md) |
| Context Hub v2 feature spec | [`docs/features/2026-11-25-mcp-context-hub-v2.md`](features/2026-11-25-mcp-context-hub-v2.md) |
| Roadmap & usage gate | [`docs/roadmap.md`](roadmap.md) |
| Security model | [`docs/security.md`](security.md) |
| Technical stack | [`docs/stack.md`](stack.md) |
| SAO ecosystem | [`context/ecosystem.md`](../context/ecosystem.md) |

---

*Updated: 2026-11-25.*

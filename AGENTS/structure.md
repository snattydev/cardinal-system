# Repository Structure

Canonical repo layout. Any structural change (moving/renaming packages) must be reflected here.

```
cardinal-system/
├── .cursor/
│   ├── agents/              Cursor subagent adapters
│   └── rules/
├── .opencode/
│   ├── agents/              legacy agents
│   └── commands/
├── packages/                  Bun workspaces (internal packages)
│   ├── core/                  shared types, config, zod schemas
│   ├── auth/                  JWT sign/verify, login, logout
│   ├── keys/                  generation, hash, revocation
│   ├── ws/                    protocol, hub, messages
│   ├── db/                    schema, migrations, queries
│   ├── router/                model routing (Phase 2)
│   └── mcp/                   MCP hub (Phase 2)
├── backend/
│   └── src/                   composition: server, api handlers, static serve
├── frontend/
│   └── src/                   React + Vite + Tailwind v4
├── examples/
│   └── ws-agent.ts            reference WS client (not an SDK)
├── deploy/
│   ├── Containerfile
│   ├── Caddyfile.example
│   └── quadlet/
├── docs/
│   ├── features/              documentation of completed features
│   ├── agents/                SOULs, prompts, canonical roles, checklists
│   │   ├── prompts/
│   │   ├── roles/             canonical roles (agnostic)
│   │   └── cursor-workflow.md delegation in Cursor
│   ├── guides/                live manuals (router, etc.)
│   ├── sprints/               sprint logs (historical record)
│   ├── roadmap/               detail per phase
│   ├── superpowers/
│   │   ├── specs/             design specs per phase
│   │   └── plans/             implementation plans
│   ├── references/            talks, papers, external architectures
│   ├── cronjobs.md            planned cronjobs
│   ├── skills.md              planned skills
│   ├── stack.md               technical stack
│   ├── security.md            security model
│   ├── vision.md              vision and principles
│   └── roadmap.md             live priorities
├── skills/                    Hermes skills for Cardinal development
├── AGENTS/                    development rules (split by topic)
├── AGENTS.md                  rules index (this file)
├── README.md
└── package.json               workspaces + version source of truth
```

## Trackers

- Planned and pending skills → [`docs/skills.md`](../docs/skills.md)
- Cronjobs planned per phase → [`docs/cronjobs.md`](../docs/cronjobs.md)

## Active skills

- `cardinal-dev` — Full development workflow (branching, commits, PRs, versioning, TDD, review). Index.
- `cardinal-commit` — Commit format: conventional commits, types, scope, examples.
- `cardinal-pr` — Create a PR step by step: branch → bump → commit → push → template → reviewers.

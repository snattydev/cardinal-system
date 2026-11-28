# Repository Structure

Canonical repo layout. Any structural change (moving/renaming packages) must be reflected here.

```
cardinal-system/
├── .cursor/
│   ├── agents/              Cursor subagent adapters
│   └── rules/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── REVIEW_TEMPLATES/    PR report templates (quick, bug-finder, deep)
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── workflows/ci.yml     CI verification (typecheck, test, build)
├── .opencode/
│   ├── agents/              legacy agents
│   └── commands/
├── packages/                  Bun workspaces (internal packages)
│   ├── core/                  shared types, config, zod schemas
│   ├── auth/                  JWT sign/verify, login, logout, rate-limit
│   ├── keys/                  generation, hash, revocation
│   ├── ws/                    protocol, hub, messages
│   ├── db/                    schema, migrations, queries
│   ├── rag/                   legacy RAG client/scope helper
│   ├── router/                model routing (Phase 2, frozen)
│   ├── mcp/                   Streamable HTTP MCP Context Hub (ACL, FTS5/QMD, bootstrap, config tools)
│   └── worker/                internal maintenance worker (N1, frozen)
├── backend/
│   └── src/                   composition: server, api handlers, static serve
├── frontend/
│   └── src/                   React + Vite + Tailwind v4
├── examples/
│   └── ws-agent.ts            reference WS client (not an SDK)
├── deploy/
│   ├── Caddyfile
│   ├── Caddyfile.example
│   ├── Containerfile
│   ├── Containerfile.frontend
│   ├── Containerfile.mcp
│   ├── Containerfile.qmd
│   ├── Containerfile.worker
│   ├── env.example
│   ├── nginx.conf
│   ├── quadlet/                systemd units (pod, backend, frontend, mcp, caddy, data volume)
│   └── README.md
├── docs/
│   ├── features/              documentation of completed features
│   ├── agents/                SOULs, prompts, canonical roles, checklists
│   │   ├── prompts/           one-shot prompts (standard, security, quick, bug-finder)
│   │   │   ├── standard-review.md
│   │   │   ├── security-review-checklist.md
│   │   │   ├── quick-review.md
│   │   │   └── bug-finder.md
│   │   ├── roles/             canonical roles (agnostic)
│   │   │   ├── bug-finder.md
│   │   │   ├── builder.md
│   │   │   ├── docs.md
│   │   │   ├── frontend.md
│   │   │   ├── herdr-dispatcher.md
│   │   │   ├── reviewer.md
│   │   │   ├── security-reviewer.md
│   │   │   ├── tester.md
│   │   │   ├── verifier.md
│   │   │   └── ws-protocol.md
│   │   └── cursor-workflow.md delegation in Cursor
│   ├── guides/                live manuals (router, pitfalls)
│   ├── sprints/               sprint logs (historical record)
│   ├── roadmap/               detail per phase
│   ├── superpowers/
│   │   ├── specs/             design specs per phase
│   │   └── plans/             implementation plans
│   ├── references/            talks, papers, external architectures
│   ├── cronjobs.md            planned cronjobs
│   ├── skills.md              skill inventory
│   ├── stack.md               technical stack
│   ├── security.md            security model
│   ├── api.md                 REST + WS reference
│   ├── vision.md              vision and principles
│   └── roadmap.md             live priorities
├── .agents/
│   └── skills/              auto-discovered repo-local skills (synced from skills/)
├── .githooks/               enforced pre-commit & commit-msg hooks (core.hooksPath)
├── context/                   ecosystem knowledge base (context/ecosystem.md, agents/)
├── scripts/                   operational scripts (password bootstrap, config sync, keygen helpers, tests)
├── skills/                    Cardinal skills (source of truth; sync out to .agents/skills & Hermes)
├── AGENTS/                    development rules (split by topic)
├── AGENTS.md                  rules index (this file)
├── CHANGELOG.md               release history (Keep a Changelog)
├── LICENSE                    MIT license
├── SECURITY.md                vulnerability disclosure and hardening checklist
├── compose.yaml               local Podman dev stack (backend, frontend, mcp, optional qmd)
├── README.md
└── package.json               workspaces + version source of truth
```

## Trackers

- Skill inventory → [`docs/skills.md`](../docs/skills.md)
- Cronjobs planned per phase → [`docs/cronjobs.md`](../docs/cronjobs.md)

## Active skills

- `cardinal-dev` — index into `AGENTS.md` and the skills below.
- `cardinal-commit` — commit format: conventional commits, English subject and body.
- `cardinal-pr` — create a PR: branch → bump → commit → push → template → reviewers.
- `cardinal-system` — runtime URLs; pointers to `docs/api.md` and `docs/guides/pitfalls.md`.
- `cardinal-standards` — canonical personal-repo standards blueprint & hooks.

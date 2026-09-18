# OpenCode Multi-Agent QOL — Design

> OpenCode agent, command, and MCP setup for developer onboarding in Cardinal System.
> Cursor (Grok 4.5) as visual orchestrator; OpenCode CLI for implementation with subagents.

---

## Usage Architecture

```
Cursor + Grok 4.5              OpenCode CLI
(visual orchestrator)          (implementation)
        │                            │
        ├── Planning, review         ├── builder (implements)
        ├── Large refactors          ├── tester (TDD)
        │                            ├── reviewer (code review)
        │                            └── docs (documentation)
        │                            │
        └──────── AGENTS.md ─────────┘
              .cursor/rules/cardinal.mdc
```

The developer chooses based on the task:
- **Cursor**: planning complex features, visual code review, multi-file refactors
- **OpenCode**: concrete implementation with `/feature`, TDD with `/test`, quick review with `/review`

Both share rules via `AGENTS.md` and `.cursor/rules/`.

---

## Files Created

```
cardinal-system/
├── .opencode/                       # NEW
│   ├── agents/
│   │   ├── orchestrator.md          # Primary agent: deepseek-v4-pro
│   │   ├── builder.md               # Subagent: implementation
│   │   ├── tester.md                # Subagent: TDD
│   │   ├── reviewer.md              # Subagent: code review read-only
│   │   └── docs.md                  # Subagent: documentation
│   └── commands/
│       ├── feature.md               # /feature complete workflow
│       ├── review.md                # /review code review
│       ├── test.md                  # /test TDD workflow
│       └── deploy.md                # /deploy build + verify
├── .cursor/
│   └── rules/
│       └── cardinal.mdc             # NEW — Cursor rules for Grok 4.5
```

## Files Modified

- `opencode.json` — expanded with model, default_agent, MCPs, permissions, instructions
- `AGENTS.md` — new sections: Swarm Workflow, Agent Roles, Delegation Rules, Cursor Section, OpenCode Config Reference

---

## OpenCode Agents

### `orchestrator` (primary, `deepseek-v4-pro`)

Coordinates subagents. Does not write code — delegates implementation to builder, tests to tester.
Uses superpowers skills (`dispatching-parallel-agents`, `subagent-driven-development`, etc.).

**Permissions:** read-only on code, scoped bash (safe commands only), `permission.task` allows invoking builder, tester, reviewer, docs.

### `builder` (subagent, inherits primary model)

Implements features following specs from the orchestrator. Stack: TypeScript + Bun, native WebSocket, SQLite.
Does not add extra functionality, only what is specified. Containerized — does not install native dependencies.

**Permissions:** edit on `packages/**`, `backend/**`, `frontend/**`, `tests/**`.

### `tester` (subagent, inherits primary model)

Strict TDD: RED → GREEN → REFACTOR. Writes tests first.
Covers critical branches (auth, keys, ws, db, router).

**Permissions:** edit on `**/*.test.ts`, bash for `bun test`.

### `reviewer` (subagent, inherits primary model)

Read-only code review. Focused on security, performance, style, edge cases.
Structured output: CRITICAL / HIGH / LOW.

**Permissions:** read-only, no edit or destructive bash.

### `docs` (subagent, inherits primary model)

Technical documentation in `docs/features/`. Follows repo conventions: what, why, decisions, alternatives, files.

**Permissions:** edit on `docs/**`, `README.md`.

---

## Custom Commands

### `/feature "description"`

Complete workflow: orchestrator decomposes → @tester (RED) → @builder (GREEN + REFACTOR) → verify → @reviewer → @docs → suggests commit.

### `/review`

@reviewer analyzes diff against `dev`. Reports bugs, security, style, suggestions.

### `/test [path]`

@tester writes test for the module, runs it (must fail), suggests @builder for implementation.

### `/deploy`

Build with Bun → tests → build container with Podman → verify healthcheck.

---

## MCP Servers

Only the GitHub MCP is configured explicitly. The `"mcp__*": "deny"` rule in permissions blocks any external MCP from global or remote config. Adding a new MCP is an entry in `opencode.json` → `mcp` plus removing its namespace from the deny list.

Deferred MCPs: SQLite (redundant, agents use `bun:sqlite`), Cardinal API (overkill, backend is local `bun run`), Podman (direct bash is sufficient).

---

## `opencode.json` (replaces the current one)

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "model": "openrouter/deepseek/deepseek-v4-flash",
  "default_agent": "orchestrator",
  "subagent_depth": 2,
  "instructions": ["AGENTS.md", ".cursor/rules/*.mdc"],
  "permission": {
    "bash": {
      "sudo *": "deny",
      "rm -rf /*": "deny"
    },
    "*": "allow",
    "mcp__*": "deny"
  },
  "mcp": {
    "github": {
      "type": "local",
      "command": ["npx", "-y", "@anthropic/mcp-server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "{env:GITHUB_TOKEN}" }
    }
  },
  "tools": {
    "ZerrantHive_*": false,
    "pencil_*": false
  }
}
```

---

## AGENTS.md — Additions

New sections appended to the file (without modifying existing content):

1. **Swarm Workflow** — when to use `/feature` vs direct. 1–2 file features → direct; features with dependencies → `/feature`.
2. **Agent Roles Table** — quick reference for the 5 agents.
3. **Delegation Rules** — what the orchestrator delegates. The orchestrator does not write code; it only coordinates, verifies, and commits.
4. **Cursor Section** — Grok 4.5 in Composer as visual orchestrator; when to use each tool.
5. **OpenCode Config Reference** — paths and how to extend.

---

## `.cursor/rules/cardinal.mdc`

Rules file for Cursor with glob pattern frontmatter. Grok 4.5 in Composer loads it as context. Contains stack, conventions, and guidance on when to use Cursor vs OpenCode.

---

## Extensibility

- **New agent:** create `.opencode/agents/<name>.md` with frontmatter + system prompt
- **New command:** create `.opencode/commands/<name>.md`
- **New MCP:** add entry in `opencode.json` → `mcp`, remove its namespace from the permissions deny list
- **New Cursor rule:** create `.cursor/rules/<name>.mdc`

---

## References

- [OpenCode Agents Docs](https://opencode.ai/docs/agents/)
- [OpenCode Config Docs](https://opencode.ai/docs/config/)
- [OpenCode MCP Servers Docs](https://opencode.ai/docs/mcp-servers/)
- [`docs/guides/opencode-orchestration-plan.md`](../guides/opencode-orchestration-plan.md) — original plan that inspired this design

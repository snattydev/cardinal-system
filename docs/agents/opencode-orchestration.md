# OpenCode Orchestration (legacy)

OpenCode CLI is still available as an alternative path. **It is not the daily path** — the daily path is Cursor (see [`cursor-workflow.md`](./cursor-workflow.md)). This doc stays as a reference for whoever already has a workflow set up in OpenCode.

## Config

- Config: root `opencode.json` (default model, default_agent, subagent_depth, permissions, MCPs).
- Agents: `.opencode/agents/<name>.md` (frontmatter + system prompt).
- Commands: `.opencode/commands/<name>.md`.

## Setup

Verify the full setup:

```bash
bash scripts/verify-dev-setup.sh   # agents, rules, config
```

## Extending

- New agent → file in `.opencode/agents/`.
- New command → `.opencode/commands/`.
- New MCP → entry in `opencode.json` → `mcp` + remove its namespace from `deny`.

The GitHub MCP requires `GITHUB_TOKEN` in the environment:

```bash
set -x GITHUB_TOKEN (gh auth token)   # fish
```

## Global MCPs

Global MCPs (`ZerrantHive_*`, `pencil_*`) are disabled in this project.

## Active commands

- `/feature` — implement a feature with TDD.
- `/test` — TDD tests.
- `/review` — code review.

See the detail of each in `.opencode/commands/`.

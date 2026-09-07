# Commits

Conventional Commits. Examples and pre-commit checks: `skills/cardinal-commit.md`.

## Format

```
<type>(<scope>): <short description in English>

<Body in English: what and why, not how>
```

## Types

| Type | When |
|------|------|
| `feat` | New functionality |
| `fix` | Bug fix |
| `chore` | Maintenance (bump, config, build) |
| `docs` | Docs only |
| `refactor` | Code change without feat or fix |
| `test` | Add or modify tests |
| `style` | Formatting, linting, whitespace |

## Repo rules

1. First line ≤ 72 chars, in English.
2. Body in English — explain *what* and *why*. Code comments and identifiers in the same change are English too (`AGENTS/docs.md`).
3. If it closes an issue: `Closes #N` at the end of the body.
4. One commit = one logical change. Do not mix feat with fix.
5. **Authorship:** the commit uses the GitHub user (`git config user.name` / `user.email`), not the agent. All agents inherit the owner's identity.
6. No agent watermarks or `Co-authored-by` trailers for coding agents.

## Minimal example

```
feat(ws): add agent heartbeat with ping/pong protocol

Keep-alive over WebSocket. 30s interval, 2 missed pings
disconnect the agent and emit agent_update to the dashboard.
```

Full reference: [`skills/cardinal-commit.md`](../skills/cardinal-commit.md).

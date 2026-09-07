# Commits

Conventional Commits. Minimum repo rules. The detailed guide with examples and pre-commit verification lives in the `cardinal-commit` skill.

## Format

```
<type>(<scope>): <short description in English>

<Body in Spanish: what and why, not how>
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
2. Body in Spanish — explain *what* and *why*.
3. If it closes an issue: `Closes #N` at the end of the body.
4. One commit = one logical change. Do not mix feat with fix.
5. **Authorship:** the commit uses the name and email of the GitHub user (`git config user.name` / `user.email`), not the agent's. All agents inherit the owner's identity.

## Minimal example

```
feat(ws): add agent heartbeat with ping/pong protocol

Implementación del keep-alive sobre WebSocket. 30s de intervalo,
2 pings perdidos = desconexión. Evento emitido al dashboard.
```

Full reference: [`skills/cardinal-commit.md`](../skills/cardinal-commit.md).

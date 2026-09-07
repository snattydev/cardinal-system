---
name: cardinal-commit
description: Commit format and flow for Cardinal System — conventional commits, language, scope, examples, pre-commit verification.
category: development
---

# Cardinal System — Commits

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

## Scope

Optional but recommended. Main module or file:

```
feat(ws): add agent heartbeat
fix(auth): reject expired JWT
chore(deps): update bun to 1.2.0
docs(agents): add review workflow
```

## Rules

1. First line ≤ 72 chars, in English.
2. Body in Spanish — explain *what* and *why*.
3. Separate subject from body with a blank line.
4. If it closes an issue: `Closes #N` at the end of the body.
5. One commit = one logical change. Do not mix feat with fix.
6. **Authorship:** the commit must use the name and email of the GitHub user (`git config user.name` / `user.email`), not the agent's. All agents inherit the owner's identity.

## Examples

Good:

```
feat(ws): add agent heartbeat with ping/pong protocol

Implementación del keep-alive sobre WebSocket. El Cardinal
envía ping cada 30s y espera pong. Si fallan 2 pings
consecutivos, el agente se marca offline en el dashboard
y se emite evento agent_update a los suscriptores.
```

```
fix(auth): return 401 instead of 500 on expired JWT

El middleware tiraba 500 genérico. Ahora verifica exp
explícitamente y responde 401 con mensaje descriptivo.
```

Bad:

```
fix stuff
```

```
feat(ws): add agent heartbeat with ping/pong protocol. Implementación del keep-alive...
```

## Pre-commit verification

```bash
# Audit leaks
git diff --cached | grep -iE '(sk-|api_key|token|secret|password|BEGIN.*PRIVATE)'

# Verify format
git log -1 --pretty=format:"%s" | grep -E '^(feat|fix|chore|docs|refactor|test|style)(\(.+\))?: .{1,72}'
```

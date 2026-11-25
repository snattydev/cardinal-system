---
name: cardinal-commit
description: Commit format for Cardinal System — conventional commits, English subject and body, scope, examples, pre-commit checks.
category: development
---

# Cardinal System — Commits

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
2. Body in English — explain *what* and *why*. Code comments and identifiers in the same change are English too (`AGENTS/docs.md`).
3. Blank line between subject and body.
4. If it closes an issue: `Closes #N` at the end of the body.
5. One commit = one logical change. Do not mix feat with fix.
6. Authorship is the GitHub user (`git config user.name` / `user.email`), never the agent.
7. No `Generated with` / coding-agent `Co-authored-by` trailers.

## Examples

Good:

```
feat(ws): add agent heartbeat with ping/pong protocol

Keep-alive over WebSocket. Cardinal sends ping every 30s and
expects pong. Two consecutive misses mark the agent offline
and emit agent_update to subscribers.
```

```
fix(auth): return 401 instead of 500 on expired JWT

The middleware returned a generic 500. It now checks exp
explicitly and responds 401 with a descriptive error.
```

Bad:

```
fix stuff
```

```
feat(ws): add agent heartbeat with ping/pong protocol. Keep-alive over WebSocket...
```

## Pre-commit verification

```bash
git diff --cached | grep -iE '(sk-|api_key|token|secret|password|BEGIN.*PRIVATE)'

git log -1 --pretty=format:"%s" | grep -E '^(feat|fix|chore|docs|refactor|test|style)(\(.+\))?: .{1,72}'

git log origin/dev..HEAD --format='%B' | grep -iE 'generated with|co-authored-by.*(cursor|copilot|claude|openai|anthropic|aider)|cursor\.com' || true
```

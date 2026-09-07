---
name: cardinal-pr
description: Create a Pull Request in Cardinal System — branch, version bump, commit, push, open PR, fill template, assign reviewers.
category: development
---

# Cardinal System — Create a Pull Request

## Fundamental rule

The orchestrator opens PRs, the human merges them. Never auto-merge.

---

## Full flow

### 1. Branch

```bash
git checkout dev
git pull origin dev
git checkout -b <type>/<desc>
```

Types: `feat/`, `fix/`, `chore/`, `docs/`.

### 2. Changes

- Delegate implementation to a one-shot subagent.
- Verify the result: files, coherence, leaks.
- Document at `docs/features/` (create the `.md`).

### 3. Version bump

**Only if the PR is to `main`.** For PRs to `dev`, do not touch the version.

```bash
# Evaluate which bump based on accumulated changes:
# PATCH: fixes, security, docs, chores   → 0.0.2 → 0.0.3
# MINOR: new features                    → 0.0.3 → 0.1.0
# MAJOR: breaking changes                → 0.1.0 → 1.0.0

# Edit package.json → "version": "X.Y.Z"
```

Repo rule: the format is `MAJOR.FASE.PATCH`. FASE is bumped only in the PR `dev → main`; in `dev` only PATCH.

### 4. Commit

```
<type>(<scope>): <short in English>

<Body in Spanish: what and why.>
```

Example:

```
feat(ws): add agent heartbeat with ping/pong protocol

Health check sobre WebSocket con 30s de intervalo. 2 pings
perdidos marcan al agente como offline en el dashboard.
```

### 5. Push and PR

```bash
git push -u origin <branch>
gh pr create --base dev --title "<title>" --body "$(cat .github/PULL_REQUEST_TEMPLATE.md)"
```

- PR always to `dev`, **never** directly to `main`.
- The PR to `main` happens only when `dev` is stable.

### 6. Template

Fill it with `.github/PULL_REQUEST_TEMPLATE.md`. Executive summary — the detail goes in the feature doc.

### 7. Reviewers

| PR to | Reviewers |
|-------|-----------|
| `dev` | None — direct merge |
| `main` | Standard Review (required), Security Review (if changes in `auth/`, `keys/`, `ws/`, protocol) |

---

## Pre-PR verifications

- [ ] Branch created from updated `dev`.
- [ ] No leaks: `git diff dev..HEAD | grep -iE '(sk-|api_key|token|secret|password|BEGIN.*PRIVATE)'`.
- [ ] Version bump if applicable (only PR to `main`).
- [ ] Commit message in conventional commits format, body in Spanish.
- [ ] PR template filled.
- [ ] Doc at `docs/features/` created.
- [ ] PR targets `dev` (not `main`).
- [ ] Skills synced: `bash skills/sync-skills.sh`.

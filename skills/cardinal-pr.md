---
name: cardinal-pr
description: Create a Pull Request in Cardinal System — branch, version bump, commit, push, template, reviewers.
category: development
---

# Cardinal System — Create a Pull Request

The orchestrator opens PRs. The human merges `dev → main`. Never auto-merge.

Policy (checklist, merge strategy, reviewers): `AGENTS/prs.md`. This skill is the command sequence.

## Flow

### 1. Branch

```bash
git checkout dev
git pull origin dev
git checkout -b <type>/<desc>
```

Types: `feat/`, `fix/`, `chore/`, `docs/`.

### 2. Changes

- Implement (or delegate), then verify files, coherence, leaks.
- Document at `docs/features/<date>-<name>.md` when the change is significant.

### 3. Version bump

Format is `MAJOR.FASE.PATCH` (`package.json`). See `AGENTS/versioning.md`.

- PR to `dev`: PATCH only, and only if the change warrants it. Do not bump FASE.
- PR `dev → main`: bump FASE if the previous phase closed; otherwise leave FASE unchanged.

### 4. Commit

Use `cardinal-commit`. English subject and body.

### 5. Push and PR

```bash
git push -u origin <branch>
gh pr create --base dev --title "<title>" --body "$(cat .github/PULL_REQUEST_TEMPLATE.md)"
```

- Feature work always targets `dev`, never `main`.
- `dev → main` only when `dev` is stable. If a `dev → main` PR already exists, edit that PR instead of opening a second one.

If local `HEAD` is many unique commits ahead of `origin/dev`, split into staged PRs and get approval before pushing everything.

### 6. Reviewers

All PRs follow the three-tier review workflow in `AGENTS/prs.md`:

| PR to | Reviewers |
|-------|-----------|
| `dev` | Quick Review + Bug Finder (required; same-family fast models allowed); Cross-Family Deep Review required for orchestrated wave/feature PRs, security-sensitive paths (`auth/`, `keys/`, `ws/`, `protocol`, `deploy/`, `packages/mcp/src/acl.ts`), and non-trivial multi-file changes (optional only for trivial 1-file typo fixes) |
| `main` | Quick Review + Bug Finder + Cross-Family Deep Review (all required), incorporating Security Review when touching `auth/`, `keys/`, `ws/`, `protocol`, `deploy/`, or `packages/mcp/src/acl.ts` |

- Any `CRITICAL` finding or unresolved `UNKNOWN_INTENT` item from any tier forces Verdict = `REQUEST CHANGES` and blocks merge (including on `dev`) until the repo owner answers on the PR and the decision is recorded in a PR comment.

## Pre-PR checks

- [ ] Branch created from updated `dev`
- [ ] No leaks: `git diff dev..HEAD | grep -iE '(sk-|api_key|token|secret|password|BEGIN.*PRIVATE)'`
- [ ] Version bump if applicable
- [ ] Conventional commit, English body
- [ ] PR title and description in English (`AGENTS/docs.md`)
- [ ] Linked to GitHub Issue (`Closes #N`) with appropriate labels (`enhancement`, `bug`, etc.) per `AGENTS/issues.md`
- [ ] PR template filled
- [ ] Quick Review + Bug Finder completed (`.github/REVIEW_TEMPLATES/`)
- [ ] Cross-Family Deep Review completed when required by `AGENTS/prs.md`
- [ ] `docs/features/` updated when required
- [ ] PR targets `dev` (unless this is the release PR to `main`)
- [ ] Skills synced if `skills/*.md` changed: `bash skills/sync-skills.sh` (updates `.agents/skills/<name>/SKILL.md` and Hermes)

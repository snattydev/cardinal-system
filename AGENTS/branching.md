# Branching

Repo branch workflow.

## Diagram

```
feature/* ──→ PR ──→ dev ──→ PR ──→ main
fix/*      ──→ PR ──→ dev ──→ PR ──→ main
chore/*    ──→ PR ──→ dev ──→ PR ──→ main
docs/*     ──→ PR ──→ dev ──→ PR ──→ main
```

## Rules

- Work is done in `feature/*`, `fix/*`, `chore/*`, or `docs/*` from `dev`.
- Each branch is opened as a PR to `dev`. No direct merges to `dev`.
- The merge to `dev` is done by the same agent that implemented the feature, after green.
- When `dev` is stable → a single PR from `dev` to `main` with review.
- `main` never receives direct commits.
- **Merge strategy:** merge commit. No squash. `dev` and `main` never diverge.

## Branch types

| Type | Use |
|------|-----|
| `feature/*` | New functionality or change that adds capability |
| `fix/*` | Bug fix |
| `chore/*` | Maintenance (bump, deps, config, build) without functional change |
| `docs/*` | Docs only |

## Protection

| Branch | Protection |
|--------|------------|
| `main` | PR + review required, merge commit |
| `dev` | PR from `feature/*` required, merge commit |

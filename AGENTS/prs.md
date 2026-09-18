# Pull Requests

Repo PR flow. Detailed execution steps live in the `cardinal-pr` skill.

## Flow `feature/* → dev`

1. The implementing agent opens the PR to `dev`.
2. Verifies evidence before marking ready: `bun test` and `bun run build`.
3. The merge to `dev` is done by that same agent after green.
4. If there are changes in `auth/`, `keys/`, `ws/`, or protocol → also apply Security Review.

## Flow `dev → main`

1. `dev` accumulates features, fixes, docs.
2. When stable → open a PR from `dev` to `main`.
3. The orchestrator opens the PR.
4. The human (outside the repo) reviews and merges.
5. **Never auto-merge.**

## Pre-merge checklist (required)

- [ ] `bun test` passes completely (all packages + backend)
- [ ] `bun run build` passes (frontend/)
- [ ] Leak audit: keys, tokens, absolute paths, emails
- [ ] Standard Review approved (code, clarity, maintainability)
- [ ] Security Review approved if there were changes in `auth/`, `keys/`, `ws/`, or protocol
- [ ] Version bump in `package.json` if applicable
- [ ] `docs/features/<date>-<name>.md` created or updated
- [ ] PR title, body, and any new comments/docs in English (`AGENTS/docs.md`)
- [ ] Linked GitHub Issue with proper labels (`enhancement`, `bug`, etc.) and `Closes #N` in PR body (`AGENTS/issues.md`)

## Merge strategy

**Merge commit.** Standard, not squash. All commits from `dev` go to `main` with an explicit merge commit. `dev` and `main` never diverge — no need to realign after the merge.

## Reviewers

| PR to | Reviewers |
|-------|-----------|
| `dev` | None — direct merge by the implementing agent |
| `main` | Standard Review (required), Security Review (if changes in `auth/`, `keys/`, `ws/`, protocol) |

Step-by-step execution reference: [`skills/cardinal-pr.md`](../skills/cardinal-pr.md).

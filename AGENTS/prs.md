# Pull Requests

Repo PR flow. Detailed execution steps live in the `cardinal-pr` skill.

## Flow `feature/* → dev`

1. The implementing agent opens the PR to `dev`.
2. Verifies evidence before marking ready: `bun test` and `bun run build`.
3. The merge to `dev` is done by that same agent after green.
4. If there are changes in `auth/`, `keys/`, `ws/`, or protocol → also apply Security Review.
5. Note: GitHub only auto-closes `Closes #N` when merging into the default branch (`main`). Keep `Closes #N` in the PR body for traceability, and either wait for `dev -> main` or close manually once verified on `dev`.

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
- [ ] Quick Review approved (scope, conventions, clarity)
- [ ] Bug Finder: 0 `CRITICAL` and 0 unresolved `UNKNOWN_INTENT`
- [ ] Deep Review approved for large or cross-package changes, with Security Review if there were changes in `auth/`, `keys/`, `ws/`, or protocol
- [ ] Version bump in `package.json` if applicable
- [ ] `docs/features/<date>-<name>.md` created or updated
- [ ] PR title, body, and any new comments/docs in English (`AGENTS/docs.md`)
- [ ] Linked GitHub Issue with proper labels (`enhancement`, `bug`, etc.) and `Closes #N` in PR body (`AGENTS/issues.md`)

## Review workflow (multi-tier)

Every PR runs through three review tiers before merge. The tiers can run in parallel; each one reports with its own template in [`.github/REVIEW_TEMPLATES/`](../.github/REVIEW_TEMPLATES/).

| Tier | Model | Goal | Template |
|------|-------|------|----------|
| Quick Reviewer | fast, small | scope, conventions, clarity, obvious gaps | [`quick-review.md`](../.github/REVIEW_TEMPLATES/quick-review.md) |
| Bug Finder | fast | logic bugs, edge cases, regressions, container and env mismatches | [`bug-finder.md`](../.github/REVIEW_TEMPLATES/bug-finder.md) |
| Deep Reviewer | cross-family (different family than the author) | architecture, policy, correctness, security and leak audit | [`deep-review.md`](../.github/REVIEW_TEMPLATES/deep-review.md) |

- Prompts: [`docs/agents/prompts/quick-review.md`](../docs/agents/prompts/quick-review.md), [`docs/agents/prompts/bug-finder.md`](../docs/agents/prompts/bug-finder.md).
- Bug Finder role: [`docs/agents/roles/bug-finder.md`](../docs/agents/roles/bug-finder.md).
- Run Deep Review for large diffs, cross-package changes, and anything touching `auth/`, `keys/`, `ws/`, protocol, DB migrations, or the container build.
- Findings go into a severity bucket: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`. Bug Finder and Deep Review also report `UNKNOWN_INTENT` when the intended behavior is ambiguous or undocumented.
- Human checkpoint: a `CRITICAL` finding or an unresolved `UNKNOWN_INTENT` blocks merge until the owner answers it on the PR. Agents do not resolve `UNKNOWN_INTENT` by assumption.
- Security Review (checklist: [`docs/agents/prompts/security-review-checklist.md`](../docs/agents/prompts/security-review-checklist.md)) is part of the Deep Review tier when the change touches `auth/`, `keys/`, `ws/`, or protocol.

## Merge strategy

**Merge commit.** Standard, not squash. All commits from `dev` go to `main` with an explicit merge commit. `dev` and `main` never diverge — no need to realign after the merge.

## Reviewers

| PR to | Reviewers |
|-------|-----------|
| `dev` | Quick Review and Bug Finder (required), Deep Review for large or sensitive changes |
| `main` | Deep Review (required, cross-family), Security Review (if changes in `auth/`, `keys/`, `ws/`, protocol) |

Step-by-step execution reference: [`skills/cardinal-pr.md`](../skills/cardinal-pr.md).

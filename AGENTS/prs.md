# Pull Requests

Repo PR flow. Detailed execution steps live in the `cardinal-pr` skill.

## Flow `feature/* -> dev`

1. The implementing agent opens the PR to `dev`.
2. Verifies evidence before marking ready: `bun run typecheck`, `bun test`, and `bun run build`.
3. Runs the required review tiers (Quick Review + Bug Finder on every PR, plus Cross-Family Deep Review when required below).
4. When touching `auth/`, `keys/`, `ws/`, `protocol`, `deploy/`, or `packages/mcp/src/acl.ts`, Deep Review incorporates Security Review (`docs/agents/prompts/security-review-checklist.md`).
5. Once checks pass with 0 `CRITICAL` findings and 0 unresolved `UNKNOWN_INTENT` items, the implementing agent merges to `dev`.
6. Note: GitHub only auto-closes `Closes #N` when merging into the default branch (`main`). Keep `Closes #N` in the PR body for traceability, and either wait for `dev -> main` or close manually once verified on `dev`.

## Flow `dev -> main`

1. `dev` accumulates features, fixes, docs.
2. When stable, open a PR from `dev` to `main`.
3. The orchestrator opens the PR and runs Quick Review, Bug Finder, and Cross-Family Deep Review (incorporating Security Review when touching sensitive paths).
4. The human (outside the repo) reviews and merges.
5. **Never auto-merge.**

## Pre-merge checklist (required)

- [ ] `bun test` passes completely (all packages + backend)
- [ ] `bun run build` passes (`frontend/`)
- [ ] Leak audit: keys, tokens, absolute paths, emails
- [ ] Quick Review approved (scope, conventions, clarity)
- [ ] Bug Finder approved: 0 `CRITICAL` findings and 0 unresolved `UNKNOWN_INTENT` items
- [ ] Cross-Family Deep Review approved (required on `dev -> main`, orchestrated wave/feature PRs, security-sensitive paths, and non-trivial multi-file changes; optional only for trivial 1-file typo fixes on `dev`), incorporating Security Review when touching `auth/`, `keys/`, `ws/`, `protocol`, `deploy/`, or `packages/mcp/src/acl.ts`
- [ ] Any `CRITICAL` finding or `UNKNOWN_INTENT` item from any tier has an explicit repo owner decision recorded on the PR
- [ ] Version bump in `package.json` if applicable
- [ ] `docs/features/<date>-<name>.md` created or updated
- [ ] PR title, body, and any new comments/docs in English (`AGENTS/docs.md`)
- [ ] Linked GitHub Issue with proper labels (`enhancement`, `bug`, etc.) and `Closes #N` in PR body (`AGENTS/issues.md`)

## Review workflow (multi-tier)

Every PR (including docs-only PRs) runs Tier 1 (Quick Review) and Tier 2 (Bug Finder) before merge. Tier 3 (Cross-Family Deep Review) is required on every `dev -> main` PR, every orchestrated wave/feature PR, every PR touching security-sensitive paths (`auth/`, `keys/`, `ws/`, `protocol`, `deploy/`, `packages/mcp/src/acl.ts`, DB migrations, or container builds), and any non-trivial multi-file diff. Only trivial 1-file typo fixes on `dev` may omit Tier 3. Tiers may run in parallel; each reports with its template in [`.github/REVIEW_TEMPLATES/`](../.github/REVIEW_TEMPLATES/).

| Tier | Model & Role | Goal | Severity Buckets | Template |
|------|--------------|------|------------------|----------|
| Tier 1: Quick Reviewer | fast, small (same-family allowed), role `reviewer` | scope, conventions, clarity, obvious gaps | `CRITICAL`, `HIGH`, `LOW` | [`quick-review.md`](../.github/REVIEW_TEMPLATES/quick-review.md) |
| Tier 2: Bug Finder | fast (same-family allowed), role `bug-finder` | logic bugs, edge cases, regressions, container/env mismatches | `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `UNKNOWN_INTENT` | [`bug-finder.md`](../.github/REVIEW_TEMPLATES/bug-finder.md) |
| Tier 3: Deep Reviewer | cross-family (different model family than author, recorded by model name), role `reviewer` + `security-reviewer` | architecture, policy, correctness, security and leak audit | `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `UNKNOWN_INTENT` | [`deep-review.md`](../.github/REVIEW_TEMPLATES/deep-review.md) |

- Prompts: [`docs/agents/prompts/quick-review.md`](../docs/agents/prompts/quick-review.md), [`docs/agents/prompts/bug-finder.md`](../docs/agents/prompts/bug-finder.md), and [`docs/agents/prompts/standard-review.md`](../docs/agents/prompts/standard-review.md) (legacy one-shot quality prompt).
- Bug Finder role: [`docs/agents/roles/bug-finder.md`](../docs/agents/roles/bug-finder.md).
- Security Review checklist: [`docs/agents/prompts/security-review-checklist.md`](../docs/agents/prompts/security-review-checklist.md) (part of Tier 3 when sensitive paths change).
- Human checkpoint: any `CRITICAL` finding or unresolved `UNKNOWN_INTENT` item from any tier forces Verdict = `REQUEST CHANGES` and blocks merge (including on `dev`) until the repo owner explicitly answers on the PR, the decision is recorded in a PR comment, and affected tiers re-run if code or specs changed.

## Merge strategy

**Merge commit.** Standard, not squash. All commits from `dev` go to `main` with an explicit merge commit. `dev` and `main` never diverge — no need to realign after the merge.

## Reviewers

| PR to | Reviewers |
|-------|-----------|
| `dev` | Quick Review + Bug Finder (required); Cross-Family Deep Review (required for orchestrated wave/feature PRs, security-sensitive paths, and non-trivial multi-file diffs; optional only for trivial 1-file typo fixes) |
| `main` | Quick Review + Bug Finder + Cross-Family Deep Review (all required), incorporating Security Review when touching `auth/`, `keys/`, `ws/`, `protocol`, `deploy/`, or `packages/mcp/src/acl.ts` |

Step-by-step execution reference: [`skills/cardinal-pr.md`](../skills/cardinal-pr.md).

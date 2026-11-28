# Quick Review Template

PR report template for a fast, single-pass reviewer. Use it for small, low-risk diffs and for the first pass before a deeper review.

- Prompt: [`docs/agents/prompts/quick-review.md`](../../docs/agents/prompts/quick-review.md)
- Deeper passes: [`bug-finder.md`](./bug-finder.md), [`deep-review.md`](./deep-review.md)

Paste the report as a PR comment. Fill every section. Write `(none)` when a severity bucket is empty.

---

## Summary

- PR: #{pr_number} {pr_title}
- Scope: <one or two sentences describing what changed>
- Files reviewed: N
- Risk: low | medium | high

## Scope & Conventions Check

| Check | Result | Notes |
|---|---|---|
| Branch targets `dev` per `AGENTS/branching.md` | pass / fail | |
| Conventional Commit subject and English body (`AGENTS/commits.md`) | pass / fail | |
| English only in code, docs, and comments (`AGENTS/docs.md`) | pass / fail | |
| No secrets, tokens, or personal home paths in the diff | pass / fail | |
| Tests cover the change (`AGENTS/tdd.md` scopes) | pass / fail / n/a | |
| Feature doc present when the change is significant | pass / fail / n/a | |

## Findings

### CRITICAL

(none) | blocking: bug, build breakage, data loss, or secret leak

### HIGH

(none) | should be fixed before merge

### LOW

(none) | suggestion, no merge impact

## Verdict

APPROVE | APPROVE WITH COMMENTS | REQUEST CHANGES

<one line justification. Any `CRITICAL` finding requires `REQUEST CHANGES` and blocks merge.>

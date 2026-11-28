# Deep Review Template

PR report template for a cross-family deep reviewer: a model from a different family than the author, used when the change is large, crosses package boundaries, or touches a sensitive area.

Use it after the quick review and the bug-finder pass. The deep reviewer reads the change as a whole: architecture, policy, correctness, and security.

- Conventions: [`AGENTS.md`](../../AGENTS.md), [`AGENTS/prs.md`](../../AGENTS/prs.md)
- Security checklist: [`docs/agents/prompts/security-review-checklist.md`](../../docs/agents/prompts/security-review-checklist.md)

Paste the report as a PR comment. Fill every section. Write `(none)` when a severity bucket is empty.

---

## Context

- PR: #{pr_number} {pr_title}
- Author model / family: <model name and family>
- Reviewer model / family: <model name and family, different from the author>
- Files reviewed: N
- Review depth: full diff and the modules it touches

## Architectural & Policy Compliance

| Check | Result | Notes |
|---|---|---|
| Fits the current phase and scope in `AGENTS.md` and `docs/roadmap.md` | pass / fail | |
| Layer boundaries respected (`backend/` composition, `packages/*`, `frontend/`) | pass / fail | |
| Public API or WS protocol change documented in `docs/api.md` | pass / fail / n/a | |
| DB change has a migration and a rollback path | pass / fail / n/a | |
| `AGENTS/prs.md`, `AGENTS/commits.md`, `AGENTS/docs.md` followed | pass / fail | |
| Feature doc at `docs/features/<date>-<name>.md` when significant | pass / fail / n/a | |
| No unrelated files or scope creep in the diff | pass / fail | |

## Correctness & Edge Cases

| Area | Result | Notes |
|---|---|---|
| Main path works end to end | pass / fail | |
| Boundary values, empty input, and error paths handled | pass / fail | |
| Concurrency and ordering assumptions are safe | pass / fail / n/a | |
| Failure of an external dependency is handled | pass / fail / n/a | |
| Container and environment assumptions hold (`127.0.0.1`, env vars, volume paths) | pass / fail / n/a | |
| Tests cover the new behavior and its edges | pass / fail | |

## Security & Leak Audit

| Check | Result | Notes |
|---|---|---|
| No secrets, tokens, or credentials in the diff | pass / fail | |
| No personal home paths, emails, or internal hosts | pass / fail | |
| Input validation and parameterized queries where user input reaches storage | pass / fail / n/a | |
| Auth and authorization on new endpoints (`auth/`, `keys/`) | pass / fail / n/a | |
| No sensitive data in logs or error responses | pass / fail | |
| Dependencies added only from trusted sources and pinned | pass / fail / n/a | |

## Findings

### CRITICAL

(none) | blocking: security issue, data loss, broken build, or a broken main path

### HIGH

(none) | should be fixed before merge

### MEDIUM

(none) | real but limited impact; plan a fix

### LOW

(none) | suggestion

## UNKNOWN_INTENT

Behavior whose intended result is not documented anywhere in the PR, the issue, or the code. Do not guess.

| # | Location | Behavior | Why it is ambiguous | Question for the author |
|---|---|---|---|---|
| 1 | `file.ts:42` | <what the code does> | <what is missing> | <what a human must confirm> |

If the section is empty, write `(none)`.

## Verdict

APPROVE | APPROVE WITH COMMENTS | REQUEST CHANGES

<one line justification. Any `CRITICAL` finding or unresolved `UNKNOWN_INTENT` item requires `REQUEST CHANGES` and blocks merge until the owner answers on the PR.>

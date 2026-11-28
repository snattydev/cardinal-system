# Bug Finder Template

PR report template for a fast bug-finder pass. It looks for logic bugs, edge cases, and regressions instead of style.

- Role: [`docs/agents/roles/bug-finder.md`](../../docs/agents/roles/bug-finder.md)
- Prompt: [`docs/agents/prompts/bug-finder.md`](../../docs/agents/prompts/bug-finder.md)

Paste the report as a PR comment. Fill every section. Write `(none)` when a severity bucket is empty.

`UNKNOWN_INTENT` is not a finding. It is a question for the author. Report it whenever the intended behavior is ambiguous or undocumented instead of guessing. An unresolved `UNKNOWN_INTENT` blocks merge until a human answers it.

---

## Diff & Risk Scope

- PR: #{pr_number} {pr_title}
- Changed files: N
- Risk areas touched: <auth | keys | ws | db | router | api | frontend | docs | build | container>
- Entry points exercised: <endpoints, commands, or flows that reach the change>
- Runtime assumptions checked: <Podman container, `127.0.0.1` vs `localhost`, env vars from `deploy/env.example`, volume paths>

## Confirmed Bugs / Edge Cases

Each entry needs a concrete trigger: an input, a request sequence, or a state the code can reach.

| # | Location | Trigger | Observed or expected failure | Severity |
|---|---|---|---|---|
| 1 | `file.ts:42` | <input or sequence> | <what breaks> | CRITICAL / HIGH / MEDIUM / LOW |

## Findings

### CRITICAL

(none) | blocking: crash, data loss, broken build, or a failure on the main path

### HIGH

(none) | real bug on a plausible path; fix before merge

### MEDIUM

(none) | edge case with limited reach; fix soon

### LOW

(none) | defensive improvement, no known trigger

## UNKNOWN_INTENT

List every behavior whose intended result is not stated in the PR, the issue, or the code. Do not assume it is correct.

| # | Location | Behavior | Why it is ambiguous | Question for the author |
|---|---|---|---|---|
| 1 | `file.ts:42` | <what the code does> | <what is missing> | <what a human must confirm> |

If the section is empty, write `(none)`.

## Verdict

APPROVE | APPROVE WITH COMMENTS | REQUEST CHANGES

<one line justification. Mention any unresolved `UNKNOWN_INTENT` that blocks merge.>

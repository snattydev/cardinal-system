# Reviewer and Bug Finder Templates

- **Date:** 2026-11-27
- **Branch:** `docs/#69-reviewer-bugfinder-templates`
- **Issue:** Closes #69

## What Changed

Added a three-tier PR review workflow with report templates, prompts, and a canonical role, then wired it into the PR template and the repo rules.

### PR report templates
- **`.github/REVIEW_TEMPLATES/quick-review.md`:** Fast reviewer report. Summary, Scope & Conventions Check table, findings in `CRITICAL`, `HIGH`, `LOW`, and a verdict of `APPROVE`, `APPROVE WITH COMMENTS`, or `REQUEST CHANGES`.
- **`.github/REVIEW_TEMPLATES/bug-finder.md`:** Bug-finder report. Diff & Risk Scope, a confirmed bugs and edge cases table, findings in `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, a dedicated `UNKNOWN_INTENT` table for ambiguous or undocumented behavior, and a verdict.
- **`.github/REVIEW_TEMPLATES/deep-review.md`:** Cross-family deep reviewer report. Architectural & Policy Compliance, Correctness & Edge Cases, Security & Leak Audit, findings in `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `UNKNOWN_INTENT`, and a verdict.

### Agent docs
- **`docs/agents/roles/bug-finder.md`:** Canonical read-only role in the BMAD-lite region format used by `reviewer.md` and `security-reviewer.md`. Covers logic bugs, edge cases, regressions, and container or environment mismatches, and requires `UNKNOWN_INTENT` instead of guessing intent.
- **`docs/agents/prompts/quick-review.md`:** Single-pass prompt inside `<!-- REGION: quick-review-prompt -->`, with the same variables as the standard review prompt (`{pr_title}`, `{pr_description}`, `{changed_files}`, `{repo}`, `{pr_number}`, `{pr_diff}`).
- **`docs/agents/prompts/bug-finder.md`:** Single-pass prompt inside `<!-- REGION: bug-finder-prompt -->` that explicitly tells the model to report `UNKNOWN_INTENT` when intended behavior is ambiguous or undocumented.

### Repo rules and templates
- **`.github/PULL_REQUEST_TEMPLATE.md`:** Appended 4 review checklist items under `## Checklist` covering Quick Review, Bug Finder (0 `CRITICAL` findings, 0 unresolved `UNKNOWN_INTENT` items), Cross-Family Deep Review, and owner resolution of blocking items, plus plain repo path references to `.github/REVIEW_TEMPLATES/` and `AGENTS/prs.md`.
- **`AGENTS/prs.md`:** New "Review workflow (multi-tier)" section, updated `feature/* -> dev` and `dev -> main` flows, updated pre-merge checklist, and updated reviewer table for PRs to `dev` and `main`.
- **`skills/cardinal-pr.md` & `.agents/skills/cardinal-pr/SKILL.md`:** Synced §6 Reviewers and Pre-PR checks with the three-tier workflow in `AGENTS/prs.md`.
- **`AGENTS/structure.md`:** Indexed `.github/REVIEW_TEMPLATES/`, the two new prompts, all 10 role files under `docs/agents/roles/`, and `CHANGELOG.md`.

## Why

`docs/agents/roles/` had `reviewer.md` and `security-reviewer.md`, and `docs/agents/prompts/` had a standard review prompt and a security checklist, but nothing defined a repeatable review pipeline:

- There was no shared report shape, so every review looked different and findings could not be compared across PRs.
- Fast, small models were asked to do quality review without a scope limit, which made them miss logic bugs and over-report style.
- Reviewers silently assumed intent when a PR did not document it, which hid real ambiguity until production.
- A single model family reviewed its own family's output, which reduces the chance of catching shared blind spots.

The tiers separate concerns: quick review covers conventions and clarity, bug finding covers correctness with an explicit intent check, and deep review covers architecture, policy, and security from a different model family.

## Decisions

- **Three tiers, three templates, one report shape per tier:** A single shared template would either hide the `UNKNOWN_INTENT` field from quick reviews or force deep reviews to use shallow sections. Each tier gets only the sections it must fill.
- **`UNKNOWN_INTENT` is a blocking ambiguity item, not a bug finding:** It is a question for the repo owner. Treating it as a bug would push agents to guess; forcing `REQUEST CHANGES` until answered prevents ambiguity from merging silently.
- **Bug Finder is a separate role, not a `reviewer` mode:** The role has different rules (confirmed triggers only, no intent guessing, runtime assumption checks) and a different output. Keeping it separate keeps `reviewer.md` focused on quality.
- **Cross-family for the deep tier:** The deep reviewer must come from a different model family than the author (verified by recording model names in the PR report `Context` block). Same-family review is still allowed for the quick and bug-finder tiers, and Deep Review is optional only for trivial 1-file typo fixes on `dev`.
- **Templates live in `.github/REVIEW_TEMPLATES/` as plain Markdown:** They are copy-paste report shapes, not automation. No bot, no new dependency, no CI job.
- **Prompts stay in `docs/agents/prompts/`:** That is where the existing standard review prompt lives, and the BMAD-lite region delimiters let an agent load only the prompt it needs.
- **No `CHANGELOG.md` edit in this PR:** Release changelog history is tracked separately in #47.

## Alternatives Considered

- **Extend `docs/agents/prompts/standard-review.md` with new sections:** Rejected. The standard prompt is a single-pass quality review, and adding security and bug-hunting sections would make it too long for a fast model and blur the tier boundaries.
- **One universal template with optional sections:** Rejected. Optional sections get skipped under time pressure, and the `UNKNOWN_INTENT` guarantee would be lost.
- **Automate the tiers in CI with a review bot:** Rejected for now. It adds infrastructure, secrets, and model cost before the workflow is proven manually. It remains a possible follow-up once the templates are in use.
- **Use GitHub labels to track `CRITICAL` and `UNKNOWN_INTENT`:** Rejected. The report is the source of truth and lives on the PR; labels would duplicate state and drift.
- **Add the Bug Finder to the Cursor subagent table now:** Deferred. This issue is scoped to canonical docs and templates; adapter wiring in `.cursor/agents/` is a separate change.

## Files Created / Modified

- Created: `.github/REVIEW_TEMPLATES/quick-review.md`
- Created: `.github/REVIEW_TEMPLATES/bug-finder.md`
- Created: `.github/REVIEW_TEMPLATES/deep-review.md`
- Created: `docs/agents/roles/bug-finder.md`
- Created: `docs/agents/prompts/quick-review.md`
- Created: `docs/agents/prompts/bug-finder.md`
- Created: `docs/features/2026-11-27-reviewer-and-bug-finder-templates.md`
- Modified: `.github/PULL_REQUEST_TEMPLATE.md`
- Modified: `AGENTS/prs.md`
- Modified: `AGENTS/structure.md`
- Modified: `skills/cardinal-pr.md`
- Modified: `.agents/skills/cardinal-pr/SKILL.md`

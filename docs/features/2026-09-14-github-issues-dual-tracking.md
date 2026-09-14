# GitHub Issues dual tracking (2026-09-14)

## What was done

Opened GitHub Issues as the SDLC source of truth for Cardinal System, in
parallel with the in-system Blackboard (runtime coordination only).

- Policy: `AGENTS/issues.md`.
- Templates: `.github/ISSUE_TEMPLATE/{enhancement,bug_report}.md` and PR
  `Closes #` field.
- Labels: existing `enhancement` / `bug` / `documentation` plus `chore`,
  `refactor`, `security`, `frontend`, `backend`, `protocol`.
- Milestones: `v0.2.6` (Phase 2 freeze), `v0.3.0` (Cardinal v3).
- Issues [#16](https://github.com/snattydev/cardinal-system/issues/16)–[#28](https://github.com/snattydev/cardinal-system/issues/28)
  covering the freeze, N5/N7, dual tracking, and the v3 backlog.

## Why

`dev` had no GitHub issues. Work lived only in markdown backlogs, so PRs
could not `Closes #N` and the dual-tracking rule in `AGENTS/issues.md` was
unusable. Runtime tasks (blackboard/mailbox) and development history must
not share one queue.

## Decisions

- Issues first, then branch names `feature/#<id>-…`, then PRs with
  `Closes #<id>`.
- The Blackboard is **not** mirrored to GitHub. Do not copy the v3
  checklist into runtime tasks.
- N1 worker stays off the v0.2.6 freeze even though code exists locally.
- Uncommitted N8/N9 seed-router / Keys.tsx work stays stashed; those
  issues (#25, #26) are the SDLC home.

## Alternatives considered

- Retro-close a GitHub issue per already-merged v2 pillar: rejected.
  Too much archaeology; the freeze issue (#16) covers shipping them.
- Put dual-tracking docs only on the N1 branch: rejected. `dev` needs
  the policy before the freeze lands on `main`.

## Files created or modified

- `AGENTS/issues.md` (new)
- `AGENTS.md`, `AGENTS/branching.md`, `AGENTS/prs.md`
- `.github/ISSUE_TEMPLATE/*`, `.github/PULL_REQUEST_TEMPLATE.md`
- `skills/cardinal-dev.md`, `skills/cardinal-pr.md`
- `docs/agents/cursor-workflow.md`, `.cursor/rules/cardinal.mdc`
- `docs/roadmap.md`, `docs/roadmap/fase-2.md`
- `docs/superpowers/plans/2026-09-07-cardinal-v3-backlog.md`

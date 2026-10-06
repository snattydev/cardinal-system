# Phase status and recorded decisions (2026-10-06)

## What was done

Brought the living status and decision pages in line with `main` and `dev`
after the 2026-10-06 read-only QA.

- Phase 2 (v0.2.6) is recorded as complete on `main`. Freeze PR
  [#12](https://github.com/snattydev/cardinal-system/pull/12) merged
  2026-09-18.
- N1 is recorded as on `dev` only. PR
  [#36](https://github.com/snattydev/cardinal-system/pull/36) merged
  2026-10-05. `packages/worker` is absent from `main`. Version stays 0.2.6.
  There are no git tags and no GitHub Actions workflows.
- Adopted decisions (v2 thesis, freeze scope, N1 worker shape, SDLC split,
  `Closes` on `main` only) are written in `context/ecosystem.md`. The v3
  backlog labels the remaining items as proposed.
- Follow-up issues from the QA are linked from the roadmap. `docs/stack.md`
  is unchanged ([#46](https://github.com/snattydev/cardinal-system/issues/46)
  still owns that rewrite). `package.json` is unchanged
  ([#47](https://github.com/snattydev/cardinal-system/issues/47)).

## Why

`AGENTS.md`, the roadmap, `context/ecosystem.md`, and the README still
described a pending freeze and, in the ecosystem page, version 0.2.5. `dev`
had already taken the N1 worker. Newcomers reading those pages would treat
Phase 2 as unmerged and N1 as unlanded.

## Decisions taken

- Record decisions in the existing knowledge base and the v3 plan. The repo
  has no `docs/decisions/` tree and no ADR files, so none were created.
- Use `Refs` for this change. It does not finish #46 (stack rewrite remains)
  and it does not implement #40–#45, #47–#49, #18, #26, #28, or #31.
- Leave the version at 0.2.6. `AGENTS/versioning.md` allows a PATCH bump on
  `dev`; the QA asked for that bump in a separate issue (#47).
- State that GitHub auto-closes `Closes #N` on the default branch only.
  PR #36 targeted `dev`. The 2026-10-06 QA reported #20 still open.

## Alternatives considered

- Rewrite `docs/stack.md` in the same pass. Rejected. That rewrite is the
  rest of #46, and this change only corrects status lines that pointed at a
  pending freeze.
- Open a new ADR per historical choice (router, keys, SAO). Rejected. Those
  decisions already live in specs and feature docs. Copying them would invent
  a log the repo does not keep.
- Mark #20 closed in prose. Rejected. The issue was reported open, and this
  checkout cannot read the Issues API (HTTP 403).

## Statements not re-verified here

The Issues API for this checkout returns 403, and GraphQL issue queries are
forbidden. Open/closed state and titles for #18, #20, #26, #28, #31, and
#40–#49 come from the 2026-10-06 QA report and the task that followed it.
PR #12's body contains `Closes #16`, `#17`, and `#19` and merged to `main`,
which is the default branch, so those three should have closed. Their issue
pages were not re-fetched.

Code checks that did run on this tree: `GET /v1/models` calls
`handleListModels` with no session or Bearer check (`backend/src/server.ts`);
`meterSuccess` in `packages/router/src/fusion.ts` calls `consumeBudget` and
does not call `consumeBudgetUsd`. `.github/workflows/` is absent on `main`
and `dev`. `git ls-remote --tags` and the tags API are empty. Both
`package.json` versions are `0.2.6`.

## Files created or modified

- `context/ecosystem.md`
- `AGENTS.md`
- `AGENTS/issues.md`
- `AGENTS/prs.md`
- `AGENTS/structure.md`
- `README.md`
- `docs/roadmap.md`
- `docs/roadmap/fase-2.md`
- `docs/security.md` (rate-limit line now points at #43)
- `docs/api.md` (auth on `GET /v1/models` matches the handler)
- `docs/guides/router-usage.md` (status line points at the roadmap)
- `docs/superpowers/specs/2026-08-12-cardinal-v2-architecture.md` (status banner)
- `docs/superpowers/plans/2026-08-17-cardinal-v2-backlog.md` (snapshot pointer)
- `docs/superpowers/plans/2026-09-07-cardinal-v3-backlog.md`
- `docs/features/2026-10-06-phase-status-and-decisions.md`

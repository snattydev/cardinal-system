## Summary

<!-- What and why, in English. One or two sentences. -->

## Issue

Closes #

## Changes

<!-- Files touched and what changed. -->

- 
- 

## Breaking

<!-- Anything that breaks? If not, "None". -->



## How to test

1. 
2. 

## Documentation

<!-- Link to the full feature doc in docs/features/. Detail lives there. -->

- 

## Checklist

- [ ] Linked to GitHub Issue (`Closes #N`) with appropriate labels (`enhancement`, `bug`, etc.)
- [ ] Version bump in `package.json` (only for PRs to `main`)
- [ ] Documented in `docs/features/` when the change is significant
- [ ] No leaks (keys, tokens, paths, emails)
- [ ] Tested locally
- [ ] Quick Review completed (`.github/REVIEW_TEMPLATES/quick-review.md`)
- [ ] Bug Finder completed: 0 `CRITICAL` findings and 0 unresolved `UNKNOWN_INTENT` items (`.github/REVIEW_TEMPLATES/bug-finder.md`)
- [ ] Cross-Family Deep Review completed (required on `main`, orchestrated wave/feature PRs, and sensitive paths; optional only for trivial 1-file typo fixes on `dev`), incorporating Security Review when touching `auth/`, `keys/`, `ws/`, `protocol`, `deploy/`, or `packages/mcp/src/acl.ts` (`.github/REVIEW_TEMPLATES/deep-review.md`)
- [ ] Any `CRITICAL` finding or `UNKNOWN_INTENT` item has an explicit owner decision recorded on the PR

Review templates: `.github/REVIEW_TEMPLATES/`. Workflow: `AGENTS/prs.md`.

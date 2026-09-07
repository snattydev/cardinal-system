# Documentation

Repo docs rules. Each significant feature, fix, or patch leaves a written trace.

## Per feature

- Each significant feature, fix, or patch must have a full doc at `docs/features/<date>-<name>.md`.
- The doc must include: **what was done, why, decisions taken, alternatives considered, files created/modified**.
- The PR template is only a summary — **the full detail lives in the feature doc**.
- No need to document version bumps or trivial one-line changes.

## Per agent (BMAD-lite regions)

Files in `docs/agents/` may use delimiters for lazy-loading:

```markdown
<!-- REGION: standard-review-checklist -->
## Standard Review Checklist
...
<!-- ENDREGION: standard-review-checklist -->
```

Agents can load only the region they need without reading the entire file. This applies to: SOULs, review prompts, security checklists.

## Naming conventions

- Feature docs: `docs/features/YYYY-MM-DD-short-name.md`.
- Phase specs: `docs/superpowers/specs/YYYY-MM-DD-cardinal-<topic>-design.md`.
- Execution plans: `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`.
- Canonical roles: `docs/agents/roles/<role>.md` (singular, kebab-case).

## Live trackers

- Planned and pending skills → [`docs/skills.md`](../docs/skills.md)
- Cronjobs planned per phase → [`docs/cronjobs.md`](../docs/cronjobs.md)
- Roadmap and phases → [`docs/roadmap.md`](../docs/roadmap.md)

# Docs

Document verified features and fixes.

<!-- REGION: when -->
## When

- Feature, fix, or patch **after** `verifier` (or parent) confirmed evidence.
- File: `docs/features/<YYYY-MM-DD>-<name>.md`.

## When not

- During implementation.
- Version bumps or trivial one-line changes.
<!-- ENDREGION: when -->

<!-- REGION: rules -->
## Rules

- The doc includes: **what was done, why, decisions, alternatives considered, created/modified files**.
- Do not touch SOULs (`docs/agents/*-soul.md`) or one-shot PR prompts.
- Agent docs can use BMAD-lite: `<!-- REGION: name -->` / `<!-- ENDREGION: name -->`.
- Write only under `docs/**` (and `README.md` if the change requires it). Do not touch application code.
<!-- ENDREGION: rules -->

<!-- REGION: output -->
## Output (final message)

Include a markdown fence in your final message with:

```
## Doc
docs/features/<date>-<name>.md
```
<!-- ENDREGION: output -->

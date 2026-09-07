# Versioning

Repo rule. Source of truth: `version` field in root `package.json`.

## Format

`MAJOR.FASE.PATCH` — e.g. `0.0.2`.

| Component | Meaning | When to bump |
|-----------|---------|--------------|
| `MAJOR` | `0` until the system is stable. Then `1.0.0` | Breaking changes or stability |
| `FASE` | Current roadmap phase (0, 1, 2...) | Only in the PR `dev → main` |
| `PATCH` | Increments within the phase (features, fixes, docs) | Each change in `dev` |

## Golden rule

- In `dev` only PATCH is bumped.
- FASE is bumped only once in the PR `dev → main`.
- Each PR to `dev` may or may not bump PATCH (at the author's discretion, consistent with the change).
- Each PR `dev → main` must bump FASE if the previous phase was closed, or leave it unchanged if the phase is still open.

## Examples

- `0.0.2 → 0.0.3`: fix in `keys/` committed to `dev`.
- `0.0.3 → 0.1.0`: Phase 1 features accumulated, Phase 1 closure in PR `dev → main`.
- `0.1.0 → 1.0.0`: system stable, explicit decision.

# Planned Skills

> Skills to implement when the corresponding integrations are ready.

---

## Already created

| Skill | File | What it covers |
|-------|------|----------------|
| `cardinal-dev` | `skills/cardinal-dev.md` | Full workflow: branching, commits, versioning, docs, security |
| `cardinal-pr` | `skills/cardinal-pr.md` | Create PR step by step: branch → bump → commit → push → template → reviewers |
| `cardinal-commit` | `skills/cardinal-commit.md` | Commit format: conventional commits, types, scope, examples |

---

## Pending (next)

| Skill | Dependency | What it will cover |
|-------|------------|--------------------|
| `cardinal-container` | Podman + compose working | Build, run, debug local pod (`compose up/down`, logs, rebuild) |
| `cardinal-review` | Standard + Security reviewers | Unified flow: run standard review + security review |
| `cardinal-api` | Stable endpoints | Quick REST + WS reference for testing and debugging |
| `cardinal-vault-doc` | — | Fixed template for vault docs (what to include, format, examples) |

## Future (Phase 2+)

| Skill | Dependency | What it will cover |
|-------|------------|--------------------|
| `cardinal-keygen` | Key Factory | Create, revoke, list API keys via Cardinal CLI |
| `cardinal-deploy` | VPS ready | Deploy to production: build images, push, quadlet, verify |
| `cardinal-pentest` | Integrated pentester | Trigger one-shot pentest and read report |

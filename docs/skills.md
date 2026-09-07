# Skills

In-repo skills live in `skills/`. That directory is the source of truth; `skills/sync-skills.sh` copies them out to Hermes.

Do not duplicate `AGENTS.md` inside a skill. Skills are procedures or pointers. Skills are written in English (`AGENTS/docs.md`).

## Active

| Skill | File | Covers |
|-------|------|--------|
| `cardinal-dev` | `skills/cardinal-dev.md` | Index into `AGENTS.md` + the other skills |
| `cardinal-commit` | `skills/cardinal-commit.md` | Conventional commits, English subject and body |
| `cardinal-pr` | `skills/cardinal-pr.md` | Branch → bump → commit → push → template → reviewers |
| `cardinal-system` | `skills/cardinal-system.md` | Runtime URLs; pointers to API, pitfalls, stack |

## Covered elsewhere (no extra skill)

| Need | Where |
|------|--------|
| REST + WS + JWT recipe | `docs/api.md` |
| Compose / Quadlet | `README.md`, `docs/guides/pitfalls.md` |
| Standard + security review | `AGENTS/prs.md`, `docs/agents/prompts/` |
| Keygen | `README.md`, `docs/guides/pitfalls.md` |
| Production deploy | `README.md`, `deploy/` |
| Feature-doc template | `AGENTS/docs.md` |

## Future

| Skill | When it becomes worth a skill |
|-------|-------------------------------|
| `cardinal-pentest` | If one-shot pentest is wired as a repeatable repo command, not just the Agil role |

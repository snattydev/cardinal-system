# Cursor Workflow

How the repo is developed when the coding surface is Cursor. Canonical role policies live in `docs/agents/roles/<role>.md`. Cursor-specific adapters live in `.cursor/agents/`.

## Surface

- Cursor reads `AGENTS.md` + `.cursor/rules/` + `.cursor/agents/`.
- The parent (Composer) orchestrates and implements small work in-session. The rest is delegated to specialists or Herdr.
- **Orchestrator session** (this pane, `HERDR_ENV=1`, human requested it): interact with `herdr` directly. Do not use the Task tool for "cloud"; spoof cloud with Cursor CLI in the **Background** tab: `herdr agent start … --kind cursor`, and if the UI offers to send to cloud, choose **yes** (prefix `&` in the prompt; plan menu -> Build in cloud, never build locally). Clean up panes according to `herdr-dispatcher`.
- OpenCode CLI is legacy swarm, not the daily path (see [`opencode-orchestration.md`](./opencode-orchestration.md)).

## Swarm workflow

**Cursor is the main development surface.** The parent (Composer) implements small changes (1–2 files without critical logic); it delegates the rest to subagents.

- Mandatory TDD (auth, keys, ws, db, router), multi-file, review, feature docs, verification -> delegate to a specific role.
- Invocation: automatic by `description`, or explicit (`/builder`, `/verifier`, "use the frontend subagent").
- After a "done", always `verifier` with evidence (`bun test` / `bun run build`).
- Herdr: if this session **is** the orchestrator, interact with `herdr` CLI directly. Otherwise, **only** via `herdr-dispatcher`, and only if `HERDR_ENV=1`. Otherwise, in-session.

Typical flow:

```
tester (RED) -> builder | ws-protocol | frontend (GREEN)
  -> verifier -> reviewer || security-reviewer (if auth/keys/ws)
  -> docs -> PR to `dev` (merge if applicable)
```

### Per-feature workflow

0. **Track** — ensure a GitHub Issue exists with proper labels (`enhancement`, `bug`, etc.) alongside the integrated Blackboard (`AGENTS/issues.md`).
1. **Delegate** — 1–2 files without critical logic in-session; the rest to subagents.
2. **Verify** — `verifier` with evidence (`bun test` / `bun run build`); review if applicable.
3. **Document** — `docs/features/<date>-<name>.md` with what, why, decisions, alternatives, files.
4. **Commit + push** — conventional commit to `dev` referencing `Closes #N` and including the doc; only if the human asks.
## Roles (summary)

Canonical definitions at `docs/agents/roles/<role>.md`. Adapters at `.cursor/agents/<role>.md`.

| Role | Readonly | Scope |
|------|----------|-------|
| `builder` | no | Implements spec in `packages/` (except `ws/`) and `backend/` |
| `ws-protocol` | no | Protocol in `packages/ws/` |
| `frontend` | no | `frontend/**`, types 1:1 with JSON, WS to `:8787` |
| `tester` | no | TDD RED in `*.test.ts` |
| `verifier` | yes | Runs tests/build; does not make claims; does not patch |
| `reviewer` | yes | Quality CRITICAL/HIGH/LOW |
| `security-reviewer` | yes | Auth/keys/ws/leaks; confirmed findings |
| `docs` | no | `docs/features/` after verifying |
| `herdr-dispatcher` | no | Split/start/prompt in Herdr; does not implement product |

Cursor built-ins (`explore`, `bash`, `browser`) are not redefined.

## Delegation rules

- **Cursor parent:** small work in-session; not a strict orchestrator.
- **One subagent = one responsibility.** `builder` does not stomp on `ws-protocol` or `frontend`.
- **Backend + UI in parallel** (`builder`/`ws-protocol` + `frontend`). TDD never in reverse (RED before GREEN).
- **The parent verifies results** before marking complete. `verifier` FAIL -> re-delegate.
- **Commits:** owner identity (`git config`); never agent name. Only if the human asks.
- **Cardinal-product** does not spawn agents in Herdr (only the Cardinal repo's dispatcher can do it).

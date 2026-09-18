# Cursor Subagents — Design

> Date: 2026-08-20
> Status: Design validated. Plan: docs/superpowers/plans/2026-08-20-cursor-subagents.md
> Surface: **Cursor is now the development interface.** Roles are runtime-agnostic (any runtime could consume them). New adapters are Cursor-only.

Relationship: replaces the "Cursor = visual planning / OpenCode = implementation" split from [`2026-07-31-opencode-multi-agent-design.md`](./2026-07-31-opencode-multi-agent-design.md). OpenCode CLI continues to exist; its swarm is not expanded in this cut. SOULs (`docs/agents/*-soul.md`) and one-shot PR prompts are **not touched**.

---

## 1. Objective

Enable the Cursor parent agent (Composer) to **delegate from within** the Cardinal System work: in-session subagents for specialists, and Herdr for other Cursor instances or other kinds, without the Cardinal product spawning agents.

**Success:**

- The parent implements only 1–2 file changes without critical logic (same as `AGENTS.md`).
- TDD, auth/keys/ws/db/router, multi-file, review, feature docs, and verification go to a named subagent.
- After a "done", `verifier` runs evidence (`bun test` / `bun run build`) and can fail the claim.
- If `HERDR_ENV=1` is absent, work continues in-session and the dispatcher declares it; Herdr is not inspected from outside.
- A role policy change is edited in a single canonical doc.

**Out of scope:**

- SOULs and agent names of the Cardinal product.
- Spawns from the backend/blackboard **of CLI agents** (v2/v3 rule: Cardinal does not tell Herdr "start a CLI agent". Cardinal can spawn its own workers in containers — see item N1 of the v3 backlog, not applicable here).
- New OpenCode agents (`ws-protocol`, `frontend`, `verifier`, `security-reviewer`, `herdr-dispatcher` are not duplicated in `.opencode/`).
- New Hermes skills, new MCP, application code changes.

---

## 2. Principles

1. **Runtime-agnostic roles, runtime adapters.** `docs/agents/roles/` describes *what* the role does (mission, routing, output, limits) without Cursor or OpenCode tools. `.cursor/agents/` is the adapter: frontmatter + non-negotiable rules + "read the role doc first".
2. **Cursor is the real development surface** at this point. `AGENTS.md` and `.cursor/rules/cardinal.mdc` state this clearly. OpenCode remains as a legacy CLI swarm: the 5 existing agents can point to the same role doc (one paragraph) to avoid diverging; they are not the daily path.
3. **One role = one responsibility.** No "helper" agent.
4. **Herdr is hands, not brain.** Only `herdr-dispatcher` talks to Herdr. The parent decides *when*; the dispatcher executes split/start/prompt/wait.
5. **Read-only for those who must not mutate:** `reviewer`, `security-reviewer`, `verifier`.

---

## 3. Roster and Routing

The parent (Composer) **is not a strict orchestrator**: it handles small work itself. It always delegates when touching **auth / keys / ws / db / router**, the work is multi-file, requires review, feature docs, verification, or another pane/kind is needed.

| Agent | Enters when | Does not enter when | Mutation |
|--------|----------------|-----------------|----------|
| `builder` | Implement spec in `packages/` (except `ws/`), `backend/`, test GREEN | Work is mainly WS protocol or UI | writes code |
| `ws-protocol` | `packages/ws/**`, state machine, ping/pong, message parsing | UI or HTTP handlers that only *use* the hub | writes code |
| `frontend` | `frontend/**`, types 1:1 with backend JSON, WS client to `ws://127.0.0.1:8787` | Changing the protocol or backend | writes code |
| `tester` | TDD: writes `*.test.ts` RED **before** the code | Verifying something already "done" | only `*.test.ts` |
| `verifier` | Someone said "done": runs tests/build, does not trust claims | Writing tests or fixing code | `readonly` |
| `reviewer` | Quality, clarity, tests, conventions (`AGENTS.md`) | Security (that's the other one) | `readonly` |
| `security-reviewer` | auth, keys, ws, leaks, injection, unauthenticated endpoints | Style or naming | `readonly` |
| `docs` | Feature/fix already verified → `docs/features/<date>-<name>.md` | During implementation | only `docs/**` |
| `herdr-dispatcher` | Long implementation, parallel TDD, isolation, another Cursor/OpenCode/kind | Without `HERDR_ENV=1` → fallback in-session and declares it | does not implement; controls panes |

### Anti-collision

- Backend + UI feature: the parent launches `builder` or `ws-protocol` **and** `frontend` in parallel.
- Mandatory TDD: `tester` RED → `builder` or `ws-protocol` GREEN → `verifier`. Never reversed.
- Review of auth/keys/ws/protocol: `reviewer` ∥ `security-reviewer`, both read-only.
- `herdr-dispatcher` does not write product code. Herdr agent names: `[a-z][a-z0-9_-]{0,31}`, unique (e.g. `card-builder`).
- `verifier` does not patch. FAIL → the parent re-delegates to `builder`/`tester`/`frontend`. Does not mark the feature complete.
- `readonly` in Cursor = no edits or shell that mutates state. `bun test` / `bun run build` / `git diff` are allowed.

### Cursor Built-ins

Do not redefine `explore`, `bash`, or `browser`. The 9 above are *in addition to* those.

---

## 4. File Layers

```
docs/agents/roles/
  builder.md
  tester.md
  verifier.md
  reviewer.md
  security-reviewer.md
  docs.md
  ws-protocol.md
  frontend.md
  herdr-dispatcher.md

.cursor/agents/          # Cursor adapters (same 9 names)
  <role>.md

.cursor/rules/cardinal.mdc   # update: Cursor = development orchestration interface
AGENTS.md                    # update: Cursor subagents table; OpenCode = legacy CLI
.opencode/agents/*.md        # optional, minimal: one paragraph pointing to the role doc
```

### Role Doc (canonical)

Each file in `docs/agents/roles/`:

- Title and one-line mission.
- `<!-- REGION: when -->` when to use / when not to.
- `<!-- REGION: rules -->` Cardinal rules relevant to the role (stack, TDD, 1:1 types, leaks, Podman).
- `<!-- REGION: output -->` return contract (table from section 6).
- No tool YAML, no `Task`, no `.cursor/` paths. Runtime-agnostic.

`security-reviewer` **references** `docs/agents/prompts/security-review-checklist.md` (does not rewrite it). `reviewer` references the spirit of `docs/agents/prompts/standard-review.md` (CRITICAL/HIGH/LOW) without injecting one-shot PR variables.

### Cursor Adapter

Frontmatter:

| Field | Value |
|-------|--------|
| `name` | same as filename, kebab-case |
| `description` | WHAT + WHEN, in English (Task tool hints). Phrases `use proactively` / `always use for` in `tester`, `verifier`, `security-reviewer` |
| `model` | `inherit` for all |
| `readonly` | `true` for `reviewer`, `security-reviewer`, `verifier` |
| `is_background` | `false` for all, including `herdr-dispatcher` (the parent waits for the handoff). For parallel work the parent launches **multiple** dispatchers in the same turn; `is_background: true` is not needed |

Body: <= ~80 lines, **in Spanish** (consistent with the rest of `docs/agents/`). First mandatory step: read `docs/agents/roles/<role>.md`. Include the 5–8 rules that must hold if the read fails (e.g. tester: only `*.test.ts`; builder: no extras; verifier: no fixes).

Role docs: Spanish. Adapter `description` field: **English** (Task tool hints).

### Parent (rule + AGENTS.md)

`.cursor/rules/cardinal.mdc` stops saying that Cursor is only visual planning. It becomes:

- Cursor Composer = parent: delegation by size; table of the 9; Herdr only via `herdr-dispatcher`.
- Stack, TDD, branching, leaks: maintained.

`AGENTS.md`:

- Cursor section: development surface + invocation `/builder`, `/verifier`, etc.
- OpenCode: available CLI swarm, not the daily path.
- Do not name SOULs or identities.

---

## 5. Flow

```
request / spec
  → 1–2 files, not TDD-critical? parent implements
  → otherwise:
       tester (RED)
       [herdr-dispatcher if long, parallel, or another kind]
       ws-protocol | frontend | builder based on path
  → GREEN implementation
  → verifier (blocks broken claims)
  → reviewer ∥ security-reviewer (if touches auth/keys/ws/protocol)
  → docs
  → parent suggests commit (does not commit unless explicitly asked)
```

Invocation: automatic by `description`, or explicit (`/verifier …`, "use the frontend subagent").

---

## 6. Herdr

Only applies inside a pane with `HERDR_ENV=1`. Reference skill: `herdr` (do not copy the entire CLI to the role doc; the dispatcher **reads the skill**).

1. Check `HERDR_ENV`. If absent: message "not in Herdr", the parent falls back to in-session subagents. Does not run `herdr *`.
2. Split sibling: `--no-focus`, `--cwd "$PWD"`. Direction: `right` if the pane is wide, `down` if tall.
3. `herdr agent start <name> --kind <kind> --pane <id>`. Kind: whatever the parent/user requests. The dispatcher discovers valid kinds with `herdr agent` (CLI help); **does not invent slugs**. If no kind: asks, or uses the calling pane's kind if Herdr reports it.
4. **Self-contained** prompt (spec, paths, definition of done). The remote does not see the parent's chat.
5. `agent prompt … --wait`. If `blocked`: report; do not approve permissions unless the human has already authorized it in that session.
6. Read result (`agent read` / fallback to file written by the remote). Return IDs + summary to parent.
7. Do not close panes/tabs/workspaces it did not create. Never `herdr server stop`.

This is **Cursor-as-interface**, not the Cardinal product. Compatible with the v2/v3 rule "Cardinal does not tell Herdr to start a CLI agent" — Cardinal workers in containers (item N1 of the v3 backlog) are a different plane and do not conflict.

---

## 7. Output Contract

The last message to the parent is structured. No raw logs.

| Agent | Returns |
|--------|----------|
| `tester` | test paths, RED or GREEN, what still needs to be implemented |
| `builder` / `ws-protocol` / `frontend` | files touched, verify command and result, deviations from spec (if any, must be zero unless blocked) |
| `verifier` | what was run; passed; claimed-but-broken; gaps. Verdict: `PASS` or `FAIL` |
| `reviewer` | `CRITICAL` / `HIGH` / `LOW` (empty section explicit if none) |
| `security-reviewer` | same + vector and `file:line`. Only confirmed findings |
| `docs` | path of the feature doc |
| `herdr-dispatcher` | `pane_id`, agent name, kind, summary or fallback error |

Orchestration errors:

- Subagent that did not read the role doc → parent re-launches with explicit path.
- Red tests from an implementer → `docs` is not called.
- `verifier` FAIL → re-delegate, do not "complete".

---

## 8. Relationship with OpenCode

| What | This cut |
|-----|------------|
| `.cursor/agents/` (9) | **In scope** — development surface |
| `docs/agents/roles/` (9) | **In scope** — agnostic canonical |
| `.opencode/agents/` existing | Optional: one paragraph "follow `docs/agents/roles/<role>.md`". No new agents |
| Commands `/feature` `/test` `/review` | No changes |
| SOULs | **Do not touch** |

---

## 9. Brainstorm Decisions (closed)

| Topic | Choice |
|------|----------|
| Slicing | Hybrid: process roles + specialists |
| Herdr vs in-session | By work type (review/docs/security in-session; long impl / parallel TDD / isolation → Herdr) |
| Roster | 8 + `verifier` (9) |
| Parent | Delegation by size (not strict orchestrator) |
| Prompts | Shared in `docs/agents/roles/`; adapters per runtime |
| Packaging | Layers (role doc + short adapter + parent rule) |
| Identities | SOULs separate; only roles |

---

## 10. Verification (when implemented)

No automated tests for agent markdown. Criteria:

- All 9 role docs and 9 adapters exist; valid frontmatter (`name`, `description`, `readonly`/`is_background` per table).
- `AGENTS.md` and `cardinal.mdc` describe Cursor as the development interface and list the 9.
- No diff in `docs/agents/*-soul.md`.
- A mental dry-run: request "fix JWT expiry" → parent does not implement alone → `tester` + `builder` + `verifier` + `security-reviewer` ∥ `reviewer`.
- Request "change AgentCard padding" → parent or `frontend`, no TDD or Herdr.

---

*Implementation: see the plan.*

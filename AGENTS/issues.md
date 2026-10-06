# Issue Tracking & Blackboard

Rules for tracking work in Cardinal System.

## Dual Tracking Model

Cardinal System operates on a dual tracking model:

1. **Integrated Blackboard (In-System Runtime Coordination):**
   - Live agent coordination, context store, active blackboard state, shared scratchpads, and real-time operational messages.
   - Transient and execution-oriented within the Cardinal runtime.

2. **GitHub Issues (Strict Development Lifecycle & SDLC):**
   - **Mandatory** for all formal development on Cardinal System (features, enhancements, bug fixes, refactors, architecture, and chores).
   - Source of truth for backlog planning, scope, acceptance criteria, reviews, and historical traceability.
   - Any non-trivial development task must be tied to a GitHub Issue on `snattydev/cardinal-system`.

## Issue Labels

Every issue must have one primary type label:

| Label | Usage |
|---|---|
| `enhancement` | New features, capability additions, architectural expansions, new protocol endpoints |
| `bug` | Unexpected behavior, regressions, test failures, or security fixes |
| `documentation` | Architecture documentation, feature specs, skill updates, agent prompts |
| `refactor` | Code health, restructuring, performance improvements without functional changes |
| `chore` | Dependency bumps, CI/CD, build tools, container configs |

Additional qualifiers: `security`, `frontend`, `backend`, `protocol`, `good first issue`, `help wanted`.

## Issue Lifecycle & Traceability

1. **Before coding:**
   - Create or assign a GitHub Issue with appropriate labels and clear acceptance criteria.
   - CLI command:
     ```bash
     gh issue create --title "<type>(<scope>): <title>" --label "<label>" --body "<description>"
     ```
2. **Branch naming:**
   - Branch names must reference the issue number when applicable:
     - `feature/#<id>-<short-description>` or `feature/<id>-<short-description>`
     - `fix/#<id>-<short-description>` or `fix/<id>-<short-description>`
     - `chore/#<id>-<short-description>` or `chore/<id>-<short-description>`
3. **Commits:**
   - Commits addressing or finishing the issue must reference it in the body: `Closes #<id>` or `Relates to #<id>` (`AGENTS/commits.md`).
4. **Pull Requests:**
   - When the PR finishes an issue, the body states `Closes #<id>` (`AGENTS/prs.md`).
   - GitHub auto-closes that keyword only when the PR merges into the default branch (`main`). A merge to `dev` leaves the issue open. PR [#36](https://github.com/snattydev/cardinal-system/pull/36) merged to `dev` with `Closes #20` on 2026-10-05; the 2026-10-06 QA reported [#20](https://github.com/snattydev/cardinal-system/issues/20) still open. Close it by hand, or let a later `dev` → `main` PR that still contains the keyword close it. Housekeeping: [#49](https://github.com/snattydev/cardinal-system/issues/49).
   - PR description links to the issue and summarizes resolution against the issue's acceptance criteria. Use `Refs #N` when the PR only records status and does not finish the issue.

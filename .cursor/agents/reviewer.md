---
name: reviewer
description: Standard code review for clarity, maintainability, conventions, and tests. Use when reviewing a Cardinal diff. Ignore security issues (use security-reviewer).
model: inherit
readonly: true
is_background: false
---

Read `docs/agents/roles/reviewer.md` and follow it. If the read fails:

- Read-only. Quality, not security.
- Output: CRITICAL / HIGH / LOW with `(none)` if empty.

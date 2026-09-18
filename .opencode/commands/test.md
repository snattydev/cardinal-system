---
description: TDD workflow — @tester writes the test (RED), runs it (must fail), then @builder implements (GREEN)
---

# /test [path] — TDD workflow

1. **@tester** writes the test for the specified module (or the one in context):
   - Mandatory TDD scopes: auth, keys, ws, db, router -> `*.test.ts` colocated with source
   - Frontend components -> verification via `bun run build`, unit tests not mandatory
2. **@tester** runs the test — it must FAIL (RED). If it passes, the test is not verifying anything real.
3. **@builder** implements the minimal functionality (GREEN).
4. **@builder** refactors without breaking tests.
5. **Verify** that the entire package test suite passes: `bun test`.

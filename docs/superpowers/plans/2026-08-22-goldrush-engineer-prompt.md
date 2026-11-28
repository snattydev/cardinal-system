# Gold Rush — Cardinal System

You are the orchestrator of a free-preview token-burn session.
Your job: execute the Cardinal System backlog item by item until it runs
out or you get blocked. Working directory: <repo-root>,
branch `dev`.

## Source of Truth

- Backlog and order: docs/superpowers/plans/2026-08-17-cardinal-v2-backlog.md
- Conventions: repo AGENTS.md (read first)
- Architecture spec when an item references it:
  docs/superpowers/specs/2026-08-12-cardinal-v2-architecture.md

## Strict Queue

1. #8 fix typecheck maxPayloadLength vs bun-types
2. #9 docs stale (roadmap/fase-2.md, roadmap.md, AGENTS.md)
3. #6 LLM Router provider-agnostic (TDD required)
4. #7 Key Factory scopes/budget/revocables (TDD required)
5. #5 seed providers + e2e with zen free real
6. #1 Mailbox messages (TDD)
7. #4 spike-002 MCP multi-vault

DO NOT TOUCH: #11 (password bootstrap — human only), #13 (deferred),
#3 (blocked by spike-002), #10 (PR dev->main is done by the owner).
If you finish the full queue: stop, report, do not invent work.

## Cycle per Item

1. Read the item detail in the backlog + files it mentions.
2. Create branch `feature/backlog-N-slug` from updated dev.
3. TDD where applicable: RED tests first, then GREEN.
4. Conventional commits in English <= 72 chars, body in Spanish.
5. Verify the item per its "Verification" section in the backlog.
   Full suite green before marking anything done: bun test.
6. Push the branch to remote. NEVER merge to dev or main.
7. Mark the item as done in your final report and move to the next.

## Hard Guardrails

- Never push to dev/main. Only feature/* branches.
- Never auto-approve or auto-merge PRs.
- If the same test fails 3 consecutive attempts: STOP. Write what you tried,
  the exact error, and your hypothesis. Stay blocked, no infinite loop.
- If something requires a design decision not in the spec: blocked with
  the specific question, do not decide on your own.
- Do not touch auth/keys/ws outside what the item requests. Security review is
  human territory.
- Do not delete or restructure files the item does not mention.
- Fresh sessions: each item starts with minimal context (item + relevant spec
  + AGENTS.md). Do not carry context from previous items.

## Report

When finishing each item (or when blocked): 5-line max summary — what
you did, tests (X pass / Y fail), files touched, branch pushed,
next item. No emojis.

## End of Session

When the preview dies or the queue ends: finish the current commit if
it is green, push, write down what is pending, and stop cleanly.

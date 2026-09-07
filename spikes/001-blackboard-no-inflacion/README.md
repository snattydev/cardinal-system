# Spike 001 — blackboard-no-inflation

> Status: VALIDATED (2026-08-12)

## Question

Given a structured shared task board (blackboard) between two agents from
different providers, when agent A posts a result and agent B picks it up,
**neither inflates its context nor writes memory**: state lives in the `tasks`
table, not in transcripts or the human's profile.

## Approach

- Shared SQLite store (`board.py`, stdlib only, no deps) with `tasks`
  (id, goal, status open|claimed|done|blocked, assigned_to, created_by, parent_id,
  bounded summary, artifact_ref, timestamps).
- `mcp_server.py`: minimal stdio MCP server (JSON-RPC 2.0 newline-delimited)
  exposing `task_create/list/claim/complete` — the *shape* of Cardinal's real
  MCP surface.
- `mcp_client.py`: test client that validates handshake and store mutation.
- Live demo: **researcher = Hermes**, **writer = opencode** (started via herdr,
  pane `w4:p9`). They coordinate a shared goal (Cardinal v0.2.0 release notes)
  only through the board.

## Demo

Shared goal = task tree:

```
942e2baa98e9  Release notes for Cardinal v0.2.0        open   (root)
├─ be83473ae1a6  Collect Phase 1 (0.2.0) features      done   researcher → facts.md
└─ ec51a52e7772  Draft release-note.md from facts      done   writer → release-note.md
```

1. Researcher (Hermes) creates the tree, claims + completes its subtask leaving
   artifact `artifacts/facts.md` and a ONE-line `summary`.
2. Writer (opencode) receives a self-contained 6-step prompt via herdr: list the
   board, find the `open` task, claim it, read `facts.md`, write
   `release-note.md`, complete with summary + artifact ref.
3. opencode ran it end-to-end (human permission approval per command via
   `herdr agent send-keys`).

## Evidence

- Final board: subtask B `status=done, assigned_to=writer, artifact_ref=artifacts/release-note.md`.
- `release-note.md` (970 bytes) faithfully reflects `facts.md`: features + fixes +
  version, without hallucinating.
- opencode ended in `idle`.

## Anti-inflation verification

- **Out-of-band channel:** coordination lived in `board.db` (separate SQLite), NOT
  in the Hermes chat or the opencode transcript. Zero interaction with the memory
  mirror or the user profile.
- **Pull, not push:** the writer only received its prompt (6 steps) + the
  `facts.md` artifact (~1 KB). It did not receive the researcher's full brainstorm
  (thousands of bytes of docs/roadmap/git log).
- **Results as refs:** what crosses the boundary is pointers (`artifact_ref`) and
  one-line summaries, not full prose. Board = 3 rows, each goal/summary one line.
- **Memory intact:** no writes to Hermes memory; the board is its own store,
  independent of `state.db` and the profile.

## Pitfalls / findings

- **MCP notifications have no response.** The client hung waiting for a reply to
  `notifications/initialized` (which does not reply). Fix: do not read when the
  message has no `id`. This was NOT a protocol bug — it was the client.
- **Buffering in MCP stdio spawned as a subprocess.** An MCP server launched by a
  real client has stdout on a pipe (block-buffered). Explicit `flush()` on the
  server was enough, but launching with `-u` + `bufsize=1` is more robust. Applies
  to spike-002 (Cardinal's real MCP client spawns the same way).
- **opencode asks for permission per shell command.** In the human→agent loop via
  herdr, each new command required `Allow once` (approve via
  `herdr agent send-keys enter`). Expected: human-in-the-loop. An unattended
  agent (cron/one-shot) needs pre-approved permissions, not manual `Allow once`.
- **opencode used a heredoc to write the file** (`cat > f << 'EOF'`). It worked,
  but the real build should let the board accept the artifact as content or path,
  not depend on how the agent chooses to write.

## Recommendation for the real build

1. Blackboard + pull + refs IS the clean form of cross-provider coordination.
   Confirmed: it does not inflate context or memory.
2. Implement the board as `tasks` + `messages` tables in Cardinal's Bun backend
   (`bun:sqlite`), exposed as MCP tools (spike-002 validates real MCP interop +
   multi-vault).
3. herdr stays the local hosting layer: discover agents, prompt, approve
   permissions. Cardinal never spawns.
4. The real MCP surface must handle "notification with no response" and stdio
   server buffering from day one.

## Hygiene note

`board.db` (binary) and `artifacts/` are spike evidence — do not commit the `.db`.

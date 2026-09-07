# Herdr Dispatcher

Dispatch work to a local terminal multiplexer pane. Do not implement product code.

<!-- REGION: when -->
## When

- Long implementation, parallel TDD, isolation, or another agent kind (another IDE instance, CLI, etc.).
- Parent provides spec, paths, and definition of done.
- "Cloud" orchestration: a Cursor CLI in Herdr that, if the UI offers to send to cloud, **accepts yes**.

## When not

- If the environment is not a multiplexer pane (`HERDR_ENV` not `1`): report it and **do not** interact with the CLI. Parent falls back to in-session subagents.
- Review, docs, and security run in-session, not in another pane, unless parent explicitly requests it.
<!-- ENDREGION: when -->

<!-- REGION: rules -->
## Rules

- Before any command: `test "${HERDR_ENV:-}" = 1`. If it fails: final message = not in Herdr + fallback. Do not inspect the session from the outside.
- Read the multiplexer skill/CLI (`herdr`) in the environment; do not copy the entire manual into your response.
- Launch tab: if the workspace has a tab with `label` equal to `Background`, use it. Reuse an idle shell pane in that tab before splitting. Do not launch in the orchestrator tab (Work) or other panes (Hermes, etc.).
- Split: `--no-focus`, same cwd. `right` if the pane is wide, `down` if it is tall.
- Agent names: `[a-z][a-z0-9_-]{0,31}`, unique (e.g. `card-builder`).
- Kind: requested by parent. For cloud spoofing the default is `cursor`. Discover valid kinds with CLI help; **do not invent slugs**.
- Remote prompt must be **self-contained** (spec, paths, DoD). The remote does not see parent's chat.
- **Cloud (Cursor CLI):** if the UI mentions sending / build in cloud, choose **yes**. Do not choose "build locally". Reliable handoff: prefix `&` in the `agent prompt` (any message with `&` goes to Cloud Agent). If the plan menu appears (`Ready to build?` / Build in cloud), inspect the pane and `send-keys` until cloud is selected (not local, not Esc/propose).
- `blocked` state other than that cloud menu: report it; do not approve permissions without explicit human authorization in that session.
- Cleanup: close panes **you created** once the agent has exited or work has moved to cloud, **only if the tab retains ≥1 pane**. Never close the last pane in a tab. If it is the last pane and remains occupied by the local launcher, send `send-keys ctrl+c` to return to shell. Do not close tabs/workspaces or other panes. Never run `herdr server stop`.
- This is the human/IDE interface, not the Cardinal product. Cardinal does not spawn agents.
<!-- ENDREGION: rules -->

<!-- REGION: output -->
## Output (final message)

Include a markdown fence in your final message with:

```
## Dispatch
pane_id: …

agent: …

kind: …

tab: …

cloud_handoff: yes | no | n/a

pane_closed: yes | no (last pane kept)

## Result
remote summary

## Fallback
(none) | not in Herdr — parent must use in-session subagents
```
<!-- ENDREGION: output -->

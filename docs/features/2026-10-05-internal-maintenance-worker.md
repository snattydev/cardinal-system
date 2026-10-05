# Internal maintenance worker (N1)

Lightweight ephemeral Podman workers for maintenance, summary, and hygiene.
Cardinal may create and destroy these containers. Herdr still owns CLI agents.

Landed on `dev` via PR [#36](https://github.com/snattydev/cardinal-system/pull/36) (issue [#20](https://github.com/snattydev/cardinal-system/issues/20)).

## What was done

- `packages/worker` (`@cardinal/worker`) defines the JSON stdin/stdout contract and
  parses/validates I/O with `parseWorkerInput` / `parseWorkerOutput`.
- `WorkerOrchestrator` in `backend/src/orchestrator/` mints a scoped key, spawns a
  driver, parses stdout, and revokes the key on success, failure, timeout, or
  malformed output.
- `SqliteEphemeralKeyProvider` registers the `cardinal-worker` subagent, inserts
  a `created_by=system` key with the run's scopes and a TTL, then revokes it.
- `PodmanWorkerDriver` runs `localhost/cardinal-worker:latest` on `cardinal-net`
  only: `--rm`, `--cap-drop=ALL`, memory and CPU caps, no host port publish, no
  volume mounts. Timeout kills the process and runs `podman rm -f`.
- Image definition: `deploy/Containerfile.worker`. The default task handler calls
  `GET {CARDINAL_URL}/v1/models` with `Authorization: Bearer ${CARDINAL_KEY}`.
  A missing env var or a non-2xx response fails the task. MCP tool calls and
  memory writes are not implemented in this slice.
- `@cardinal/mcp` remains the MCP **server** package; the worker does not embed it.

## Architecture

```
Backend (future N2 caller)
  WorkerOrchestrator.dispatch()
    -> SqliteEphemeralKeyProvider.createEphemeralKey(scopes, ttl)
    -> PodmanWorkerDriver.spawn()  // stdin JSON, stdout JSON
    -> parseWorkerOutput(stdout)
    -> revokeEphemeralKey()  // always in finally
```

**Not wired yet:** no `POST /api/tasks` or blackboard hook calls the orchestrator.
Import `WorkerOrchestrator` from `backend/src/orchestrator/` in backend code or
tests; N2 will connect Tasks v2 assignment to `dispatch()`.

## JSON contract (camelCase)

Worker stdin (one JSON object, written by `PodmanWorkerDriver`):

```json
{
  "taskId": "task-abc",
  "taskType": "maintenance",
  "prompt": "Check router reachability",
  "memoryScopes": ["memory:read"],
  "timeoutSeconds": 300
}
```

Worker stdout (one JSON line):

```json
{
  "taskId": "task-abc",
  "status": "success",
  "summary": "Maintenance task task-abc executed at ...",
  "memoryWrites": [{ "path": "vaults/...", "content": "...", "action": "write" }],
  "escalation": "optional_machine_code"
}
```

| Field | Rules |
|-------|--------|
| `taskType` | `maintenance` \| `summary` \| `hygiene` |
| `status` | `success` \| `failure` |
| `memoryWrites` | Optional; validated when present (not written by default handler) |
| `escalation` | Optional string; orchestrator sets codes such as `worker_timeout_exceeded` |

## Ephemeral key scopes

Each dispatch adds scopes: `task:worker`, `router:completions`, plus any
`memoryScopes` from the task. Default timeout: **300s** (orchestrator and key TTL).

Container env (set by Podman driver): `CARDINAL_URL`, `CARDINAL_KEY`, `TASK_ID`.

## Why

v3 splits labor: Cardinal workers do bounded upkeep; persistent Herdr agents
keep heavy coding. The orchestrator is the spawn path Tasks v2 (N2) will call.

## Decisions

- Keys are hashed with the existing `agent_keys` path. Plaintext exists only
  in the container env for the run, then `revokeKeyById` stamps `revoked_at`.
  `expires_at` is the backstop if revoke fails.
- One shared agent name (`cardinal-worker`, kind `subagent`) with one key per
  dispatch. The task id is not a column on `agent_keys`.
- Network bound means the internal compose network and no published ports, not
  a packet filter. The container still needs that network to reach the backend.
- The router probe is the worker's use of the ephemeral key. `GET /v1/models`
  is the check that the key and URL were injected.
- Mock driver covers lifecycle tests. Podman itself is not started in `bun test`.

## Operations

### Build worker image

```bash
podman build -t cardinal-worker:latest -f deploy/Containerfile.worker .
```

The driver default image is `localhost/cardinal-worker:latest` on network
`cardinal-net` (match your compose network name).

### Common pitfalls

| Symptom | Likely cause |
|---------|----------------|
| `router probe failed with status 401` | Key revoked early, wrong `CARDINAL_KEY`, or scopes missing `router:completions` |
| `CARDINAL_URL and CARDINAL_KEY are required` | Container started without driver env injection |
| Timeout / exit 124 | Task exceeded `timeoutSeconds`; container force-removed |
| `Failed to parse worker stdout JSON` | Worker crashed before printing JSON, or extra log lines on stdout |

## How to test

1. `bun test packages/worker/src/worker.test.ts packages/worker/src/router-probe.test.ts`
2. `bun test backend/src/orchestrator/`
3. Image build (optional, needs Podman):
   `podman build -t cardinal-worker:latest -f deploy/Containerfile.worker .`

## Code map

| Area | Path |
|------|------|
| Protocol types | `packages/worker/src/types.ts` |
| Stdin runner | `packages/worker/src/runner.ts`, `main.ts` |
| Default handler | `packages/worker/src/tasks.ts`, `router-probe.ts` |
| Orchestrator | `backend/src/orchestrator/orchestrator.ts` |
| Podman spawn | `backend/src/orchestrator/podman-driver.ts` |
| Key mint/revoke | `backend/src/orchestrator/key-provider.ts` |

# Internal maintenance worker (N1)

Lightweight ephemeral Podman workers for maintenance, summary, and hygiene.
Cardinal may create and destroy these containers. Herdr still owns CLI agents.

## What was done

- `packages/worker` speaks the JSON stdin/stdout contract and returns
  `{ taskId, status, summary, memoryWrites?, escalation? }`.
- `WorkerOrchestrator` mints a scoped key, spawns a driver, parses stdout, and
  revokes the key on success, failure, timeout, or malformed output.
- `SqliteEphemeralKeyProvider` registers the `cardinal-worker` subagent, inserts
  a `created_by=system` key with the run's scopes and a TTL, then revokes it.
- `PodmanWorkerDriver` runs `localhost/cardinal-worker:latest` on `cardinal-net`
  only: `--rm`, `--cap-drop=ALL`, memory and CPU caps, no host port publish, no
  volume mounts. Timeout kills the process and runs `podman rm -f`.
- Image definition: `deploy/Containerfile.worker`. The default handler echoes
  the task type; it does not call the router or write memory yet.

## Why

v3 splits labor: Cardinal workers do bounded upkeep; persistent Herdr agents
keep heavy coding. The orchestrator is the spawn path Tasks v2 (N2) will call.
It is not wired to `POST /api/tasks` in this change.

## Decisions

- Keys are hashed with the existing `agent_keys` path. Plaintext exists only
  in the container env for the run, then `revokeKeyById` stamps `revoked_at`.
  `expires_at` is the backstop if revoke fails.
- One shared agent name (`cardinal-worker`, kind `subagent`) with one key per
  dispatch. The task id is not a column on `agent_keys`.
- Network bound means the internal compose network and no published ports, not
  a packet filter. The container still needs that network to reach the backend.
- Mock driver covers lifecycle tests. Podman itself is not started in `bun test`.

## How to test

1. `bun test packages/worker/src/worker.test.ts`
2. `bun test backend/src/orchestrator/`
3. Image build (optional, needs Podman):
   `podman build -t cardinal-worker:latest -f deploy/Containerfile.worker .`

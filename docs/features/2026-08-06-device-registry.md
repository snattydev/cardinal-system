# Device Registry — Fase 1.8.1 + 1.8.2

**Date:** 2026-08-06
**Phase:** Fase 1 — Context Store (Device Registry)

## What

Implemented the minimal Device Registry on top of the existing `agents` table:

- **1.8.1** — Migration 8: `ALTER TABLE agents ADD COLUMN device_info TEXT;` stores device info JSON per agent.
- **1.8.2** — API `GET /api/devices` (deduplicated device list) + `POST /api/devices/heartbeat` (agent reports its device), plus WS broadcast `devices_update` to dashboards on agent connect/disconnect.

## Why

The Context Store specification (section 3.7) defines the Device Registry with fields `id, hostname, platform, arch, gpu, ram_gb, last_seen, ip, profiles`. Agents do not send this info in the WS `hello` (protocol remains untouched); instead, they report it via HTTP heartbeat. The dashboard needs to view deduplicated physical devices and receive real-time updates when an agent connects or disconnects.

## Decisions

### `device_info` as JSON in `agents` (no separate `devices` table)

The original spec proposed `devices` + `device_profiles` tables. For this phase, extending `agents` with `device_info TEXT` (JSON) was chosen for simplicity and consistency with the repo's existing pattern (everything in one row per agent). `listDevices` deduplicates by grouping by `hostname` (fallback: `agents.device`) and returns agent `count` per device + `profiles` (agent names). No new table created -> no existing data migration needed.

### HTTP heartbeat, no WS protocol change

The task specification explicitly requires: "Do NOT change the hello/pong protocol or existing message types". Device info travels via `POST /api/devices/heartbeat` with body `{agent, info}`. The WS only reacts: emits `devices_update` (payload = `listDevices`) in `onHello` and in `disconnectAgent`.

### `updateAgentDeviceInfo` bumps `device` from `hostname`

If `info.hostname` is provided, `agents.device` is also updated to that value (the device becomes the physical host). Always refreshes `last_seen`.

### Routes with JWT auth

Both endpoints require `getSessionUser` (session cookie), matching the pattern across `/api/*`.

## Alternatives Considered

- **`devices` + `device_profiles` tables from original spec:** more normalized, but adds a table and FKs for a dataset that is currently 1:1 agent<->device. Deferred to Fase 2+ if multi-profile per device is required.
- **Send device_info in WS `hello`:** breaks existing protocol and is prohibited by task spec.

## Files Created

```
backend/src/api/devices.ts         <- handleListDevices + handleDeviceHeartbeat
```

## Files Modified

```
packages/db/src/schema.ts          <- migration 8: device_info TEXT
packages/core/src/types.ts         <- AgentRow.device_info + DeviceInfo/DeviceRow types
packages/core/src/index.ts         <- export DeviceInfo/DeviceRow
packages/db/src/repos.ts           <- updateAgentDeviceInfo + listDevices
packages/db/src/index.ts           <- new exports
backend/src/server.ts              <- GET /api/devices + POST /api/devices/heartbeat (JWT) routes
packages/ws/src/hub.ts             <- broadcastDevices() + calls in hello/disconnect

packages/db/src/db.test.ts         <- migration 8 tests + devices repos
packages/ws/src/hub.test.ts        <- devices_update tests + bye test adjustment
backend/src/api/api.test.ts        <- devices handlers tests
backend/src/server.test.ts         <- devices routes tests (auth + heartbeat)
```

## Test Results

Strict TDD: RED confirmed (7 failing tests due to missing features: `Cannot find module './devices'`, `Export named 'listDevices' not found`, 404 routes, `devices_update` not emitted) -> final GREEN:

```
195 pass
 0 fail
572 expect() calls
Ran 195 tests across 10 files.
```

Backend typecheck: `bun x tsc --noEmit -p backend/tsconfig.json` -> exit 0.

## Security Note

Modified `packages/ws/src/hub.ts` -> per AGENTS.md, a **Security Review** is required before merging to `main` (changes to WS protocol / broadcast).

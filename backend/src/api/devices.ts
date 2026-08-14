import type { Database } from "bun:sqlite";
import { json } from "@cardinal/core";
import type { AgentRow, DeviceRow } from "@cardinal/core";
import { getAgent, listDevices, updateAgentDeviceInfo } from "@cardinal/db";

function deviceFromAgent(agent: AgentRow, info: Record<string, unknown>): DeviceRow {
  const hostname = typeof info.hostname === "string" && info.hostname.length > 0 ? info.hostname : null;
  return {
    id: hostname ?? agent.device,
    hostname,
    platform: typeof info.platform === "string" ? info.platform : null,
    arch: typeof info.arch === "string" ? info.arch : null,
    gpu: typeof info.gpu === "string" ? info.gpu : null,
    ram_gb: typeof info.ram_gb === "number" ? info.ram_gb : null,
    ip: typeof info.ip === "string" ? info.ip : null,
    last_seen: agent.last_seen,
    profiles: [agent.name],
    agents: 1,
  };
}

export function handleListDevices(db: Database): Response {
  return json({ devices: listDevices(db) });
}

export async function handleDeviceHeartbeat(db: Database, name: string, req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const info = body.info;
  if (typeof info !== "object" || info === null || Array.isArray(info)) {
    return json({ error: "bad_request" }, 400);
  }

  const agent = getAgent(db, name);
  if (!agent) return json({ error: "agent_not_found" }, 404);

  updateAgentDeviceInfo(db, name, info as Record<string, unknown>);
  const updated = getAgent(db, name)!;
  return json({ device: deviceFromAgent(updated, info as Record<string, unknown>) });
}

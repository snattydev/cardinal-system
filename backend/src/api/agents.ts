import type { Database } from "bun:sqlite";
import { json } from "@cardinal/core";
import { getAgent, listAgents, listEvents } from "@cardinal/db";
import { agentToPayload } from "@cardinal/ws";

export function handleListAgents(db: Database): Response {
  return json({ agents: listAgents(db).map(agentToPayload) });
}

export function handleGetAgent(db: Database, name: string): Response {
  const row = getAgent(db, name);
  if (!row) return json({ error: "not_found" }, 404);
  return json({ agent: agentToPayload(row), events: listEvents(db, name, 20) });
}

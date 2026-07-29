export type AgentKind = "agent" | "subagent";

export interface AgentRow {
  name: string;
  device: string;
  kind: AgentKind;
  status: string;
  connected: number;
  last_seen: string | null;
  created_at: string;
}

export interface AgentKeyRow {
  id: number;
  key_hash: string;
  agent_name: string;
  kind_override: AgentKind | null;
  created_by: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface AgentEventRow {
  id: number;
  agent_name: string;
  type: "connect" | "disconnect" | "status";
  meta: string | null;
  at: string;
}

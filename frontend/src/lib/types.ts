export interface AgentPayload {
  name: string;
  device: string;
  kind: "agent" | "subagent";
  status: string;
  connected: boolean;
  lastSeen: string | null;
}

export interface AgentEvent {
  id: number;
  agent_name: string;
  type: "connect" | "disconnect" | "status";
  meta: string | null;
  at: string;
}

export type ServerEvent =
  | { type: "roster"; agents: AgentPayload[] }
  | { type: "agent_update"; agent: AgentPayload };

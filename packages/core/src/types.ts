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

export type ProfileKind = "permanent" | "one-shot";
export type ProfileStatus = "active" | "dormant" | "liberated";

export interface ProfileRow {
  name: string;
  display_name: string | null;
  emoji: string | null;
  kind: ProfileKind;
  status: ProfileStatus;
  model_default: string | null;
  provider_default: string | null;
  device: string | null;
  last_onboarded: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface SoulRow {
  profile_name: string;
  soul_md: string | null;
  personality_tags: string | null;
  tool_restrictions: string | null;
  canon_ref: string | null;
  version: number;
  updated_at: string | null;
}

export interface ConfigTemplateRow {
  profile_name: string;
  config_yaml: string | null;
  version: number;
  updated_at: string | null;
}

export interface SkillRow {
  name: string;
  description: string | null;
  category: string | null;
  content_hash: string | null;
  path: string | null;
  required_toolsets: string | null;
  updated_at: string | null;
}

export type MemoryTarget = "memory" | "user";
export type SyncDirection = "local_primary" | "cardinal_primary" | "bidirectional";

export interface MemoryMirrorRow {
  profile_name: string;
  target: MemoryTarget;
  content: string | null;
  char_count: number;
  content_hash: string | null;
  last_synced: string | null;
  sync_direction: SyncDirection;
}

export interface SessionRow {
  id: string;
  profile_name: string;
  title: string | null;
  model: string | null;
  started_at: number | null;
  message_count: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
}

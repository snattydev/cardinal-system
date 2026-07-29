import { z } from "zod";
import type { AgentKind } from "./types";

const helloSchema = z.object({
  type: z.literal("hello"),
  key: z.string().min(1),
  device: z.string().min(1).default("unknown"),
  status: z.enum(["idle", "busy"]).default("idle"),
});
const pongSchema = z.object({
  type: z.literal("pong"),
  status: z.enum(["idle", "busy"]).optional(),
});
const byeSchema = z.object({ type: z.literal("bye") });
const subscribeSchema = z.object({ type: z.literal("subscribe") });

export const clientMessageSchema = z.discriminatedUnion("type", [
  helloSchema,
  pongSchema,
  byeSchema,
  subscribeSchema,
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ParseResult = { ok: true; msg: ClientMessage } | { ok: false };

export function parseClientMessage(raw: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false };
  }
  const parsed = clientMessageSchema.safeParse(data);
  return parsed.success ? { ok: true, msg: parsed.data } : { ok: false };
}

export function resolveKind(device: string, override: AgentKind | null): AgentKind {
  return override ?? (device === "localhost" ? "subagent" : "agent");
}

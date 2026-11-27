import type { Database } from "bun:sqlite";
import { json } from "@cardinal/core";
import { logMcpUsage } from "@cardinal/db";
import { z } from "zod";

const mcpUsageSchema = z.object({
  tool_name: z.string().trim().min(1).max(128),
  ok: z.boolean().optional().default(true),
  bytes_out: z.number().int().min(0).optional().default(0),
  duration_ms: z.number().int().min(0).optional().default(0),
});

export async function handleLogMcpUsage(
  db: Database,
  req: Request,
  agentName: string,
): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const parsed = mcpUsageSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "bad_request" }, 400);
  }

  logMcpUsage(db, {
    agentName,
    toolName: parsed.data.tool_name,
    ok: parsed.data.ok,
    bytesOut: parsed.data.bytes_out,
    durationMs: parsed.data.duration_ms,
  });

  return json({ ok: true });
}

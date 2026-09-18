import type { Database } from "bun:sqlite";
import { json } from "@cardinal/core";
import type { MessageRow } from "@cardinal/core";
import { getMessage, listInbox, markMessageRead, sendMessage } from "@cardinal/db";
import { z } from "zod";

const sendSchema = z.object({
  from_agent: z.string().trim().min(1),
  to_agent: z.string().trim().min(1),
  type: z.string().trim().min(1),
  payload_ref: z.string().nullable().optional(),
});

export async function handleSendMessage(
  db: Database,
  req: Request,
  onChange?: (m: MessageRow) => void,
  fromAgentOverride?: string,
): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "bad_request" }, 400);
  }

  const message = sendMessage(db, {
    fromAgent: fromAgentOverride ?? parsed.data.from_agent,
    toAgent: parsed.data.to_agent,
    type: parsed.data.type,
    payloadRef: parsed.data.payload_ref,
  });
  onChange?.(message);
  return json({ message });
}

export function handleInbox(db: Database, req: Request, toAgentOverride?: string): Response {
  const toAgent = toAgentOverride ?? new URL(req.url).searchParams.get("to_agent");
  if (toAgent === null || toAgent === "") {
    return json({ error: "missing_to_agent" }, 400);
  }
  return json({ messages: listInbox(db, toAgent) });
}

export async function handleMarkRead(
  db: Database,
  id: string,
  req: Request,
  onChange?: (m: MessageRow) => void,
  actorAgent?: string,
): Promise<Response> {
  void req;
  const existing = getMessage(db, id);
  if (!existing) return json({ error: "not_found" }, 404);
  if (actorAgent !== undefined && existing.to_agent !== actorAgent) {
    return json({ error: "forbidden" }, 403);
  }
  const message = markMessageRead(db, id);
  if (!message) return json({ error: "not_found" }, 404);
  onChange?.(message);
  return json({ message });
}

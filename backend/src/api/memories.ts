import type { Database } from "bun:sqlite";
import { json } from "@cardinal/core";
import type { MemoryTarget, SyncDirection } from "@cardinal/core";
import { getMemoryMirror, getProfile, upsertMemoryMirror } from "@cardinal/db";
import type { MemoryMirrorFields } from "@cardinal/db";

const SYNC_DIRECTIONS: SyncDirection[] = ["local_primary", "cardinal_primary", "bidirectional"];

export function handleGetMemory(db: Database, profileName: string, target: MemoryTarget): Response {
  const profile = getProfile(db, profileName);
  if (!profile) return json({ error: "not_found" }, 404);
  const memory = getMemoryMirror(db, profileName, target);
  if (!memory) return json({ error: "not_found" }, 404);
  return json({ memory });
}

export async function handlePutMemory(
  db: Database,
  profileName: string,
  target: MemoryTarget,
  req: Request,
): Promise<Response> {
  const profile = getProfile(db, profileName);
  if (!profile) return json({ error: "not_found" }, 404);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const raw = (body ?? {}) as Record<string, unknown>;
  const fields: MemoryMirrorFields = {};

  if (raw.sync_direction !== undefined) {
    if (
      typeof raw.sync_direction !== "string" ||
      !SYNC_DIRECTIONS.includes(raw.sync_direction as SyncDirection)
    ) {
      return json({ error: "invalid_sync_direction" }, 400);
    }
    fields.sync_direction = raw.sync_direction as SyncDirection;
  }

  if (raw.content !== undefined) {
    if (typeof raw.content !== "string") {
      return json({ error: "invalid_content" }, 400);
    }
    fields.content = raw.content;
  }

  upsertMemoryMirror(db, profileName, target, fields);
  return json({ memory: getMemoryMirror(db, profileName, target) });
}

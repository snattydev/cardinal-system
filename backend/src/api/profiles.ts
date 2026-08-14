import type { Database } from "bun:sqlite";
import { json } from "@cardinal/core";
import type { ProfileKind, ProfileStatus } from "@cardinal/core";
import { getProfile, listProfiles, upsertProfile } from "@cardinal/db";
import type { ProfileFields } from "@cardinal/db";

const PROFILE_KINDS: ProfileKind[] = ["permanent", "one-shot"];
const PROFILE_STATUSES: ProfileStatus[] = ["active", "dormant", "liberated"];

export function handleListProfiles(db: Database): Response {
  return json({ profiles: listProfiles(db) });
}

export function handleGetProfile(db: Database, name: string): Response {
  const profile = getProfile(db, name);
  if (!profile) return json({ error: "not_found" }, 404);
  return json({ profile });
}

export async function handlePutProfile(db: Database, name: string, req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const fields: ProfileFields = {};
  const raw = (body ?? {}) as Record<string, unknown>;

  if (raw.kind !== undefined) {
    if (typeof raw.kind !== "string" || !PROFILE_KINDS.includes(raw.kind as ProfileKind)) {
      return json({ error: "invalid_kind" }, 400);
    }
    fields.kind = raw.kind as ProfileKind;
  }

  if (raw.status !== undefined) {
    if (typeof raw.status !== "string" || !PROFILE_STATUSES.includes(raw.status as ProfileStatus)) {
      return json({ error: "invalid_status" }, 400);
    }
    fields.status = raw.status as ProfileStatus;
  }

  for (const key of [
    "display_name",
    "emoji",
    "model_default",
    "provider_default",
    "device",
    "last_onboarded",
  ] as const) {
    const value = raw[key];
    if (value !== undefined) fields[key] = typeof value === "string" ? value : null;
  }

  upsertProfile(db, name, fields);
  return json({ profile: getProfile(db, name) });
}

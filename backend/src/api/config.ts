import type { Database } from "bun:sqlite";
import { json } from "@cardinal/core";
import { getConfigTemplate, getProfile, upsertConfigTemplate } from "@cardinal/db";
import type { ConfigFields } from "@cardinal/db";

export function handleGetConfig(db: Database, profileName: string): Response {
  const profile = getProfile(db, profileName);
  if (!profile) return json({ error: "profile_not_found" }, 404);
  const config = getConfigTemplate(db, profileName);
  if (!config) return json({ error: "not_found" }, 404);
  return json({ config });
}

export async function handlePutConfig(
  db: Database,
  profileName: string,
  req: Request,
): Promise<Response> {
  const profile = getProfile(db, profileName);
  if (!profile) return json({ error: "profile_not_found" }, 404);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const fields: ConfigFields = {};
  const raw = (body ?? {}) as Record<string, unknown>;

  if (raw.config_yaml !== undefined) {
    if (typeof raw.config_yaml !== "string") {
      return json({ error: "invalid_config_yaml" }, 400);
    }
    fields.config_yaml = raw.config_yaml;
  }

  upsertConfigTemplate(db, profileName, fields);
  return json({ config: getConfigTemplate(db, profileName) });
}

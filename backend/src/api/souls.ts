import type { Database } from "bun:sqlite";
import { json } from "@cardinal/core";
import { getSoul } from "@cardinal/db";

export function handleGetSoul(db: Database, name: string): Response {
  const soul = getSoul(db, name);
  if (!soul) return json({ error: "not_found" }, 404);
  return json({ soul });
}

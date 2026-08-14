import type { Database } from "bun:sqlite";
import { json } from "@cardinal/core";
import { listSessions } from "@cardinal/db";

export function handleListSessions(db: Database): Response {
  return json({ sessions: listSessions(db) });
}

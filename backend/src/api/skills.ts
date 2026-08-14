import type { Database } from "bun:sqlite";
import { json } from "@cardinal/core";
import { getProfile, getSkill, listSkills, listSkillsForProfile } from "@cardinal/db";

export function handleListSkills(db: Database): Response {
  return json({ skills: listSkills(db) });
}

export function handleGetSkill(db: Database, name: string): Response {
  const skill = getSkill(db, name);
  if (!skill) return json({ error: "not_found" }, 404);
  return json({ skill });
}

export function handleListProfileSkills(db: Database, profileName: string): Response {
  const profile = getProfile(db, profileName);
  if (!profile) return json({ error: "profile_not_found" }, 404);
  return json({ skills: listSkillsForProfile(db, profileName) });
}

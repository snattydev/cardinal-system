import { describe, expect, test } from "bun:test";
import {
  addSkillToProfile,
  createDb,
  insertEvent,
  registerAgent,
  upsertAgentOnConnect,
  upsertProfile,
  upsertSkill,
  upsertSoul,
} from "@cardinal/db";
import { handleHealth } from "./health";
import { handleGetAgent, handleListAgents } from "./agents";
import { handleGetProfile, handleListProfiles, handlePutProfile } from "./profiles";
import { handleGetSoul } from "./souls";
import { handleGetSkill, handleListProfileSkills, handleListSkills } from "./skills";
import rootPkg from "../../../package.json";

describe("handleListProfiles", () => {
  test("DB vacía → {profiles: []}", async () => {
    const db = createDb(":memory:");
    const res = handleListProfiles(db);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ profiles: [] });
    db.close();
  });

  test("con perfiles → lista ordenada por name", async () => {
    const db = createDb(":memory:");
    upsertProfile(db, "shinon", { display_name: "Shinon" });
    upsertProfile(db, "kirito", {});
    const res = handleListProfiles(db);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { profiles: Array<{ name: string }> };
    expect(body.profiles.map((p) => p.name)).toEqual(["kirito", "shinon"]);
    db.close();
  });
});

describe("handleGetProfile", () => {
  test("perfil desconocido → 404 {error: 'not_found'}", async () => {
    const db = createDb(":memory:");
    const res = handleGetProfile(db, "nobody");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    db.close();
  });

  test("perfil conocido → 200 con {profile}", async () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", { display_name: "Hermes", emoji: "🧙" });
    const res = handleGetProfile(db, "hermes");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { profile: Record<string, unknown> };
    expect(body.profile).toMatchObject({
      name: "hermes",
      display_name: "Hermes",
      emoji: "🧙",
      kind: "permanent",
      status: "active",
    });
    db.close();
  });
});

describe("handlePutProfile", () => {
  test("crea un perfil con defaults", async () => {
    const db = createDb(":memory:");
    const req = new Request("http://localhost/api/profiles/hermes", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ display_name: "Hermes", emoji: "🧙" }),
    });
    const res = await handlePutProfile(db, "hermes", req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { profile: Record<string, unknown> };
    expect(body.profile).toMatchObject({ name: "hermes", kind: "permanent", status: "active" });
    db.close();
  });

  test("actualiza campos existentes y preserva los no enviados", async () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", { display_name: "Hermes", device: "laptop" });
    const req = new Request("http://localhost/api/profiles/hermes", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "dormant" }),
    });
    const res = await handlePutProfile(db, "hermes", req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { profile: Record<string, unknown> };
    expect(body.profile).toMatchObject({
      name: "hermes",
      status: "dormant",
      display_name: "Hermes",
      device: "laptop",
    });
    db.close();
  });

  test("kind inválido → 400 {error: 'invalid_kind'}", async () => {
    const db = createDb(":memory:");
    const req = new Request("http://localhost/api/profiles/hermes", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "ghost" }),
    });
    const res = await handlePutProfile(db, "hermes", req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_kind" });
    db.close();
  });

  test("status inválido → 400 {error: 'invalid_status'}", async () => {
    const db = createDb(":memory:");
    const req = new Request("http://localhost/api/profiles/hermes", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "zombie" }),
    });
    const res = await handlePutProfile(db, "hermes", req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_status" });
    db.close();
  });

  test("body no JSON → 400 {error: 'bad_request'}", async () => {
    const db = createDb(":memory:");
    const req = new Request("http://localhost/api/profiles/hermes", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "no es json",
    });
    const res = await handlePutProfile(db, "hermes", req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
    db.close();
  });
});

describe("handleHealth", () => {
  test("200 con status ok y la versión del package.json raíz", async () => {
    const res = handleHealth();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body).toEqual({ status: "ok", version: rootPkg.version });
  });
});

describe("handleListAgents", () => {
  test("DB vacía → {agents: []}", async () => {
    const db = createDb(":memory:");
    const res = handleListAgents(db);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ agents: [] });
    db.close();
  });

  test("con un agente conectado → AgentPayload con connected boolean y lastSeen string", async () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    upsertAgentOnConnect(db, { name: "shinon", device: "pc", kind: "agent", status: "idle" });

    const res = handleListAgents(db);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { agents: Array<Record<string, unknown>> };
    expect(body.agents).toHaveLength(1);
    const shinon = body.agents[0];
    expect(shinon).toMatchObject({ name: "shinon", device: "pc", kind: "agent", status: "idle" });
    expect(shinon.connected).toBe(true);
    expect(typeof shinon.lastSeen).toBe("string");
    db.close();
  });
});

describe("handleGetAgent", () => {
  test("agente desconocido → 404 {error: 'not_found'}", async () => {
    const db = createDb(":memory:");
    const res = handleGetAgent(db, "nobody");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    db.close();
  });

  test("agente conocido → 200 con agent y últimos 20 eventos en DESC", async () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    upsertAgentOnConnect(db, { name: "shinon", device: "pc", kind: "agent", status: "idle" });
    for (let i = 1; i <= 25; i++) {
      insertEvent(db, { agentName: "shinon", type: "status", meta: `s${i}` });
    }

    const res = handleGetAgent(db, "shinon");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      agent: Record<string, unknown>;
      events: Array<{ id: number; meta: string }>;
    };
    expect(body.agent).toMatchObject({ name: "shinon", connected: true });
    expect(body.events).toHaveLength(20);
    expect(body.events[0].meta).toBe("s25");
    expect(body.events[19].meta).toBe("s6");
    db.close();
  });
});

describe("handleGetSoul", () => {
  test("soul desconocido → 404 {error: 'not_found'}", async () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    const res = handleGetSoul(db, "hermes");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    db.close();
  });

  test("soul conocido → 200 con {soul}", async () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    upsertSoul(db, "hermes", { soul_md: "# alma", personality_tags: "curioso" });
    const res = handleGetSoul(db, "hermes");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { soul: Record<string, unknown> };
    expect(body.soul).toMatchObject({
      profile_name: "hermes",
      soul_md: "# alma",
      personality_tags: "curioso",
      tool_restrictions: null,
      canon_ref: null,
      version: 1,
      updated_at: null,
    });
    db.close();
  });
});

describe("handleListSkills", () => {
  test("DB vacía → {skills: []}", async () => {
    const db = createDb(":memory:");
    const res = handleListSkills(db);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ skills: [] });
    db.close();
  });

  test("con skills → lista ordenada por name", async () => {
    const db = createDb(":memory:");
    upsertSkill(db, "git", { description: "git workflows" });
    upsertSkill(db, "bash", { description: "shell scripting" });
    const res = handleListSkills(db);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { skills: Array<{ name: string }> };
    expect(body.skills.map((s) => s.name)).toEqual(["bash", "git"]);
    db.close();
  });
});

describe("handleGetSkill", () => {
  test("skill desconocido → 404 {error: 'not_found'}", async () => {
    const db = createDb(":memory:");
    const res = handleGetSkill(db, "nobody");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    db.close();
  });

  test("skill conocido → 200 con {skill}", async () => {
    const db = createDb(":memory:");
    upsertSkill(db, "git", {
      description: "git workflows",
      category: "dev",
      content_hash: "abc123",
      path: "skills/git.md",
      required_toolsets: "shell",
    });
    const res = handleGetSkill(db, "git");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { skill: Record<string, unknown> };
    expect(body.skill).toMatchObject({
      name: "git",
      description: "git workflows",
      category: "dev",
      content_hash: "abc123",
      path: "skills/git.md",
      required_toolsets: "shell",
      updated_at: null,
    });
    db.close();
  });
});

describe("handleListProfileSkills", () => {
  test("perfil inexistente → 404 {error: 'profile_not_found'}", async () => {
    const db = createDb(":memory:");
    const res = handleListProfileSkills(db, "ghost");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "profile_not_found" });
    db.close();
  });

  test("perfil sin skills → 200 con {skills: []}", async () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    upsertSkill(db, "git", { description: "git workflows" });
    const res = handleListProfileSkills(db, "hermes");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ skills: [] });
    db.close();
  });

  test("perfil con skills → 200 con skills y pinned", async () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    upsertSkill(db, "git", { description: "git workflows" });
    upsertSkill(db, "bash", { description: "shell scripting" });
    addSkillToProfile(db, "hermes", "git", { pinned: 1 });
    addSkillToProfile(db, "hermes", "bash", {});
    const res = handleListProfileSkills(db, "hermes");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { skills: Array<{ name: string; pinned: number }> };
    expect(body.skills.map((s) => s.name)).toEqual(["bash", "git"]);
    expect(body.skills[1]).toMatchObject({ name: "git", pinned: 1 });
    db.close();
  });
});

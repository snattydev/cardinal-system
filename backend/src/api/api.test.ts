import { describe, expect, test } from "bun:test";
import {
  addSkillToProfile,
  createDb,
  getAgent,
  insertEvent,
  registerAgent,
  updateAgentDeviceInfo,
  upsertAgentOnConnect,
  upsertConfigTemplate,
  upsertMemoryMirror,
  upsertProfile,
  upsertSession,
  upsertSkill,
  upsertSoul,
} from "@cardinal/db";
import { handleHealth } from "./health";
import { handleGetAgent, handleListAgents } from "./agents";
import { handleDeviceHeartbeat, handleListDevices } from "./devices";
import { handleGetProfile, handleListProfiles, handlePutProfile } from "./profiles";
import { handleGetSoul } from "./souls";
import { handleGetSkill, handleListProfileSkills, handleListSkills } from "./skills";
import { handleGetMemory, handlePutMemory } from "./memories";
import { handleListSessions } from "./sessions";
import { handleRagSearch } from "./rag";
import { handleGetConfig, handlePutConfig } from "./config";
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

describe("handleGetMemory", () => {
  test("perfil inexistente → 404 {error: 'not_found'}", async () => {
    const db = createDb(":memory:");
    const res = handleGetMemory(db, "ghost", "memory");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    db.close();
  });

  test("mirror inexistente → 404 {error: 'not_found'}", async () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    const res = handleGetMemory(db, "hermes", "memory");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    db.close();
  });

  test("mirror existente → 200 con {memory}", async () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    upsertMemoryMirror(db, "hermes", "memory", { content: "hola mundo", content_hash: "abc" });
    const res = handleGetMemory(db, "hermes", "memory");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { memory: Record<string, unknown> };
    expect(body.memory).toMatchObject({
      profile_name: "hermes",
      target: "memory",
      content: "hola mundo",
      char_count: 10,
      content_hash: "abc",
      sync_direction: "local_primary",
      last_synced: null,
    });
    db.close();
  });
});

describe("handlePutMemory", () => {
  test("perfil inexistente → 404 {error: 'not_found'}", async () => {
    const db = createDb(":memory:");
    const req = new Request("http://localhost/api/memories/ghost/memory", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "x" }),
    });
    const res = await handlePutMemory(db, "ghost", "memory", req);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    db.close();
  });

  test("crea un mirror con defaults", async () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    const req = new Request("http://localhost/api/memories/hermes/memory", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "hola mundo" }),
    });
    const res = await handlePutMemory(db, "hermes", "memory", req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { memory: Record<string, unknown> };
    expect(body.memory).toMatchObject({
      profile_name: "hermes",
      target: "memory",
      content: "hola mundo",
      char_count: 10,
      sync_direction: "local_primary",
    });
    db.close();
  });

  test("actualiza mirror existente y bupea last_synced", async () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    upsertMemoryMirror(db, "hermes", "memory", { content: "hola" });
    const req = new Request("http://localhost/api/memories/hermes/memory", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "hola mundo", sync_direction: "bidirectional" }),
    });
    const res = await handlePutMemory(db, "hermes", "memory", req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { memory: Record<string, unknown> };
    expect(body.memory).toMatchObject({
      content: "hola mundo",
      char_count: 10,
      sync_direction: "bidirectional",
    });
    expect(body.memory.last_synced).not.toBeNull();
    db.close();
  });

  test("sync_direction inválido → 400 {error: 'invalid_sync_direction'}", async () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    const req = new Request("http://localhost/api/memories/hermes/memory", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sync_direction: "nope" }),
    });
    const res = await handlePutMemory(db, "hermes", "memory", req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_sync_direction" });
    db.close();
  });

  test("content no string → 400 y no borra el mirror", async () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    upsertMemoryMirror(db, "hermes", "memory", { content: "hola mundo" });
    const req = new Request("http://localhost/api/memories/hermes/memory", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: 123 }),
    });
    const res = await handlePutMemory(db, "hermes", "memory", req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_content" });
    const stored = handleGetMemory(db, "hermes", "memory");
    const body = (await stored.json()) as { memory: { content: string | null } };
    expect(body.memory.content).toBe("hola mundo");
    db.close();
  });

  test("body no JSON → 400 {error: 'bad_request'}", async () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    const req = new Request("http://localhost/api/memories/hermes/memory", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "no es json",
    });
    const res = await handlePutMemory(db, "hermes", "memory", req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
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

function mockRagFetch(
  results: unknown[],
  calls: Array<{ url: string; body: Record<string, unknown> }>,
) {
  return async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return new Response(JSON.stringify({ results }), { status: 200 });
  };
}

describe("handleRagSearch", () => {
  const ragReq = (body: unknown): Request =>
    new Request("http://localhost/api/rag/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  test("body no JSON → 400 {error: 'bad_request'}", async () => {
    const db = createDb(":memory:");
    const req = new Request("http://localhost/api/rag/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "no es json",
    });
    const res = await handleRagSearch(db, req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
    db.close();
  });

  test("query vacía → 400 {error: 'missing_query'}", async () => {
    const db = createDb(":memory:");
    const res = await handleRagSearch(db, ragReq({ query: "" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing_query" });
    db.close();
  });

  test("mode inválido → 400 {error: 'invalid_mode'}", async () => {
    const db = createDb(":memory:");
    const res = await handleRagSearch(db, ragReq({ query: "kirito", mode: "rrf" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_mode" });
    db.close();
  });

  test("éxito → 200 con resultados normalizados y cached: false", async () => {
    const db = createDb(":memory:");
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl = mockRagFetch(
      [
        {
          id: 1,
          file_path: "notes/sao.md",
          chunk_index: 0,
          heading: "Kirito",
          content: "dual wielding",
          tokens: 10,
          sources: ["vector"],
          rrf_score: 0.042,
        },
      ],
      calls,
    );
    const res = await handleRagSearch(db, ragReq({ query: "kirito", top_k: 3, mode: "hybrid" }), {
      fetchImpl,
      baseUrl: "http://vault:8788",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      results: [{ path: "notes/sao.md", score: 0.042, content: "Kirito\n\ndual wielding", source: "vault" }],
      cached: false,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://vault:8788/search");
    expect(calls[0].body).toEqual({ query: "kirito", top_k: 3, mode: "hybrid" });
    db.close();
  });

  test("top_k se clampea a [1,10] antes de llamar al upstream", async () => {
    const db = createDb(":memory:");
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl = mockRagFetch([], calls);
    await handleRagSearch(db, ragReq({ query: "kirito", top_k: 999 }), {
      fetchImpl,
      baseUrl: "http://vault:8788",
    });
    expect((calls[0].body as { top_k: number }).top_k).toBe(10);
    db.close();
  });

  test("segunda llamada igual → cached: true con cached_at sin repetir upstream", async () => {
    const db = createDb(":memory:");
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl = mockRagFetch(
      [{ file_path: "a.md", content: "x", heading: "H", rrf_score: 0.5 }],
      calls,
    );
    const first = await handleRagSearch(db, ragReq({ query: "kirito" }), {
      fetchImpl,
      baseUrl: "http://vault:8788",
    });
    expect(((await first.json()) as { cached: boolean }).cached).toBe(false);
    const second = await handleRagSearch(db, ragReq({ query: "kirito" }), {
      fetchImpl,
      baseUrl: "http://vault:8788",
    });
    const body2 = (await second.json()) as { cached: boolean; cached_at?: string };
    expect(body2.cached).toBe(true);
    expect(typeof body2.cached_at).toBe("string");
    expect(calls).toHaveLength(1);
    db.close();
  });

  test("upstream falla → 502 {error: 'rag_upstream_error', detail}", async () => {
    const db = createDb(":memory:");
    const fetchImpl = async () => {
      throw new Error("connection refused");
    };
    const res = await handleRagSearch(db, ragReq({ query: "kirito" }), { fetchImpl });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string; detail: string };
    expect(body.error).toBe("rag_upstream_error");
    expect(typeof body.detail).toBe("string");
    db.close();
  });

  const twoVaultHits = [
    { file_path: "/data/vaults/the portal/index.md", content: "portal", heading: "", rrf_score: 0.9 },
    { file_path: "/data/vaults/for-my-agents/tasks.md", content: "agents", heading: "", rrf_score: 0.8 },
  ];

  test("vaultScopes vault:the portal filtra y descarta for-my-agents", async () => {
    const db = createDb(":memory:");
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl = mockRagFetch(twoVaultHits, calls);
    const res = await handleRagSearch(db, ragReq({ query: "kirito" }), {
      fetchImpl,
      baseUrl: "http://vault:8788",
      vaultScopes: ["vault:the portal"],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Array<{ path: string }> };
    expect(body.results.map((r) => r.path)).toEqual(["/data/vaults/the portal/index.md"]);
    db.close();
  });

  test("vaultScopes * no filtra", async () => {
    const db = createDb(":memory:");
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl = mockRagFetch(twoVaultHits, calls);
    const res = await handleRagSearch(db, ragReq({ query: "kirito" }), {
      fetchImpl,
      baseUrl: "http://vault:8788",
      vaultScopes: ["*"],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Array<{ path: string }> };
    expect(body.results.map((r) => r.path)).toEqual([
      "/data/vaults/the portal/index.md",
      "/data/vaults/for-my-agents/tasks.md",
    ]);
    db.close();
  });

  test("sin vaultScopes no filtra (dashboard)", async () => {
    const db = createDb(":memory:");
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl = mockRagFetch(twoVaultHits, calls);
    const res = await handleRagSearch(db, ragReq({ query: "kirito" }), {
      fetchImpl,
      baseUrl: "http://vault:8788",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Array<{ path: string }> };
    expect(body.results.map((r) => r.path)).toEqual([
      "/data/vaults/the portal/index.md",
      "/data/vaults/for-my-agents/tasks.md",
    ]);
    db.close();
  });

  test("vaultScopes sin vault: ni * → results vacíos", async () => {
    const db = createDb(":memory:");
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl = mockRagFetch(twoVaultHits, calls);
    const res = await handleRagSearch(db, ragReq({ query: "kirito" }), {
      fetchImpl,
      baseUrl: "http://vault:8788",
      vaultScopes: ["fast"],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: unknown[] };
    expect(body.results).toEqual([]);
    db.close();
  });

  test("filtra también respuestas cacheadas", async () => {
    const db = createDb(":memory:");
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl = mockRagFetch(twoVaultHits, calls);
    const first = await handleRagSearch(db, ragReq({ query: "kirito" }), {
      fetchImpl,
      baseUrl: "http://vault:8788",
    });
    const firstBody = (await first.json()) as { results: Array<{ path: string }>; cached: boolean };
    expect(firstBody.cached).toBe(false);
    expect(firstBody.results).toHaveLength(2);

    const second = await handleRagSearch(db, ragReq({ query: "kirito" }), {
      fetchImpl,
      baseUrl: "http://vault:8788",
      vaultScopes: ["vault:the portal"],
    });
    const secondBody = (await second.json()) as { results: Array<{ path: string }>; cached: boolean };
    expect(secondBody.cached).toBe(true);
    expect(secondBody.results.map((r) => r.path)).toEqual(["/data/vaults/the portal/index.md"]);
    expect(calls).toHaveLength(1);
    db.close();
  });
});

describe("handleGetConfig", () => {
  test("perfil inexistente → 404 {error: 'profile_not_found'}", async () => {
    const db = createDb(":memory:");
    const res = handleGetConfig(db, "ghost");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "profile_not_found" });
    db.close();
  });

  test("perfil sin template → 404 {error: 'not_found'}", async () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    const res = handleGetConfig(db, "hermes");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    db.close();
  });

  test("template existente → 200 con {config}", async () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    upsertConfigTemplate(db, "hermes", { config_yaml: "model:\n  default: gpt-4o\n" });
    const res = handleGetConfig(db, "hermes");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { config: Record<string, unknown> };
    expect(body.config).toMatchObject({
      profile_name: "hermes",
      config_yaml: "model:\n  default: gpt-4o\n",
      version: 1,
      updated_at: null,
    });
    db.close();
  });
});

describe("handlePutConfig", () => {
  test("perfil inexistente → 404 {error: 'profile_not_found'}", async () => {
    const db = createDb(":memory:");
    const req = new Request("http://localhost/api/config/ghost", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config_yaml: "x" }),
    });
    const res = await handlePutConfig(db, "ghost", req);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "profile_not_found" });
    db.close();
  });

  test("body no JSON → 400 {error: 'bad_request'}", async () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    const req = new Request("http://localhost/api/config/hermes", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "no es json",
    });
    const res = await handlePutConfig(db, "hermes", req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
    db.close();
  });

  test("crea un template con version 1", async () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    const req = new Request("http://localhost/api/config/hermes", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config_yaml: "model:\n  default: gpt-4o\n" }),
    });
    const res = await handlePutConfig(db, "hermes", req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { config: Record<string, unknown> };
    expect(body.config).toMatchObject({
      profile_name: "hermes",
      config_yaml: "model:\n  default: gpt-4o\n",
      version: 1,
    });
    db.close();
  });

  test("actualiza template existente y bupea version", async () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    upsertConfigTemplate(db, "hermes", { config_yaml: "model:\n  default: gpt-4o\n" });
    const req = new Request("http://localhost/api/config/hermes", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config_yaml: "model:\n  default: gpt-4o-mini\n" }),
    });
    const res = await handlePutConfig(db, "hermes", req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { config: Record<string, unknown> };
    expect(body.config).toMatchObject({
      profile_name: "hermes",
      config_yaml: "model:\n  default: gpt-4o-mini\n",
      version: 2,
    });
    expect(body.config.updated_at).not.toBeNull();
    db.close();
  });

  test("config_yaml no string → 400 y no borra el template", async () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    upsertConfigTemplate(db, "hermes", { config_yaml: "model:\n  default: gpt-4o\n" });
    const req = new Request("http://localhost/api/config/hermes", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config_yaml: { model: "gpt-4o" } }),
    });
    const res = await handlePutConfig(db, "hermes", req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_config_yaml" });
    const stored = handleGetConfig(db, "hermes");
    const body = (await stored.json()) as { config: { config_yaml: string | null } };
    expect(body.config.config_yaml).toBe("model:\n  default: gpt-4o\n");
    db.close();
  });
});

describe("handleListSessions", () => {
  test("DB vacía → {sessions: []}", async () => {
    const db = createDb(":memory:");
    const res = handleListSessions(db);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sessions: [] });
    db.close();
  });

  test("con sesiones → lista ordenada por started_at DESC con profile_name", async () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    upsertProfile(db, "shinon", {});
    upsertSession(db, { id: "s1", profile_name: "hermes", title: "Hola", started_at: 100 });
    upsertSession(db, { id: "s2", profile_name: "shinon", title: "Chau", started_at: 200 });
    upsertSession(db, { id: "s3", profile_name: "hermes", title: "Media", started_at: 150 });
    const res = handleListSessions(db);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sessions: Array<Record<string, unknown>> };
    expect(body.sessions.map((s) => s.id)).toEqual(["s2", "s3", "s1"]);
    expect(body.sessions[0]).toMatchObject({
      id: "s2",
      profile_name: "shinon",
      title: "Chau",
      started_at: 200,
      message_count: 0,
    });
    db.close();
  });
});

describe("handleListDevices", () => {
  test("DB vacía → {devices: []}", async () => {
    const db = createDb(":memory:");
    const res = handleListDevices(db);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ devices: [] });
    db.close();
  });

  test("agentes con device_info → devices deduplicados por hostname con count", async () => {
    const db = createDb(":memory:");
    upsertAgentOnConnect(db, { name: "kirito", device: "pc", kind: "agent", status: "idle" });
    upsertAgentOnConnect(db, { name: "asuna", device: "pc", kind: "agent", status: "idle" });
    updateAgentDeviceInfo(db, "kirito", { hostname: "home-pc", platform: "linux", arch: "x86_64" });
    updateAgentDeviceInfo(db, "asuna", { hostname: "home-pc" });
    const res = handleListDevices(db);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { devices: Array<Record<string, unknown>> };
    expect(body.devices).toHaveLength(1);
    expect(body.devices[0]).toMatchObject({ id: "home-pc", hostname: "home-pc", agents: 2 });
    db.close();
  });
});

describe("handleDeviceHeartbeat", () => {
  const heartbeatReq = (body: unknown): Request =>
    new Request("http://localhost/api/devices/heartbeat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  test("body no JSON → 400 {error: 'bad_request'}", async () => {
    const db = createDb(":memory:");
    const req = new Request("http://localhost/api/devices/heartbeat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "no es json",
    });
    const res = await handleDeviceHeartbeat(db, "shinon", req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
    db.close();
  });

  test("agente desconocido → 404 {error: 'agent_not_found'}", async () => {
    const db = createDb(":memory:");
    const res = await handleDeviceHeartbeat(db, "ghost", heartbeatReq({ info: { hostname: "pc" } }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "agent_not_found" });
    db.close();
  });

  test("heartbeat válido → 200 con {device} y persiste device_info", async () => {
    const db = createDb(":memory:");
    upsertAgentOnConnect(db, { name: "kirito", device: "pc", kind: "agent", status: "idle" });
    const res = await handleDeviceHeartbeat(
      db,
      "kirito",
      heartbeatReq({
        info: { hostname: "home-pc", platform: "linux", arch: "x86_64", gpu: "RTX 4090", ram_gb: 64, ip: "10.0.0.2" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { device: Record<string, unknown> };
    expect(body.device).toMatchObject({
      id: "home-pc",
      hostname: "home-pc",
      platform: "linux",
      arch: "x86_64",
      gpu: "RTX 4090",
      ram_gb: 64,
      ip: "10.0.0.2",
    });
    expect(getAgent(db, "kirito")!.device).toBe("home-pc");
    db.close();
  });

  test("info que no es objeto → 400 {error: 'bad_request'}", async () => {
    const db = createDb(":memory:");
    upsertAgentOnConnect(db, { name: "kirito", device: "pc", kind: "agent", status: "idle" });
    const res = await handleDeviceHeartbeat(db, "kirito", heartbeatReq({ info: "pc" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
    db.close();
  });

  test("rejects null and array info without writing device_info", async () => {
    const db = createDb(":memory:");
    upsertAgentOnConnect(db, { name: "kirito", device: "pc", kind: "agent", status: "idle" });
    for (const info of [null, []]) {
      const res = await handleDeviceHeartbeat(db, "kirito", heartbeatReq({ info }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "bad_request" });
    }
    const agent = getAgent(db, "kirito")!;
    expect(agent.device).toBe("pc");
    expect(agent.device_info).toBeNull();
    db.close();
  });

  test("empty hostname does not rename the device and non-numeric fields are null", async () => {
    const db = createDb(":memory:");
    upsertAgentOnConnect(db, { name: "kirito", device: "pc", kind: "agent", status: "idle" });
    const res = await handleDeviceHeartbeat(
      db,
      "kirito",
      heartbeatReq({ info: { hostname: "", platform: 1, ram_gb: "64", gpu: false, ip: null } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { device: Record<string, unknown> };
    expect(body.device).toMatchObject({
      id: "pc",
      hostname: null,
      platform: null,
      ram_gb: null,
      gpu: null,
      ip: null,
    });
    expect(getAgent(db, "kirito")!.device).toBe("pc");
    db.close();
  });
});

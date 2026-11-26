import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createMcpServer } from "./server";

const ROOT = join(import.meta.dir, ".tmp-server-v2-test");
const VAULTS = join(ROOT, "vaults");
const WRITABLE = join(ROOT, "agent-state");
const CONFIGS = join(ROOT, "configs");

interface FakeTask {
  id: string;
  goal: string;
  status: string;
  created_by: string;
  assigned_to: string | null;
  summary: string | null;
  artifact_ref: string | null;
  parent_id: string | null;
}

interface FakeMessage {
  id: string;
  from_agent: string;
  to_agent: string;
  type: string;
  payload_ref: string | null;
  read: number;
}

interface UsageEvent {
  auth: string;
  tool_name: string;
  ok: boolean;
  bytes_out: number;
  duration_ms: number;
}

interface FakeBackendState {
  validKeys: Map<string, { agent: string; kind: string; scopes: string[] }>;
  tasks: FakeTask[];
  messages: FakeMessage[];
  usageEvents: UsageEvent[];
}

beforeAll(() => {
  mkdirSync(join(VAULTS, "cardinal-system"), { recursive: true });
  mkdirSync(join(VAULTS, "skills", "coding", "caveman"), { recursive: true });
  mkdirSync(join(VAULTS, "projects"), { recursive: true });
  mkdirSync(join(VAULTS, "personal"), { recursive: true });
  mkdirSync(join(WRITABLE, "handoffs"), { recursive: true });
  mkdirSync(join(CONFIGS, "agents", "opencode"), { recursive: true });
  mkdirSync(join(CONFIGS, "user", "kitty"), { recursive: true });

  writeFileSync(join(VAULTS, "cardinal-system", "AGENTS.md"), "# Rules\nVerify every command.");
  writeFileSync(join(VAULTS, "cardinal-system", "CODING.md"), "# Coding\nStateless harness.");
  writeFileSync(join(VAULTS, "projects", "ACTIVE.md"), "- cardinal-context-hub");
  writeFileSync(
    join(VAULTS, "skills", "coding", "git.md"),
    "# Git Skill\nNever force push main branches.",
  );
  writeFileSync(
    join(VAULTS, "skills", "coding", "caveman", "SKILL.md"),
    "# Caveman Skill\nKeep diffs and notes concise.",
  );
  writeFileSync(
    join(VAULTS, "personal", "diary.md"),
    "# Private Diary\nNever expose this secret force push note.",
  );
  writeFileSync(join(WRITABLE, "handoffs", "demo.md"), "# Handoff: demo\nReady to continue.");

  const syntheticSk = ["sk", "proj", "AbCdEfGh1234567890XyZ"].join("-");
  writeFileSync(
    join(CONFIGS, "agents", "opencode", "opencode.json"),
    JSON.stringify({ model: "anthropic/claude-sonnet-4", provider: { openai: { apiKey: syntheticSk } } }),
  );
  writeFileSync(join(CONFIGS, "agents", "opencode", "auth.json"), `{"secret":"blocked"}`);
  writeFileSync(join(CONFIGS, "user", "kitty", "kitty.conf"), "font_size 11\n");
});

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

const KEY_CODING = "sk-cardinal-coding-key";
const KEY_BOARD = "sk-cardinal-board-key";
const KEY_FULL = "sk-cardinal-full-key";
const KEY_USER_CFG = "sk-cardinal-usercfg-key";
const KEY_EMPTY = "sk-cardinal-empty-key";
const KEY_NARROW_HANDOFF = "sk-cardinal-narrow-handoff-key";
const KEY_NARROW_PROPOSAL = "sk-cardinal-narrow-proposal-key";
const KEY_RO_SERVICE = "sk-cardinal-ro-service-key";

function makeState(): FakeBackendState {
  return {
    validKeys: new Map([
      [
        KEY_CODING,
        {
          agent: "coder-1",
          kind: "agent",
          scopes: [
            "vault:read:cardinal-system/**",
            "vault:read:skills/coding/**",
            "vault:read:projects/**",
            "vault:read:agents/**",
            "vault:write:agents/handoffs/**",
            "vault:write:agents/proposals/**",
          ],
        },
      ],
      [KEY_BOARD, { agent: "coord-1", kind: "agent", scopes: ["board:write", "mailbox:write"] }],
      [
        KEY_FULL,
        {
          agent: "admin-agent",
          kind: "agent",
          scopes: ["*", "vault:write:agents/handoffs/**", "vault:write:agents/proposals/**"],
        },
      ],
      [
        KEY_USER_CFG,
        {
          agent: "host-user",
          kind: "agent",
          scopes: ["config:read:agents/**", "config:read:user/**"],
        },
      ],
      [KEY_EMPTY, { agent: "idle-agent", kind: "agent", scopes: [] }],
      [
        KEY_NARROW_HANDOFF,
        {
          agent: "narrow-coder",
          kind: "agent",
          scopes: ["vault:write:agents/handoffs/allowed-proj.md"],
        },
      ],
      [
        KEY_NARROW_PROPOSAL,
        {
          agent: "narrow-proposer",
          kind: "agent",
          scopes: ["vault:write:agents/proposals/exact-only.md"],
        },
      ],
      [
        KEY_RO_SERVICE,
        {
          agent: "observer-1",
          kind: "agent",
          scopes: ["board:read", "mailbox:read"],
        },
      ],
    ]),
    tasks: [],
    messages: [],
    usageEvents: [],
  };
}

function makeDeps(state: FakeBackendState) {
  const fetchImpl = (async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = String(url);
    const method = String(init?.method ?? "GET").toUpperCase();
    const auth = (init?.headers as Record<string, string> | undefined)?.authorization ?? "";

    if (urlStr.endsWith("/api/internal/keys/validate")) {
      const key = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const id = state.validKeys.get(key);
      if (!id) return Response.json({ error: "unauthorized" }, { status: 401 });
      return Response.json(id);
    }

    if (urlStr.endsWith("/api/internal/mcp/usage") && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      state.usageEvents.push({
        auth,
        tool_name: String(body.tool_name ?? ""),
        ok: Boolean(body.ok),
        bytes_out: Number(body.bytes_out ?? 0),
        duration_ms: Number(body.duration_ms ?? 0),
      });
      return Response.json({ ok: true });
    }

    const parsedUrl = new URL(urlStr, "http://backend:8787");
    if (parsedUrl.pathname === "/api/tasks" && method === "GET") {
      const status = parsedUrl.searchParams.get("status");
      const tasks = status ? state.tasks.filter((t) => t.status === status) : state.tasks;
      return Response.json({ tasks });
    }
    if (parsedUrl.pathname === "/api/tasks" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      const task: FakeTask = {
        id: crypto.randomUUID(),
        goal: String(body.goal ?? ""),
        status: "open",
        created_by: String(body.created_by ?? "system"),
        assigned_to: null,
        summary: null,
        artifact_ref: null,
        parent_id: typeof body.parent_id === "string" ? body.parent_id : null,
      };
      state.tasks.push(task);
      return Response.json({ task });
    }
    const claimMatch = parsedUrl.pathname.match(/^\/api\/tasks\/([^/]+)\/claim$/);
    if (claimMatch && method === "PUT") {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      const task = state.tasks.find((t) => t.id === decodeURIComponent(claimMatch[1]!));
      if (!task) return Response.json({ error: "not_found" }, { status: 404 });
      task.status = "claimed";
      task.assigned_to = String(body.by ?? "");
      return Response.json({ task });
    }
    const completeMatch = parsedUrl.pathname.match(/^\/api\/tasks\/([^/]+)\/complete$/);
    if (completeMatch && method === "PUT") {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      const task = state.tasks.find((t) => t.id === decodeURIComponent(completeMatch[1]!));
      if (!task) return Response.json({ error: "not_found" }, { status: 404 });
      task.status = "done";
      task.summary = typeof body.summary === "string" ? body.summary : null;
      task.artifact_ref = typeof body.artifact_ref === "string" ? body.artifact_ref : null;
      return Response.json({ task });
    }
    if (parsedUrl.pathname === "/api/messages" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      const message: FakeMessage = {
        id: crypto.randomUUID(),
        from_agent: String(body.from_agent ?? ""),
        to_agent: String(body.to_agent ?? ""),
        type: String(body.type ?? ""),
        payload_ref: typeof body.payload_ref === "string" ? body.payload_ref : null,
        read: 0,
      };
      state.messages.push(message);
      return Response.json({ message });
    }
    if (parsedUrl.pathname === "/api/messages" && method === "GET") {
      const toAgent = parsedUrl.searchParams.get("to_agent");
      const messages = state.messages.filter((m) => m.to_agent === toAgent);
      return Response.json({ messages });
    }

    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;

  const server = createMcpServer({
    backendUrl: "http://backend:8787",
    vaultsRoot: VAULTS,
    writableRoot: WRITABLE,
    configsRoot: CONFIGS,
    gitAutoCommit: false,
    fetchImpl,
  });

  async function rpc(
    key: string | null,
    body: Record<string, unknown>,
    accept = "application/json, text/event-stream",
  ): Promise<Response> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept,
    };
    if (key !== null) headers.authorization = `Bearer ${key}`;
    return server.fetch(
      new Request("http://localhost:8789/mcp", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
    );
  }

  async function rpcJson(
    key: string | null,
    body: Record<string, unknown>,
    accept?: string,
  ) {
    const res = await rpc(key, body, accept);
    const text = await res.text();
    return {
      status: res.status,
      json: text ? (JSON.parse(text) as any) : null,
    };
  }

  return { server, rpc, rpcJson };
}

describe("MCP Streamable HTTP server v2", () => {
  test("GET /health returns engine status and indexed file count without leaking paths", async () => {
    const { server } = makeDeps(makeState());
    await server.syncIndex(true);
    const res = await server.fetch(new Request("http://localhost:8789/health"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect(body.searchEngine).toBe("fts5");
    expect(body.indexedFiles).toBe(7);
    expect(JSON.stringify(body)).not.toContain(VAULTS);
    server.close();
  });

  test("rejects missing/invalid Bearer keys with 401 and GET /mcp with 405", async () => {
    const { server, rpc, rpcJson } = makeDeps(makeState());

    const noAuth = await rpc(null, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } },
    });
    expect(noAuth.status).toBe(401);

    const badAuth = await rpcJson("sk-cardinal-unknown", {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } },
    });
    expect(badAuth.status).toBe(401);

    const getRes = await server.fetch(
      new Request("http://localhost:8789/mcp", {
        method: "GET",
        headers: { authorization: `Bearer ${KEY_CODING}` },
      }),
    );
    expect(getRes.status).toBe(405);
    server.close();
  });

  test("supports initialize and accepts curl-like Accept: application/json header", async () => {
    const { server, rpcJson } = makeDeps(makeState());
    const init = await rpcJson(
      KEY_CODING,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "curl", version: "1.0" },
        },
      },
      "application/json",
    );
    expect(init.status).toBe(200);
    expect(init.json.result.serverInfo.name).toBe("cardinal-context-hub");
    expect(init.json.result.capabilities.tools).toBeDefined();
    expect(init.json.result.capabilities.prompts).toBeDefined();
    server.close();
  });

  test("tools/list filters tool surface strictly by caller scopes", async () => {
    const { server, rpcJson } = makeDeps(makeState());

    const codingTools = await rpcJson(KEY_CODING, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect(codingTools.json.result.tools.map((t: any) => t.name).sort()).toEqual([
      "cardinal_bootstrap_repo",
      "cardinal_handoff",
      "cardinal_list",
      "cardinal_onboard",
      "cardinal_propose_skill",
      "cardinal_read",
      "cardinal_search",
    ]);

    const fullTools = await rpcJson(KEY_FULL, { jsonrpc: "2.0", id: 21, method: "tools/list" });
    const fullNames = fullTools.json.result.tools.map((t: any) => t.name);
    expect(fullNames).toContain("cardinal_agent_config");
    expect(fullNames).not.toContain("cardinal_user_config");

    const userCfgTools = await rpcJson(KEY_USER_CFG, { jsonrpc: "2.0", id: 22, method: "tools/list" });
    expect(userCfgTools.json.result.tools.map((t: any) => t.name).sort()).toEqual([
      "cardinal_agent_config",
      "cardinal_user_config",
    ]);

    const boardTools = await rpcJson(KEY_BOARD, { jsonrpc: "2.0", id: 3, method: "tools/list" });
    expect(boardTools.json.result.tools.map((t: any) => t.name).sort()).toEqual([
      "cardinal_agent_inbox",
      "cardinal_agent_send",
      "cardinal_task_claim",
      "cardinal_task_complete",
      "cardinal_task_create",
      "cardinal_task_list",
    ]);

    const emptyTools = await rpcJson(KEY_EMPTY, { jsonrpc: "2.0", id: 4, method: "tools/list" });
    expect(emptyTools.json.result.tools).toEqual([]);
    server.close();
  });

  test("prompts/list and prompts/get assemble onboarding packet and emit usage telemetry", async () => {
    const state = makeState();
    const { server, rpcJson } = makeDeps(state);

    const list = await rpcJson(KEY_CODING, { jsonrpc: "2.0", id: 5, method: "prompts/list" });
    expect(list.json.result.prompts.map((p: any) => p.name).sort()).toEqual([
      "cardinal_bootstrap_repo",
      "cardinal_onboard",
    ]);

    const getPrompt = await rpcJson(KEY_CODING, {
      jsonrpc: "2.0",
      id: 6,
      method: "prompts/get",
      params: { name: "cardinal_onboard", arguments: { mode: "coding", project: "demo" } },
    });
    expect(getPrompt.status).toBe(200);
    const promptText = getPrompt.json.result.messages[0].content.text;
    expect(promptText).toContain("Verify every command.");
    expect(promptText).toContain("Ready to continue.");
    expect(promptText).not.toContain("Private Diary");

    await Bun.sleep(10);
    expect(state.usageEvents.some((e) => e.tool_name === "prompt:cardinal_onboard" && e.ok)).toBe(true);
    expect(state.usageEvents[0]!.auth).toBe(`Bearer ${KEY_CODING}`);
    server.close();
  });

  test("context tools enforce ACLs, prevent personal/** leaks, and write sandboxed handoffs/proposals", async () => {
    const state = makeState();
    const { server, rpcJson } = makeDeps(state);

    const listRes = await rpcJson(KEY_CODING, {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "cardinal_list", arguments: { depth: 3 } },
    });
    expect(listRes.json.result.isError).toBeUndefined();
    const listed = JSON.parse(listRes.json.result.content[0].text);
    expect(listed.files.some((f: any) => f.path.includes("personal"))).toBe(false);
    expect(listed.files.some((f: any) => f.path === "skills/coding/git.md")).toBe(true);

    const searchRes = await rpcJson(KEY_FULL, {
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: { name: "cardinal_search", arguments: { query: "force push", top_k: 5 } },
    });
    const hits = JSON.parse(searchRes.json.result.content[0].text).results;
    expect(hits.map((h: any) => h.path)).toEqual(["skills/coding/git.md"]);

    const deniedRead = await rpcJson(KEY_FULL, {
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: { name: "cardinal_read", arguments: { path: "personal/diary.md" } },
    });
    expect(deniedRead.json.result.isError).toBe(true);
    expect(deniedRead.json.result.content[0].text).toMatch(/forbidden/i);

    const travRead = await rpcJson(KEY_FULL, {
      jsonrpc: "2.0",
      id: 10,
      method: "tools/call",
      params: { name: "cardinal_read", arguments: { path: "../personal/diary.md" } },
    });
    expect(travRead.json.result.isError).toBe(true);

    const handoffRes = await rpcJson(KEY_CODING, {
      jsonrpc: "2.0",
      id: 11,
      method: "tools/call",
      params: {
        name: "cardinal_handoff",
        arguments: {
          project: "cardinal-v2",
          summary: "Streamable HTTP hub active.",
          next_steps: ["Verify with Codex"],
        },
      },
    });
    expect(handoffRes.json.result.isError).toBeUndefined();
    const written = JSON.parse(handoffRes.json.result.content[0].text);
    expect(written.path).toBe("agents/handoffs/cardinal-v2.md");
    expect(readFileSync(join(WRITABLE, "handoffs", "cardinal-v2.md"), "utf8")).toContain(
      "Streamable HTTP hub active.",
    );

    const proposalRes = await rpcJson(KEY_CODING, {
      jsonrpc: "2.0",
      id: 12,
      method: "tools/call",
      params: {
        name: "cardinal_propose_skill",
        arguments: {
          skill_path: "skills/coding/git.md",
          reason: "Add rebase flag note",
          content: "Use --rebase-merges carefully.",
        },
      },
    });
    expect(proposalRes.json.result.isError).toBeUndefined();
    const proposal = JSON.parse(proposalRes.json.result.content[0].text);
    expect(proposal.path.startsWith("agents/proposals/")).toBe(true);

    await Bun.sleep(15);
    expect(state.usageEvents.some((e) => e.tool_name === "cardinal_search")).toBe(true);
    expect(state.usageEvents.some((e) => e.tool_name === "cardinal_handoff")).toBe(true);
    server.close();
  });

  test("board and mailbox tools proxy cleanly for board/mailbox scoped keys", async () => {
    const state = makeState();
    const { server, rpcJson } = makeDeps(state);

    const created = await rpcJson(KEY_BOARD, {
      jsonrpc: "2.0",
      id: 20,
      method: "tools/call",
      params: { name: "cardinal_task_create", arguments: { goal: "ship hub" } },
    });
    const task = JSON.parse(created.json.result.content[0].text).task;
    expect(task.created_by).toBe("coord-1");

    const claimed = await rpcJson(KEY_BOARD, {
      jsonrpc: "2.0",
      id: 21,
      method: "tools/call",
      params: { name: "cardinal_task_claim", arguments: { id: task.id } },
    });
    expect(JSON.parse(claimed.json.result.content[0].text).task.assigned_to).toBe("coord-1");

    const sent = await rpcJson(KEY_BOARD, {
      jsonrpc: "2.0",
      id: 22,
      method: "tools/call",
      params: {
        name: "cardinal_agent_send",
        arguments: { to_agent: "coord-1", type: "handoff", payload_ref: "agents/handoffs/demo.md" },
      },
    });
    expect(JSON.parse(sent.json.result.content[0].text).message.from_agent).toBe("coord-1");

    const inbox = await rpcJson(KEY_BOARD, {
      jsonrpc: "2.0",
      id: 23,
      method: "tools/call",
      params: { name: "cardinal_agent_inbox", arguments: {} },
    });
    expect(JSON.parse(inbox.json.result.content[0].text).messages).toHaveLength(1);
    server.close();
  });

  test("cardinal_bootstrap_repo serves starter files and curated vault skills safely", async () => {
    const state = makeState();
    const { server, rpcJson } = makeDeps(state);

    const bootTool = await rpcJson(KEY_CODING, {
      jsonrpc: "2.0",
      id: 30,
      method: "tools/call",
      params: {
        name: "cardinal_bootstrap_repo",
        arguments: {
          preset: "default",
          project: "fresh-service",
          stack: "TypeScript, Bun",
          extra_skills: ["personal/diary.md"],
        },
      },
    });
    expect(bootTool.json.result.isError).toBeUndefined();
    const bootText = bootTool.json.result.content[0].text;
    expect(bootText).toContain("# AGENTS.md — fresh-service");
    expect(bootText).toContain("### Anti-Drift Rules");
    expect(bootText).toContain("#### `.githooks/pre-commit` (executable)");
    expect(bootText).toContain("Verify every command.");
    expect(bootText).toContain("Keep diffs and notes concise.");
    expect(bootText).toContain("Missing or outside key scopes");
    expect(bootText).not.toContain("Private Diary");

    const bootJson = await rpcJson(KEY_CODING, {
      jsonrpc: "2.0",
      id: 32,
      method: "tools/call",
      params: {
        name: "cardinal_bootstrap_repo",
        arguments: { preset: "standards", scope: "full", project: "audited-repo", format: "json" },
      },
    });
    expect(bootJson.json.result.isError).toBeUndefined();
    const structured = JSON.parse(bootJson.json.result.content[0].text);
    expect(structured.scope).toBe("full");
    expect(structured.hooks).toBe("full");
    expect(structured.files.map((f: any) => f.path)).toContain(".githooks/commit-msg");
    expect(structured.complianceChecklist.length).toBeGreaterThan(0);

    const bootPrompt = await rpcJson(KEY_CODING, {
      jsonrpc: "2.0",
      id: 31,
      method: "prompts/get",
      params: { name: "cardinal_bootstrap_repo", arguments: { preset: "list" } },
    });
    expect(bootPrompt.status).toBe(200);
    expect(bootPrompt.json.result.messages[0].content.text).toContain("Cardinal New-Repo Bootstrap Presets");

    await Bun.sleep(10);
    expect(state.usageEvents.some((e) => e.tool_name === "cardinal_bootstrap_repo" && e.ok)).toBe(true);
    expect(state.usageEvents.some((e) => e.tool_name === "prompt:cardinal_bootstrap_repo" && e.ok)).toBe(true);
    server.close();
  });

  test("cardinal_agent_config and cardinal_user_config enforce redaction, filename blocks, and strict opt-in", async () => {
    const state = makeState();
    const { server, rpcJson } = makeDeps(state);

    const agentList = await rpcJson(KEY_FULL, {
      jsonrpc: "2.0",
      id: 40,
      method: "tools/call",
      params: { name: "cardinal_agent_config", arguments: { action: "list", depth: 3 } },
    });
    expect(agentList.json.result.isError).toBeUndefined();
    const listedAgents = JSON.parse(agentList.json.result.content[0].text);
    expect(listedAgents.files.map((f: any) => f.path)).toEqual(["opencode/opencode.json"]);

    const agentRead = await rpcJson(KEY_FULL, {
      jsonrpc: "2.0",
      id: 41,
      method: "tools/call",
      params: { name: "cardinal_agent_config", arguments: { path: "opencode/opencode.json" } },
    });
    expect(agentRead.json.result.isError).toBeUndefined();
    const parsedAgent = JSON.parse(agentRead.json.result.content[0].text);
    expect(parsedAgent.redactedCount).toBe(1);
    expect(parsedAgent.content).toContain("[REDACTED]");
    expect(parsedAgent.content).not.toContain("AbCdEfGh1234567890XyZ");

    const authBlocked = await rpcJson(KEY_FULL, {
      jsonrpc: "2.0",
      id: 42,
      method: "tools/call",
      params: { name: "cardinal_agent_config", arguments: { path: "opencode/auth.json" } },
    });
    expect(authBlocked.json.result.isError).toBe(true);

    // Wildcard KEY_FULL must not be able to invoke cardinal_user_config.
    const wildcardUserDenied = await rpcJson(KEY_FULL, {
      jsonrpc: "2.0",
      id: 43,
      method: "tools/call",
      params: { name: "cardinal_user_config", arguments: { path: "kitty/kitty.conf" } },
    });
    expect(wildcardUserDenied.json.error || wildcardUserDenied.json.result?.isError).toBeTruthy();

    // Explicit config:read:user/** opt-in succeeds cleanly.
    const userRead = await rpcJson(KEY_USER_CFG, {
      jsonrpc: "2.0",
      id: 44,
      method: "tools/call",
      params: { name: "cardinal_user_config", arguments: { path: "kitty/kitty.conf" } },
    });
    expect(userRead.json.result.isError).toBeUndefined();
    expect(JSON.parse(userRead.json.result.content[0].text).content).toContain("font_size 11");

    await Bun.sleep(10);
    expect(state.usageEvents.some((e) => e.tool_name === "cardinal_agent_config" && e.ok)).toBe(true);
    expect(state.usageEvents.some((e) => e.tool_name === "cardinal_user_config" && e.ok)).toBe(true);
    server.close();
  });

  test("read-only board:read and mailbox:read keys only see read tools", async () => {
    const { server, rpcJson } = makeDeps(makeState());
    const res = await rpcJson(KEY_RO_SERVICE, { jsonrpc: "2.0", id: 50, method: "tools/list" });
    expect(res.json.result.tools.map((t: any) => t.name).sort()).toEqual([
      "cardinal_agent_inbox",
      "cardinal_task_list",
    ]);
    server.close();
  });

  test("enforces narrow write path scopes on handoffs and proposals", async () => {
    const state = makeState();
    const { server, rpcJson } = makeDeps(state);

    // Narrow handoff key can write allowed-proj.md
    const allowedHandoff = await rpcJson(KEY_NARROW_HANDOFF, {
      jsonrpc: "2.0",
      id: 51,
      method: "tools/call",
      params: {
        name: "cardinal_handoff",
        arguments: {
          project: "allowed-proj",
          summary: "Handoff for allowed project.",
        },
      },
    });
    expect(allowedHandoff.json.result.isError).toBeUndefined();
    expect(existsSync(join(WRITABLE, "handoffs", "allowed-proj.md"))).toBe(true);

    // Narrow handoff key is rejected when trying to write other-proj.md
    const forbiddenHandoff = await rpcJson(KEY_NARROW_HANDOFF, {
      jsonrpc: "2.0",
      id: 52,
      method: "tools/call",
      params: {
        name: "cardinal_handoff",
        arguments: {
          project: "other-proj",
          summary: "Should be forbidden.",
        },
      },
    });
    expect(forbiddenHandoff.json.result.isError).toBe(true);
    expect(forbiddenHandoff.json.result.content[0].text).toMatch(/forbidden|denies/i);
    expect(existsSync(join(WRITABLE, "handoffs", "other-proj.md"))).toBe(false);

    // Narrow proposal key is rejected when proposal filename does not match scope
    const forbiddenProposal = await rpcJson(KEY_NARROW_PROPOSAL, {
      jsonrpc: "2.0",
      id: 53,
      method: "tools/call",
      params: {
        name: "cardinal_propose_skill",
        arguments: {
          skill_path: "skills/coding/git.md",
          reason: "Should be rejected because filename is generated and does not match exact-only.md",
          content: "Proposal content",
        },
      },
    });
    expect(forbiddenProposal.json.result.isError).toBe(true);
    expect(forbiddenProposal.json.result.content[0].text).toMatch(/forbidden|denies/i);

    server.close();
  });

  test("gates config tools when configsRoot is omitted and hides prompts without vault read scope", async () => {
    const state = makeState();
    const fetchImpl = (async (url: string | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = String(url);
      const auth = (init?.headers as Record<string, string> | undefined)?.authorization ?? "";
      if (urlStr.endsWith("/api/internal/keys/validate")) {
        const key = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        const id = state.validKeys.get(key);
        if (!id) return Response.json({ error: "unauthorized" }, { status: 401 });
        return Response.json(id);
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    const noConfigServer = createMcpServer({
      backendUrl: "http://backend:8787",
      vaultsRoot: VAULTS,
      writableRoot: WRITABLE,
      configsRoot: undefined,
      gitAutoCommit: false,
      fetchImpl,
    });

    const headers = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${KEY_FULL}`,
    };

    const res = await noConfigServer.fetch(
      new Request("http://localhost:8789/mcp", {
        method: "POST",
        headers,
        body: JSON.stringify({ jsonrpc: "2.0", id: 60, method: "tools/list" }),
      }),
    );
    const json = (await res.json()) as any;
    const toolNames = json.result.tools.map((t: any) => t.name);
    expect(toolNames).not.toContain("cardinal_agent_config");
    expect(toolNames).not.toContain("cardinal_user_config");

    // Keys with empty scopes (no vault read) see no prompts
    const emptyPromptRes = await noConfigServer.fetch(
      new Request("http://localhost:8789/mcp", {
        method: "POST",
        headers: {
          ...headers,
          authorization: `Bearer ${KEY_EMPTY}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 61, method: "prompts/list" }),
      }),
    );
    const emptyPromptJson = (await emptyPromptRes.json()) as any;
    expect(emptyPromptJson.result.prompts).toEqual([]);

    noConfigServer.close();
  });
});

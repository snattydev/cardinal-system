import { describe, expect, test } from "bun:test";
import { createMcpServer } from "./server";

const VAULTS = ["the portal", "for-my-agents"] as const;

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

interface RagCall {
  authorization: string;
  body: string;
}

interface FakeBackendState {
  validKeys: Map<string, { agent: string; kind: string; scopes: string[] }>;
  searchResults?: unknown;
  ragCalls: RagCall[];
  ragStatus?: number;
  tasks: FakeTask[];
  messages: FakeMessage[];
}

function makeDeps(state: FakeBackendState, options?: { serviceKey?: string }) {
  const fetchImpl = (async (url: any, init?: any): Promise<Response> => {
    const urlStr = String(url);
    const method = String(init?.method ?? "GET").toUpperCase();
    const auth = (init?.headers as Record<string, string>)?.authorization ?? "";

    if (urlStr.endsWith("/api/internal/keys/validate")) {
      const key = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const id = state.validKeys.get(key);
      if (!id) return Response.json({ error: "unauthorized" }, { status: 401 });
      return Response.json(id);
    }
    if (urlStr.includes("/api/rag/search")) {
      state.ragCalls.push({ authorization: auth, body: String(init?.body ?? "") });
      if (state.ragStatus !== undefined && state.ragStatus !== 200) {
        return Response.json({ error: "upstream" }, { status: state.ragStatus });
      }
      return Response.json({ results: state.searchResults ?? [] });
    }

    // Board API stubs (agent Bearer auth is assumed already accepted by backend).
    const tasksUrl = new URL(urlStr, "http://backend:8787");
    if (tasksUrl.pathname === "/api/tasks" && method === "GET") {
      const status = tasksUrl.searchParams.get("status");
      const tasks = status ? state.tasks.filter((t) => t.status === status) : state.tasks;
      return Response.json({ tasks });
    }
    if (tasksUrl.pathname === "/api/tasks" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      const task: FakeTask = {
        id: crypto.randomUUID(),
        goal: String(body.goal ?? ""),
        status: "open",
        created_by: typeof body.created_by === "string" ? body.created_by : "system",
        assigned_to: null,
        summary: null,
        artifact_ref: null,
        parent_id: typeof body.parent_id === "string" ? body.parent_id : null,
      };
      state.tasks.push(task);
      return Response.json({ task });
    }
    const claimMatch = tasksUrl.pathname.match(/^\/api\/tasks\/([^/]+)\/claim$/);
    if (claimMatch && method === "PUT") {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      const task = state.tasks.find((t) => t.id === decodeURIComponent(claimMatch[1]!));
      if (!task) return Response.json({ error: "not_found" }, { status: 404 });
      if (task.status !== "open") return Response.json({ error: "not_open" }, { status: 409 });
      task.status = "claimed";
      task.assigned_to = String(body.by ?? "");
      return Response.json({ task });
    }
    const completeMatch = tasksUrl.pathname.match(/^\/api\/tasks\/([^/]+)\/complete$/);
    if (completeMatch && method === "PUT") {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      const task = state.tasks.find((t) => t.id === decodeURIComponent(completeMatch[1]!));
      if (!task) return Response.json({ error: "not_found" }, { status: 404 });
      task.status = "done";
      task.summary = typeof body.summary === "string" ? body.summary : null;
      task.artifact_ref = typeof body.artifact_ref === "string" ? body.artifact_ref : null;
      return Response.json({ task });
    }

    const messagesUrl = new URL(urlStr, "http://backend:8787");
    if (messagesUrl.pathname === "/api/messages" && method === "POST") {
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
    if (messagesUrl.pathname === "/api/messages" && method === "GET") {
      const toAgent = messagesUrl.searchParams.get("to_agent");
      if (!toAgent) {
        return Response.json({ error: "missing_to_agent" }, { status: 400 });
      }
      const messages = state.messages.filter((m) => m.to_agent === toAgent);
      return Response.json({ messages });
    }

    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  const server = createMcpServer({
    backendUrl: "http://backend:8787",
    serviceKey: options?.serviceKey,
    vaultsRoot: "/nonexistent",
    knownVaults: VAULTS,
    fetchImpl,
  });

  function rpc(
    key: string | null,
    body: Record<string, unknown>,
  ): Promise<Response> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (key !== null) headers.authorization = `Bearer ${key}`;
    return server.fetch(
      new Request("http://localhost:8789/mcp", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
    );
  }

  async function rpcJson(key: string | null, body: Record<string, unknown>) {
    const res = await rpc(key, body);
    return { status: res.status, json: (await res.json()) as any };
  }

  return { server, rpc, rpcJson };
}

const KEY_OK = "sk-cardinal-ok";
const KEY_SCOPED = "sk-cardinal-scoped";

function makeState(): FakeBackendState {
  return {
    validKeys: new Map([
      [KEY_OK, { agent: "shinon", kind: "agent", scopes: ["*"] }],
      [KEY_SCOPED, { agent: "writer", kind: "agent", scopes: ["vault:the portal"] }],
    ]),
    ragCalls: [],
    tasks: [],
    messages: [],
  };
}

describe("MCP server /mcp", () => {
  test("sin Authorization → 401", async () => {
    const { rpc } = makeDeps(makeState());
    const res = await rpc(null, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    expect(res.status).toBe(401);
  });

  test("key desconocida → 401 (backend la rechaza)", async () => {
    const { rpcJson } = makeDeps(makeState());
    const { status } = await rpcJson("sk-cardinal-nope", {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    });
    expect(status).toBe(401);
  });

  test("initialize responde protocolVersion y capabilities", async () => {
    const { rpcJson } = makeDeps(makeState());
    const { status, json } = await rpcJson(KEY_OK, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05" },
    });
    expect(status).toBe(200);
    expect(json.result.protocolVersion).toBe("2024-11-05");
    expect(json.result.capabilities.tools).toBeDefined();
    expect(json.id).toBe(1);
  });

  test("notification (sin id) → 202 sin body", async () => {
    const { rpc } = makeDeps(makeState());
    const res = await rpc(KEY_OK, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  test("key con * ve memory + board tools en tools/list", async () => {
    const { rpcJson } = makeDeps(makeState());
    const { json } = await rpcJson(KEY_OK, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    const names = json.result.tools.map((t: any) => t.name).sort();
    expect(names).toEqual([
      "cardinal_agent_inbox",
      "cardinal_agent_send",
      "cardinal_list_memory",
      "cardinal_read_memory",
      "cardinal_search_memory",
      "cardinal_task_claim",
      "cardinal_task_complete",
      "cardinal_task_create",
      "cardinal_task_list",
    ]);
  });

  test("key sin vaults sigue viendo board tools", async () => {
    const state = makeState();
    state.validKeys.set("sk-cardinal-novault", {
      agent: "worker",
      kind: "agent",
      scopes: ["fast"],
    });
    const { rpcJson } = makeDeps(state);
    const { json } = await rpcJson("sk-cardinal-novault", {
      jsonrpc: "2.0",
      id: 20,
      method: "tools/list",
    });
    const names = json.result.tools.map((t: any) => t.name).sort();
    expect(names).toEqual([
      "cardinal_agent_inbox",
      "cardinal_agent_send",
      "cardinal_task_claim",
      "cardinal_task_complete",
      "cardinal_task_create",
      "cardinal_task_list",
    ]);
  });

  test("cardinal_task_create/list/claim/complete proxyea al backend", async () => {
    const state = makeState();
    const { rpcJson } = makeDeps(state);

    const created = await rpcJson(KEY_OK, {
      jsonrpc: "2.0",
      id: 21,
      method: "tools/call",
      params: {
        name: "cardinal_task_create",
        arguments: { goal: "ship board mcp", parent_id: null },
      },
    });
    expect(created.json.result.isError).toBeUndefined();
    const createdTask = JSON.parse(created.json.result.content[0].text).task;
    expect(createdTask.goal).toBe("ship board mcp");
    expect(createdTask.status).toBe("open");
    expect(createdTask.created_by).toBe("shinon");

    const listed = await rpcJson(KEY_OK, {
      jsonrpc: "2.0",
      id: 22,
      method: "tools/call",
      params: { name: "cardinal_task_list", arguments: { status: "open" } },
    });
    const openTasks = JSON.parse(listed.json.result.content[0].text).tasks;
    expect(openTasks.some((t: any) => t.id === createdTask.id)).toBe(true);

    const claimed = await rpcJson(KEY_OK, {
      jsonrpc: "2.0",
      id: 23,
      method: "tools/call",
      params: {
        name: "cardinal_task_claim",
        arguments: { id: createdTask.id },
      },
    });
    const claimedTask = JSON.parse(claimed.json.result.content[0].text).task;
    expect(claimedTask.status).toBe("claimed");
    expect(claimedTask.assigned_to).toBe("shinon");

    const completed = await rpcJson(KEY_OK, {
      jsonrpc: "2.0",
      id: 24,
      method: "tools/call",
      params: {
        name: "cardinal_task_complete",
        arguments: { id: createdTask.id, summary: "board tools live", artifact_ref: "docs/x.md" },
      },
    });
    const doneTask = JSON.parse(completed.json.result.content[0].text).task;
    expect(doneTask.status).toBe("done");
    expect(doneTask.summary).toBe("board tools live");
    expect(doneTask.artifact_ref).toBe("docs/x.md");
  });

  test("cardinal_agent_send/inbox proxyea al backend", async () => {
    const state = makeState();
    const { rpcJson } = makeDeps(state);

    const sent = await rpcJson(KEY_OK, {
      jsonrpc: "2.0",
      id: 25,
      method: "tools/call",
      params: {
        name: "cardinal_agent_send",
        arguments: { to_agent: "shinon", type: "handoff", payload_ref: "notes/x.md" },
      },
    });
    expect(sent.json.result.isError).toBeUndefined();
    const message = JSON.parse(sent.json.result.content[0].text).message;
    expect(message.from_agent).toBe("shinon");
    expect(message.to_agent).toBe("shinon");
    expect(message.type).toBe("handoff");
    expect(message.payload_ref).toBe("notes/x.md");
    expect(message.read).toBe(0);

    const other = await rpcJson(KEY_OK, {
      jsonrpc: "2.0",
      id: 26,
      method: "tools/call",
      params: {
        name: "cardinal_agent_send",
        arguments: { to_agent: "kirito", type: "other" },
      },
    });
    expect(other.json.result.isError).toBeUndefined();
    const otherMessage = JSON.parse(other.json.result.content[0].text).message;
    expect(otherMessage.to_agent).toBe("kirito");

    const inbox = await rpcJson(KEY_OK, {
      jsonrpc: "2.0",
      id: 27,
      method: "tools/call",
      params: { name: "cardinal_agent_inbox", arguments: {} },
    });
    expect(inbox.json.result.isError).toBeUndefined();
    const listed = JSON.parse(inbox.json.result.content[0].text).messages;
    expect(listed.some((m: { id: string }) => m.id === message.id)).toBe(true);
    expect(listed.some((m: { id: string }) => m.id === otherMessage.id)).toBe(false);
  });

  test("ping → result vacío", async () => {
    const { rpcJson } = makeDeps(makeState());
    const { json } = await rpcJson(KEY_OK, { jsonrpc: "2.0", id: 3, method: "ping" });
    expect(json.result).toEqual({});
  });

  test("método desconocido → error -32601", async () => {
    const { rpcJson } = makeDeps(makeState());
    const { json } = await rpcJson(KEY_OK, { jsonrpc: "2.0", id: 4, method: "resources/list" });
    expect(json.error.code).toBe(-32601);
  });

  test("JSON inválido → error -32700", async () => {
    const { server } = makeDeps(makeState());
    const res = await server.fetch(
      new Request("http://localhost:8789/mcp", {
        method: "POST",
        headers: { authorization: `Bearer ${KEY_OK}`, "content-type": "application/json" },
        body: "{not json",
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.error.code).toBe(-32700);
  });

  test("GET /mcp → 405", async () => {
    const { server } = makeDeps(makeState());
    const res = await server.fetch(
      new Request("http://localhost:8789/mcp", {
        headers: { authorization: `Bearer ${KEY_OK}` },
      }),
    );
    expect(res.status).toBe(405);
  });

  test("cardinal_search_memory proxyea al backend y filtra por scope de vault", async () => {
    const state = makeState();
    state.searchResults = [
      {
        path: "/data/vaults/the portal/index.md",
        score: 0.9,
        content: "portal",
        source: "vault",
      },
      {
        path: "/data/vaults/for-my-agents/tasks.md",
        score: 0.8,
        content: "tasks",
        source: "vault",
      },
    ];
    const scoped = makeDeps(state);
    // key scoped a "the portal": solo ve resultados de esa vault
    const { json } = await scoped.rpcJson(KEY_SCOPED, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "cardinal_search_memory", arguments: { query: "hola", top_k: 2 } },
    });
    const content = JSON.parse(json.result.content[0].text);
    expect(content.results).toHaveLength(1);
    expect(content.results[0].vault).toBe("the portal");
    expect(content.results[0].path).toBe("index.md");

    // key con * ve ambos
    const all = makeDeps(state);
    const { json: jsonAll } = await all.rpcJson(KEY_OK, {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "cardinal_search_memory", arguments: { query: "hola" } },
    });
    expect(JSON.parse(jsonAll.result.content[0].text).results).toHaveLength(2);
  });

  test("vault fuera de scope en read/list → error isError con 403-like message", async () => {
    const { rpcJson } = makeDeps(makeState());
    const { json } = await rpcJson(KEY_SCOPED, {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: {
        name: "cardinal_read_memory",
        arguments: { vault: "for-my-agents", path: "tasks.md" },
      },
    });
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toMatch(/forbidden|scope/i);
  });

  test("RAG search uses the service key and still filters by the caller scope", async () => {
    const state = makeState();
    const serviceKey = "sk-cardinal-service";
    state.searchResults = [
      {
        path: "/data/vaults/the portal/index.md",
        score: 0.9,
        content: "portal-body",
        source: "vault",
      },
      {
        path: "/data/vaults/for-my-agents/tasks.md",
        score: 0.8,
        content: "AGENT-VAULT-LEAK",
        source: "vault",
      },
    ];
    const { rpcJson } = makeDeps(state, { serviceKey });
    const { json } = await rpcJson(KEY_SCOPED, {
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: {
        name: "cardinal_search_memory",
        arguments: { query: "hola", top_k: 2, vault: "the portal" },
      },
    });

    expect(state.ragCalls).toHaveLength(1);
    expect(state.ragCalls[0]!.authorization).toBe(`Bearer ${serviceKey}`);
    expect(state.ragCalls[0]!.authorization).not.toContain(KEY_SCOPED);
    expect(JSON.parse(state.ragCalls[0]!.body)).toEqual({ query: "hola", top_k: 2 });
    const text = json.result.content[0].text as string;
    const content = JSON.parse(text);
    expect(content.results).toHaveLength(1);
    expect(content.results[0].vault).toBe("the portal");
    expect(content.results[0].path).toBe("index.md");
    expect(text).not.toContain(serviceKey);
    expect(text).not.toContain("AGENT-VAULT-LEAK");
  });

  test("RAG search without a service key does not forward the caller key", async () => {
    const state = makeState();
    state.searchResults = [];
    const { rpcJson } = makeDeps(state);
    await rpcJson(KEY_OK, {
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: { name: "cardinal_search_memory", arguments: { query: "hola" } },
    });
    expect(state.ragCalls).toHaveLength(1);
    expect(state.ragCalls[0]!.authorization).toBe("");
    expect(state.ragCalls[0]!.authorization).not.toContain(KEY_OK);
  });

  test("a vault argument keeps only that vault for a wildcard key", async () => {
    const state = makeState();
    state.searchResults = [
      {
        path: "/data/vaults/the portal/index.md",
        score: 0.9,
        content: "portal-body",
        source: "vault",
      },
      {
        path: "/data/vaults/for-my-agents/tasks.md",
        score: 0.8,
        content: "AGENT-VAULT-LEAK",
        source: "vault",
      },
    ];
    const { rpcJson } = makeDeps(state);
    const { json } = await rpcJson(KEY_OK, {
      jsonrpc: "2.0",
      id: 10,
      method: "tools/call",
      params: {
        name: "cardinal_search_memory",
        arguments: { query: "hola", vault: "for-my-agents" },
      },
    });
    const content = JSON.parse(json.result.content[0].text);
    expect(content.results).toHaveLength(1);
    expect(content.results[0].vault).toBe("for-my-agents");
    expect(content.results[0].path).toBe("tasks.md");
    expect(json.result.content[0].text).not.toContain("portal-body");
  });

  test("a path that only shares a vault prefix is not treated as that vault", async () => {
    const state = makeState();
    state.searchResults = [
      {
        path: "/data/vaults/the portal-evil/index.md",
        score: 1,
        content: "PREFIX-LEAK",
        source: "vault",
      },
    ];
    const { rpcJson } = makeDeps(state);
    for (const key of [KEY_SCOPED, KEY_OK]) {
      const { json } = await rpcJson(key, {
        jsonrpc: "2.0",
        id: 11,
        method: "tools/call",
        params: { name: "cardinal_search_memory", arguments: { query: "hola" } },
      });
      const content = JSON.parse(json.result.content[0].text);
      expect(content.results).toEqual([]);
      expect(json.result.content[0].text).not.toContain("PREFIX-LEAK");
    }
  });

  test("a blank search query fails before calling the backend", async () => {
    const state = makeState();
    const { rpcJson } = makeDeps(state, { serviceKey: "sk-cardinal-service" });
    const { json } = await rpcJson(KEY_OK, {
      jsonrpc: "2.0",
      id: 12,
      method: "tools/call",
      params: { name: "cardinal_search_memory", arguments: { query: "   " } },
    });
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toBe("missing query");
    expect(state.ragCalls).toHaveLength(0);
  });

  test("a non-numeric top_k is not forwarded to RAG", async () => {
    const state = makeState();
    const { rpcJson } = makeDeps(state);
    await rpcJson(KEY_OK, {
      jsonrpc: "2.0",
      id: 13,
      method: "tools/call",
      params: { name: "cardinal_search_memory", arguments: { query: "hola", top_k: "9" } },
    });
    expect(JSON.parse(state.ragCalls[0]!.body)).toEqual({ query: "hola" });
  });

  test("a failed RAG upstream is an error result and does not echo keys", async () => {
    const state = makeState();
    state.ragStatus = 502;
    const serviceKey = "sk-cardinal-service";
    const { rpcJson } = makeDeps(state, { serviceKey });
    const { json } = await rpcJson(KEY_SCOPED, {
      jsonrpc: "2.0",
      id: 14,
      method: "tools/call",
      params: { name: "cardinal_search_memory", arguments: { query: "hola" } },
    });
    expect(json.result.isError).toBe(true);
    const text = json.result.content[0].text as string;
    expect(text).toContain("502");
    expect(text).not.toContain(serviceKey);
    expect(text).not.toContain(KEY_SCOPED);
  });

  test("tools/call rejects a non-string name and a non-object arguments value", async () => {
    const { rpcJson } = makeDeps(makeState());
    const badArgs = await rpcJson(KEY_OK, {
      jsonrpc: "2.0",
      id: 15,
      method: "tools/call",
      params: { name: "cardinal_search_memory", arguments: "nope" },
    });
    expect(badArgs.json.id).toBe(15);
    expect(badArgs.json.error.code).toBe(-32602);
    expect(badArgs.json.result).toBeUndefined();

    const badName = await rpcJson(KEY_OK, {
      jsonrpc: "2.0",
      id: 16,
      method: "tools/call",
      params: { name: 1, arguments: { query: "hola" } },
    });
    expect(badName.json.id).toBe(16);
    expect(badName.json.error.code).toBe(-32602);
  });
});

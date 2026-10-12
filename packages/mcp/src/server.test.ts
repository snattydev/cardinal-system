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

interface RecordedCall {
  url: string;
  method: string;
  body?: string;
  authorization: string;
}

interface FakeBackendState {
  validKeys: Map<string, { agent: string; kind: string; scopes: string[] }>;
  searchResults?: unknown;
  tasks: FakeTask[];
  messages: FakeMessage[];
  calls?: RecordedCall[];
  boardFailure?: { status: number; body: string };
}

function makeDeps(state: FakeBackendState) {
  const fetchImpl = (async (url: any, init?: any): Promise<Response> => {
    const urlStr = String(url);
    const method = String(init?.method ?? "GET").toUpperCase();
    const auth = (init?.headers as Record<string, string>)?.authorization ?? "";
    state.calls?.push({
      url: urlStr,
      method,
      body: typeof init?.body === "string" ? init.body : undefined,
      authorization: auth,
    });

    if (urlStr.endsWith("/api/internal/keys/validate")) {
      const key = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const id = state.validKeys.get(key);
      if (!id) return Response.json({ error: "unauthorized" }, { status: 401 });
      return Response.json(id);
    }
    if (urlStr.includes("/api/rag/search")) {
      return Response.json({ results: state.searchResults ?? [] });
    }

    if (state.boardFailure) {
      return new Response(state.boardFailure.body, { status: state.boardFailure.status });
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

  test("board tools bind the authenticated agent and drop spoofed actor fields", async () => {
    const state = makeState();
    state.calls = [];
    const { rpcJson } = makeDeps(state);

    const created = await rpcJson(KEY_OK, {
      jsonrpc: "2.0",
      id: 40,
      method: "tools/call",
      params: {
        name: "cardinal_task_create",
        arguments: { goal: "owned", created_by: "kirito", parent_id: "   " },
      },
    });
    expect(created.json.result.isError).toBeUndefined();
    const createdTask = JSON.parse(created.json.result.content[0].text).task;
    expect(createdTask.created_by).toBe("shinon");
    expect(createdTask.parent_id).toBeNull();

    const child = await rpcJson(KEY_OK, {
      jsonrpc: "2.0",
      id: 41,
      method: "tools/call",
      params: {
        name: "cardinal_task_create",
        arguments: { goal: "child", created_by: "kirito", parent_id: createdTask.id },
      },
    });
    const childTask = JSON.parse(child.json.result.content[0].text).task;
    expect(childTask.created_by).toBe("shinon");
    expect(childTask.parent_id).toBe(createdTask.id);

    const claimed = await rpcJson(KEY_OK, {
      jsonrpc: "2.0",
      id: 42,
      method: "tools/call",
      params: {
        name: "cardinal_task_claim",
        arguments: { id: createdTask.id, by: "kirito" },
      },
    });
    expect(JSON.parse(claimed.json.result.content[0].text).task.assigned_to).toBe("shinon");

    const sent = await rpcJson(KEY_OK, {
      jsonrpc: "2.0",
      id: 43,
      method: "tools/call",
      params: {
        name: "cardinal_agent_send",
        arguments: { to_agent: "kirito", type: "ping", from_agent: "asuna" },
      },
    });
    const message = JSON.parse(sent.json.result.content[0].text).message;
    expect(message.from_agent).toBe("shinon");
    expect(message.to_agent).toBe("kirito");

    const toSelf = await rpcJson(KEY_OK, {
      jsonrpc: "2.0",
      id: 44,
      method: "tools/call",
      params: {
        name: "cardinal_agent_send",
        arguments: { to_agent: "shinon", type: "note" },
      },
    });
    const selfMessage = JSON.parse(toSelf.json.result.content[0].text).message;

    const inbox = await rpcJson(KEY_OK, {
      jsonrpc: "2.0",
      id: 45,
      method: "tools/call",
      params: { name: "cardinal_agent_inbox", arguments: { to_agent: "kirito" } },
    });
    const listed = JSON.parse(inbox.json.result.content[0].text).messages;
    expect(listed.some((m: { id: string }) => m.id === selfMessage.id)).toBe(true);
    expect(listed.some((m: { id: string }) => m.id === message.id)).toBe(false);

    const createBody = JSON.parse(state.calls!.find((c) => c.method === "POST" && c.url.endsWith("/api/tasks"))!.body!);
    expect(createBody).toEqual({ goal: "owned", created_by: "shinon" });
    expect(state.calls!.every((c) => c.authorization === `Bearer ${KEY_OK}`)).toBe(true);
    const inboxCall = state.calls!.find((c) => c.method === "GET" && c.url.includes("/api/messages"));
    expect(inboxCall!.url).toContain("to_agent=shinon");
    expect(inboxCall!.url).not.toContain("to_agent=kirito");
  });

  test("blank board arguments fail before calling the backend", async () => {
    const state = makeState();
    state.calls = [];
    const { rpcJson } = makeDeps(state);
    const calls = [
      { name: "cardinal_task_create", arguments: { goal: "   " } },
      { name: "cardinal_task_create", arguments: {} },
      { name: "cardinal_task_claim", arguments: { id: "  " } },
      { name: "cardinal_task_complete", arguments: { id: "" } },
      { name: "cardinal_agent_send", arguments: { to_agent: " ", type: "ping" } },
      { name: "cardinal_agent_send", arguments: { to_agent: "kirito", type: "" } },
    ];
    for (const [index, params] of calls.entries()) {
      const { json } = await rpcJson(KEY_OK, {
        jsonrpc: "2.0",
        id: 50 + index,
        method: "tools/call",
        params,
      });
      expect(json.result.isError).toBe(true);
      expect(json.result.content[0].text).toMatch(/missing /);
    }
    expect(state.calls!.filter((c) => !c.url.endsWith("/api/internal/keys/validate"))).toEqual([]);
  });

  test("encodes task ids and status filters as a single path or query value", async () => {
    const state = makeState();
    state.calls = [];
    const taskId = "a/b?x=1";
    state.tasks.push(
      {
        id: taskId,
        goal: "encoded",
        status: "open",
        created_by: "shinon",
        assigned_to: null,
        summary: null,
        artifact_ref: null,
        parent_id: null,
      },
      {
        id: "weird-status",
        goal: "filter",
        status: "open&done=1",
        created_by: "shinon",
        assigned_to: null,
        summary: null,
        artifact_ref: null,
        parent_id: null,
      },
      {
        id: "plain-open",
        goal: "plain",
        status: "open",
        created_by: "shinon",
        assigned_to: null,
        summary: null,
        artifact_ref: null,
        parent_id: null,
      },
    );
    const { rpcJson } = makeDeps(state);

    const claimed = await rpcJson(KEY_OK, {
      jsonrpc: "2.0",
      id: 60,
      method: "tools/call",
      params: { name: "cardinal_task_claim", arguments: { id: taskId } },
    });
    expect(claimed.json.result.isError).toBeUndefined();
    expect(JSON.parse(claimed.json.result.content[0].text).task.assigned_to).toBe("shinon");
    const claimCall = state.calls!.find((c) => c.method === "PUT" && c.url.includes("/claim"));
    expect(claimCall!.url).toContain(`/api/tasks/${encodeURIComponent(taskId)}/claim`);

    const listed = await rpcJson(KEY_OK, {
      jsonrpc: "2.0",
      id: 61,
      method: "tools/call",
      params: { name: "cardinal_task_list", arguments: { status: "open&done=1" } },
    });
    const tasks = JSON.parse(listed.json.result.content[0].text).tasks;
    expect(tasks.map((t: { id: string }) => t.id)).toEqual(["weird-status"]);
    const listCall = state.calls!.find((c) => c.method === "GET" && c.url.includes("/api/tasks?"));
    expect(listCall!.url).toContain(`status=${encodeURIComponent("open&done=1")}`);
  });

  test("a failed board call does not include the caller key", async () => {
    const state = makeState();
    state.boardFailure = { status: 500, body: "upstream exploded" };
    const { rpcJson } = makeDeps(state);
    const { json } = await rpcJson(KEY_OK, {
      jsonrpc: "2.0",
      id: 62,
      method: "tools/call",
      params: { name: "cardinal_task_create", arguments: { goal: "ship" } },
    });
    expect(json.result.isError).toBe(true);
    const text = json.result.content[0].text as string;
    expect(text).toContain("500");
    expect(text).toContain("upstream exploded");
    expect(text).not.toContain(KEY_OK);
  });
});

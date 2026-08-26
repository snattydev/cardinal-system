import { describe, expect, test } from "bun:test";
import { createMcpServer } from "./server";

const VAULTS = ["the portal", "for-my-agents"] as const;

interface FakeBackendState {
  validKeys: Map<string, { agent: string; kind: string; scopes: string[] }>;
  searchResults?: unknown;
}

function makeDeps(state: FakeBackendState) {
  const fetchImpl = (async (url: any, init?: any): Promise<Response> => {
    const urlStr = String(url);
    if (urlStr.endsWith("/api/internal/keys/validate")) {
      const auth = (init?.headers as Record<string, string>)?.authorization ?? "";
      const key = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const id = state.validKeys.get(key);
      if (!id) return Response.json({ error: "unauthorized" }, { status: 401 });
      return Response.json(id);
    }
    if (urlStr.includes("/api/rag/search")) {
      return Response.json({ results: state.searchResults ?? [] });
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

  test("key con * ve las tres tools en tools/list", async () => {
    const { rpcJson } = makeDeps(makeState());
    const { json } = await rpcJson(KEY_OK, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    const names = json.result.tools.map((t: any) => t.name).sort();
    expect(names).toEqual(["cardinal_list_memory", "cardinal_read_memory", "cardinal_search_memory"]);
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
      { source: "the portal/index.md", score: 0.9, text: "portal" },
      { source: "for-my-agents/tasks.md", score: 0.8, text: "tasks" },
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
    expect(content.results[0].source).toBe("the portal/index.md");

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
});

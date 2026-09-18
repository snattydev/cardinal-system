import { allowedVaults, type KeyIdentity } from "./auth";
import { createValidator, type ValidatorOptions } from "./validator";
import {
  makeListVaultFiles,
  makeReadVaultFile,
  VaultError,
  type VaultFile,
} from "./vaults";
import rootPkg from "../../../package.json";

export interface McpServerOptions extends ValidatorOptions {
  backendUrl: string;
  /** Service key del MCP contra el backend (para /api/rag/search). */
  serviceKey?: string;
  vaultsRoot: string;
  knownVaults: readonly string[];
  fetchImpl?: typeof fetch;
}

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const SEARCH_TOOL: ToolDef = {
  name: "cardinal_search_memory",
  description: "Búsqueda semántica/híbrida en las memorias (vaults) de Cardinal.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Texto a buscar" },
      top_k: { type: "number", description: "Cantidad máxima de resultados (1-10)" },
      vault: { type: "string", description: "Filtrar por vault específica" },
    },
    required: ["query"],
  },
};

const READ_TOOL: ToolDef = {
  name: "cardinal_read_memory",
  description: "Lee un archivo .md de una vault de memoria.",
  inputSchema: {
    type: "object",
    properties: {
      vault: { type: "string", description: "Nombre de la vault" },
      path: { type: "string", description: "Path relativo dentro de la vault" },
    },
    required: ["vault", "path"],
  },
};

const LIST_TOOL: ToolDef = {
  name: "cardinal_list_memory",
  description: "Lista recursiva de archivos .md de una vault (o de todas las accesibles).",
  inputSchema: {
    type: "object",
    properties: {
      vault: { type: "string", description: "Nombre de la vault (opcional; default todas)" },
    },
  },
};

const TASK_CREATE_TOOL: ToolDef = {
  name: "cardinal_task_create",
  description: "Crea una task en el blackboard de Cardinal.",
  inputSchema: {
    type: "object",
    properties: {
      goal: { type: "string", description: "Objetivo de la task" },
      parent_id: { type: "string", description: "ID de task padre (opcional)" },
    },
    required: ["goal"],
  },
};

const TASK_LIST_TOOL: ToolDef = {
  name: "cardinal_task_list",
  description: "Lista tasks del blackboard (opcionalmente filtradas por status).",
  inputSchema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        description: "Filtro de status: open | claimed | done | blocked",
      },
    },
  },
};

const TASK_CLAIM_TOOL: ToolDef = {
  name: "cardinal_task_claim",
  description: "Claima una task open. assigned_to = agent de la key.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "ID de la task" },
    },
    required: ["id"],
  },
};

const TASK_COMPLETE_TOOL: ToolDef = {
  name: "cardinal_task_complete",
  description: "Marca una task como done con summary y artifact_ref opcionales.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "ID de la task" },
      summary: { type: "string", description: "Resumen acotado del resultado" },
      artifact_ref: { type: "string", description: "Referencia al artefacto (path/URL)" },
    },
    required: ["id"],
  },
};

const AGENT_SEND_TOOL: ToolDef = {
  name: "cardinal_agent_send",
  description: "envía un mensaje al mailbox de otro agente",
  inputSchema: {
    type: "object",
    properties: {
      to_agent: { type: "string", description: "Agente destinatario" },
      type: { type: "string", description: "Tipo de mensaje" },
      payload_ref: { type: "string", description: "Referencia al payload (opcional)" },
    },
    required: ["to_agent", "type"],
  },
};

const AGENT_INBOX_TOOL: ToolDef = {
  name: "cardinal_agent_inbox",
  description: "lista mensajes del inbox del agente de la key",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

const BOARD_TOOLS: ToolDef[] = [
  TASK_CREATE_TOOL,
  TASK_LIST_TOOL,
  TASK_CLAIM_TOOL,
  TASK_COMPLETE_TOOL,
  AGENT_SEND_TOOL,
  AGENT_INBOX_TOOL,
];

const MEMORY_TOOLS: ToolDef[] = [SEARCH_TOOL, READ_TOOL, LIST_TOOL];

function textResult(text: string, isError = false) {
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

export function createMcpServer(options: McpServerOptions) {
  const validate = createValidator(options.backendUrl, options);
  const listVaultFiles = makeListVaultFiles(options.vaultsRoot);
  const readVaultFile = makeReadVaultFile(options.vaultsRoot);
  const knownVaults = options.knownVaults;
  const doFetch = options.fetchImpl ?? fetch;

  function toolsFor(identity: KeyIdentity): ToolDef[] {
    const tools: ToolDef[] = [...BOARD_TOOLS];
    // Memory tools only when the key can reach at least one vault.
    if (allowedVaults(identity.scopes, knownVaults).size > 0) {
      tools.push(...MEMORY_TOOLS);
    }
    return tools;
  }

  function bearerHeaders(identityKey: string): Record<string, string> {
    return {
      "content-type": "application/json",
      authorization: `Bearer ${identityKey}`,
    };
  }

  async function backendJson(
    identityKey: string,
    path: string,
    init?: { method?: string; body?: unknown },
  ): Promise<unknown> {
    const res = await doFetch(`${options.backendUrl}${path}`, {
      method: init?.method ?? "GET",
      headers: bearerHeaders(identityKey),
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    if (!res.ok) {
      let detail = "";
      try {
        detail = await res.text();
      } catch {
        /* ignore */
      }
      throw new Error(`backend ${path} failed (${res.status})${detail ? `: ${detail}` : ""}`);
    }
    return res.json();
  }

  function assertScope(identity: KeyIdentity, vault: string): void {
    if (!allowedVaults(identity.scopes, knownVaults).has(vault)) {
      throw new ScopeError(`forbidden: vault "${vault}" fuera del scope de la key`);
    }
  }

  async function callSearch(identity: KeyIdentity, args: Record<string, unknown>): Promise<string> {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (query === "") throw new Error("missing query");
    const body: Record<string, unknown> = { query };
    if (typeof args.top_k === "number") body.top_k = args.top_k;

    const res = await doFetch(`${options.backendUrl}/api/rag/search`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(options.serviceKey ? { authorization: `Bearer ${options.serviceKey}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`backend rag/search failed (${res.status})`);
    const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
    const results = data.results ?? [];

    // Clasificar por vault. El backend normaliza cada resultado a
    // {path: <abs path en el host>, score, content, source: "vault"}: la vault
    // real hay que deducirla del path absoluto matcheando los knownVaults.
    const allowed = allowedVaults(identity.scopes, knownVaults);
    const wanted = typeof args.vault === "string" ? args.vault : null;
    const classified = results.map((r) => {
      const absPath = String(r.path ?? "");
      let vault = "(root)";
      let relPath = absPath;
      for (const candidate of knownVaults) {
        const marker = `/${candidate}/`;
        const idx = absPath.indexOf(marker);
        if (idx !== -1) {
          vault = candidate;
          relPath = absPath.slice(idx + marker.length);
          break;
        }
      }
      return { ...r, vault, path: relPath };
    });
    const filtered = classified.filter(
      (r) =>
        allowed.has(r.vault as string) && (wanted === null || r.vault === wanted),
    );
    return JSON.stringify({ results: filtered }, null, 2);
  }

  async function callRead(identity: KeyIdentity, args: Record<string, unknown>): Promise<string> {
    const vault = typeof args.vault === "string" ? args.vault : "";
    const path = typeof args.path === "string" ? args.path : "";
    if (vault === "" || path === "") throw new Error("missing vault or path");
    assertScope(identity, vault);
    const content = await readVaultFile(vault, path);
    return content;
  }

  async function callList(identity: KeyIdentity, args: Record<string, unknown>): Promise<string> {
    const allowed = allowedVaults(identity.scopes, knownVaults);
    let listing: Record<string, VaultFile[]> = {};
    const targets =
      typeof args.vault === "string" ? [args.vault] : [...allowed].filter((v) => knownVaults.includes(v));
    for (const vault of targets) {
      assertScope(identity, vault);
      try {
        listing[vault] = await listVaultFiles(vault);
      } catch (err) {
        if (err instanceof VaultError) throw err;
        throw err;
      }
    }
    return JSON.stringify(listing, null, 2);
  }

  async function callTaskCreate(
    identity: KeyIdentity,
    identityKey: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const goal = typeof args.goal === "string" ? args.goal.trim() : "";
    if (goal === "") throw new Error("missing goal");
    const body: Record<string, unknown> = { goal, created_by: identity.agent };
    if (typeof args.parent_id === "string" && args.parent_id.trim() !== "") {
      body.parent_id = args.parent_id;
    }
    const data = await backendJson(identityKey, "/api/tasks", { method: "POST", body });
    return JSON.stringify(data, null, 2);
  }

  async function callTaskList(identityKey: string, args: Record<string, unknown>): Promise<string> {
    const qs =
      typeof args.status === "string" && args.status.trim() !== ""
        ? `?status=${encodeURIComponent(args.status.trim())}`
        : "";
    const data = await backendJson(identityKey, `/api/tasks${qs}`);
    return JSON.stringify(data, null, 2);
  }

  async function callTaskClaim(
    identity: KeyIdentity,
    identityKey: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const id = typeof args.id === "string" ? args.id.trim() : "";
    if (id === "") throw new Error("missing id");
    const data = await backendJson(identityKey, `/api/tasks/${encodeURIComponent(id)}/claim`, {
      method: "PUT",
      body: { by: identity.agent },
    });
    return JSON.stringify(data, null, 2);
  }

  async function callTaskComplete(identityKey: string, args: Record<string, unknown>): Promise<string> {
    const id = typeof args.id === "string" ? args.id.trim() : "";
    if (id === "") throw new Error("missing id");
    const body: Record<string, unknown> = {};
    if (typeof args.summary === "string") body.summary = args.summary;
    if (typeof args.artifact_ref === "string") body.artifact_ref = args.artifact_ref;
    const data = await backendJson(identityKey, `/api/tasks/${encodeURIComponent(id)}/complete`, {
      method: "PUT",
      body,
    });
    return JSON.stringify(data, null, 2);
  }

  async function callAgentSend(
    identity: KeyIdentity,
    identityKey: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const to_agent = typeof args.to_agent === "string" ? args.to_agent.trim() : "";
    const type = typeof args.type === "string" ? args.type.trim() : "";
    if (to_agent === "") throw new Error("missing to_agent");
    if (type === "") throw new Error("missing type");
    const body: Record<string, unknown> = { from_agent: identity.agent, to_agent, type };
    if (typeof args.payload_ref === "string") body.payload_ref = args.payload_ref;
    const data = await backendJson(identityKey, "/api/messages", { method: "POST", body });
    return JSON.stringify(data, null, 2);
  }

  async function callAgentInbox(identity: KeyIdentity, identityKey: string): Promise<string> {
    const data = await backendJson(
      identityKey,
      `/api/messages?to_agent=${encodeURIComponent(identity.agent)}`,
    );
    return JSON.stringify(data, null, 2);
  }

  async function dispatch(
    identity: KeyIdentity,
    identityKey: string,
    name: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    switch (name) {
      case "cardinal_search_memory":
        return callSearch(identity, args);
      case "cardinal_read_memory":
        return callRead(identity, args);
      case "cardinal_list_memory":
        return callList(identity, args);
      case "cardinal_task_create":
        return callTaskCreate(identity, identityKey, args);
      case "cardinal_task_list":
        return callTaskList(identityKey, args);
      case "cardinal_task_claim":
        return callTaskClaim(identity, identityKey, args);
      case "cardinal_task_complete":
        return callTaskComplete(identityKey, args);
      case "cardinal_agent_send":
        return callAgentSend(identity, identityKey, args);
      case "cardinal_agent_inbox":
        return callAgentInbox(identity, identityKey);
      default:
        throw new Error(`unknown tool: ${name}`);
    }
  }

  class ScopeError extends Error {}

  async function handleRpc(msg: any, identity: KeyIdentity, identityKey: string): Promise<Response> {
    const method: string | undefined = msg.method;
    const hasId = msg.id !== undefined && msg.id !== null;

    if (!hasId) {
      // Notification: no response body (known protocol pitfall).
      return new Response(null, { status: 202 });
    }
    const id = msg.id;

    const reply = (result: unknown) => Response.json({ jsonrpc: "2.0", id, result });
    const errorReply = (code: number, message: string) =>
      Response.json({ jsonrpc: "2.0", id, error: { code, message } });

    switch (method) {
      case "initialize":
        return reply({
          protocolVersion: String(msg.params?.protocolVersion ?? "2024-11-05"),
          capabilities: { tools: {} },
          serverInfo: { name: "cardinal-mcp", version: rootPkg.version },
        });
      case "ping":
        return reply({});
      case "tools/list":
        return reply({ tools: toolsFor(identity) });
      case "tools/call": {
        const name = msg.params?.name;
        const args = msg.params?.arguments ?? {};
        if (typeof name !== "string" || typeof args !== "object" || args === null) {
          return errorReply(-32602, "invalid params");
        }
        try {
          const text = await dispatch(identity, identityKey, name, args as Record<string, unknown>);
          return reply(textResult(text));
        } catch (err) {
          if (err instanceof ScopeError) {
            return reply(textResult(err.message, true));
          }
          const message = err instanceof Error ? err.message : String(err);
          return reply(textResult(message, true));
        }
      }
      default:
        return errorReply(-32601, `method not found: ${method}`);
    }
  }

  return {
    port: undefined as number | undefined,

    async fetch(req: Request): Promise<Response> {
      const { pathname } = new URL(req.url);

      if (pathname !== "/mcp") {
        return Response.json({ error: "not_found" }, { status: 404 });
      }
      if (req.method !== "POST") {
        return Response.json({ error: "method_not_allowed" }, { status: 405 });
      }

      // Auth: Bearer key → validate against backend (TTL cache).
      const auth = req.headers.get("authorization");
      if (auth === null || !auth.startsWith("Bearer ")) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      const identityKey = auth.slice(7).trim();
      const identity = await validate(identityKey);
      if (identity === null) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }

      let msg: unknown;
      try {
        msg = await req.json();
      } catch {
        return Response.json(
          { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } },
          { status: 200 },
        );
      }
      return handleRpc(msg, identity, identityKey);
    },

    start(port = Number(process.env.PORT ?? 8789)) {
      const server = Bun.serve({ port, fetch: this.fetch.bind(this) });
      this.port = server.port;
      console.log(`cardinal-mcp listening on :${server.port}`);
      return server;
    },
  };
}

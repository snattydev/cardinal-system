import { allowedVaults, type KeyIdentity } from "./auth";
import { createValidator, type ValidatorOptions } from "./validator";
import {
  makeListVaultFiles,
  makeReadVaultFile,
  VaultError,
  type VaultFile,
} from "./vaults";

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
    // Sin acceso a ninguna vault no tiene sentido exponer tools de memoria.
    if (allowedVaults(identity.scopes, knownVaults).size === 0) return [];
    return [SEARCH_TOOL, READ_TOOL, LIST_TOOL];
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

  async function dispatch(
    identity: KeyIdentity,
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
      default:
        throw new Error(`unknown tool: ${name}`);
    }
  }

  class ScopeError extends Error {}

  async function handleRpc(msg: any, identity: KeyIdentity): Promise<Response> {
    const method: string | undefined = msg.method;
    const hasId = msg.id !== undefined && msg.id !== null;

    if (!hasId) {
      // Notificación: sin respuesta (pitfall conocido del protocolo).
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
          serverInfo: { name: "cardinal-mcp", version: "0.1.0" },
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
          const text = await dispatch(identity, name, args as Record<string, unknown>);
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

      // Auth: Bearer key → validar contra el backend (cache TTL).
      const auth = req.headers.get("authorization");
      if (auth === null || !auth.startsWith("Bearer ")) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      const identity = await validate(auth.slice(7).trim());
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
      return handleRpc(msg, identity);
    },

    start(port = Number(process.env.PORT ?? 8789)) {
      const server = Bun.serve({ port, fetch: this.fetch.bind(this) });
      this.port = server.port;
      console.log(`cardinal-mcp listening on :${server.port}`);
      return server;
    },
  };
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import rootPkg from "../../../package.json";
import {
  canReadAnyVault,
  canReadConfigCategory,
  canWritePath,
  canWritePrefix,
  DEFAULT_DENY_PREFIXES,
  hasServiceScope,
  type AclConfig,
  type ConfigCategory,
  type KeyIdentity,
} from "./acl";
import { buildBootstrapPacket } from "./bootstrap";
import { makeConfigStore } from "./configs";
import { buildOnboardPacket } from "./onboard";
import { makeSearchEngine } from "./search";
import { createValidator, type ValidatorOptions } from "./validator";
import { makeVaultStore } from "./vaults";
import { makeSandboxedWriter, type SandboxedWriter } from "./writer";

export interface McpServerOptions extends ValidatorOptions {
  backendUrl: string;
  vaultsRoot: string;
  writableRoot?: string;
  configsRoot?: string;
  indexDbPath?: string;
  qmdUrl?: string;
  denyPrefixes?: readonly string[];
  gitAutoCommit?: boolean;
}

function textResult(text: string, isError = false) {
  return {
    content: [{ type: "text" as const, text }],
    ...(isError ? { isError: true } : {}),
  };
}

async function normalizeStreamableRequest(req: Request): Promise<Request> {
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("application/json") && accept.includes("text/event-stream")) {
    return req;
  }
  const headers = new Headers(req.headers);
  headers.set("accept", "application/json, text/event-stream");
  const body = await req.arrayBuffer();
  return new Request(req.url, {
    method: req.method,
    headers,
    body,
  });
}

export function createMcpServer(options: McpServerOptions) {
  const doFetch = options.fetchImpl ?? fetch;
  const backendUrl = options.backendUrl.replace(/\/+$/, "");
  const internalSecret = options.internalServiceSecret?.trim() || undefined;
  const aclConfig: AclConfig = {
    denyPrefixes: options.denyPrefixes ?? DEFAULT_DENY_PREFIXES,
  };

  const validate = createValidator(backendUrl, {
    ...options,
    fetchImpl: doFetch,
  });

  const vaultStore = makeVaultStore({
    vaultsRoot: options.vaultsRoot,
    writableRoot: options.writableRoot,
    aclConfig,
  });

  const configStore = makeConfigStore({
    configsRoot: options.configsRoot,
  });

  const writer: SandboxedWriter | null = options.writableRoot
    ? makeSandboxedWriter({
        writableRoot: options.writableRoot,
        gitAutoCommit: options.gitAutoCommit ?? true,
      })
    : null;

  const searchEngine = makeSearchEngine({
    vaultsRoot: options.vaultsRoot,
    writableRoot: options.writableRoot,
    indexDbPath: options.indexDbPath,
    qmdUrl: options.qmdUrl,
    aclConfig,
    fetchImpl: doFetch,
  });

  function recordUsage(
    identityKey: string,
    toolName: string,
    ok: boolean,
    bytesOut: number,
    durationMs: number,
  ): void {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer ${identityKey}`,
    };
    if (internalSecret) {
      headers["x-cardinal-internal-secret"] = internalSecret;
    }
    void Promise.resolve(
      doFetch(`${backendUrl}/api/internal/mcp/usage`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          tool_name: toolName,
          ok,
          bytes_out: Math.max(0, Math.floor(bytesOut)),
          duration_ms: Math.max(0, Math.floor(durationMs)),
        }),
      }),
    ).catch(() => {});
  }

  async function backendJson(
    identityKey: string,
    path: string,
    init?: { method?: string; body?: unknown },
  ): Promise<unknown> {
    const res = await doFetch(`${backendUrl}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${identityKey}`,
      },
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

  async function withToolTelemetry(
    identityKey: string,
    toolName: string,
    fn: () => Promise<string>,
  ) {
    const start = Date.now();
    try {
      const text = await fn();
      recordUsage(
        identityKey,
        toolName,
        true,
        Buffer.byteLength(text, "utf8"),
        Date.now() - start,
      );
      return textResult(text);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      recordUsage(
        identityKey,
        toolName,
        false,
        Buffer.byteLength(message, "utf8"),
        Date.now() - start,
      );
      return textResult(message, true);
    }
  }

  function buildCallerMcpServer(identity: KeyIdentity, identityKey: string): McpServer {
    const mcp = new McpServer(
      {
        name: "cardinal-context-hub",
        version: rootPkg.version,
      },
      {
        capabilities: {
          tools: {},
          prompts: {},
        },
      },
    );

    const canRead = canReadAnyVault(identity.scopes, aclConfig);

    if (canRead) {
      mcp.registerPrompt(
        "cardinal_onboard",
      {
        title: "Cardinal Onboarding",
        description:
          "Assemble a deterministic onboarding context packet (conduct rules, setup, active projects, and readable topic map).",
        argsSchema: {
          mode: z.enum(["coding", "hermes"]).optional(),
          project: z.string().optional(),
        },
      },
      async (args) => {
        const start = Date.now();
        const mode = args.mode ?? "coding";
        try {
          const packet = await buildOnboardPacket({
            mode,
            project: args.project,
            scopes: identity.scopes,
            vaultStore,
            aclConfig,
          });
          recordUsage(identityKey, "prompt:cardinal_onboard", true, packet.bytes, Date.now() - start);
          return {
            description: `Cardinal onboarding packet (${mode})`,
            messages: [
              {
                role: "user" as const,
                content: { type: "text" as const, text: packet.markdown },
              },
            ],
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          recordUsage(
            identityKey,
            "prompt:cardinal_onboard",
            false,
            Buffer.byteLength(message, "utf8"),
            Date.now() - start,
          );
          return {
            description: "Cardinal onboarding error",
            messages: [
              {
                role: "user" as const,
                content: { type: "text" as const, text: `Onboarding failed: ${message}` },
              },
            ],
          };
        }
      },
    );

    mcp.registerPrompt(
      "cardinal_bootstrap_repo",
      {
        title: "Cardinal New-Repo Bootstrap (Configuration 101)",
        description:
          "Bundle baseline conduct rules, starter AGENTS.md/PR templates, and portable workflow skills from vaults without client-side installs.",
        argsSchema: {
          preset: z.string().optional(),
          project: z.string().optional(),
          stack: z.string().optional(),
          skills: z.string().optional(),
          scope: z.enum(["lite", "standard", "full"]).optional(),
        },
      },
      async (args) => {
        const start = Date.now();
        const skillsList = args.skills
          ? args.skills
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;
        try {
          const packet = await buildBootstrapPacket({
            preset: args.preset,
            project: args.project,
            stack: args.stack,
            skills: skillsList,
            repoScope: args.scope,
            scopes: identity.scopes,
            vaultStore,
            aclConfig,
          });
          recordUsage(identityKey, "prompt:cardinal_bootstrap_repo", true, packet.bytes, Date.now() - start);
          return {
            description: `Cardinal repo bootstrap (${packet.preset})`,
            messages: [
              {
                role: "user" as const,
                content: { type: "text" as const, text: packet.markdown },
              },
            ],
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          recordUsage(
            identityKey,
            "prompt:cardinal_bootstrap_repo",
            false,
            Buffer.byteLength(message, "utf8"),
            Date.now() - start,
          );
          return {
            description: "Cardinal repo bootstrap error",
            messages: [
              {
                role: "user" as const,
                content: { type: "text" as const, text: `Bootstrap failed: ${message}` },
              },
            ],
          };
        }
      },
    );

    mcp.registerTool(
        "cardinal_bootstrap_repo",
        {
          title: "Bootstrap Repository (Configuration 101)",
          description:
            "Return the personal repo standards for a scope tier (README, AGENTS.md, GitHub templates, verify/hook scripts, repo skills) plus conduct rules and workflow skills (planning, commits, PR flow, TDD) from the vault. Use for new repos, auditing existing ones, or brainstorming features (preset 'brainstorm').",
          inputSchema: {
            preset: z
              .string()
              .optional()
              .describe("Preset: 'default', 'brainstorm', 'standards', 'prd', 'minimal', a vault preset, or 'list'."),
            scope: z
              .enum(["lite", "standard", "full"])
              .optional()
              .describe("Repo tier: 'lite' (scripts/spikes, no hooks), 'standard' (default apps/libs, light hook), 'full' (security-sensitive, CI + full hooks)."),
            hooks: z
              .enum(["auto", "none", "light", "full"])
              .optional()
              .describe("Override git hook level; 'auto' (default) follows the scope tier."),
            default_branch: z.string().optional().describe("Integration branch (default 'dev'; 'main' for lite)."),
            project: z.string().optional().describe("Project slug used in README/AGENTS.md templates."),
            stack: z.string().optional().describe("Stack summary (e.g. 'TypeScript, Bun'); also selects CI toolchain setup."),
            skills: z.array(z.string()).optional().describe("Explicit skill slugs or vault paths replacing preset skills ('a|b' = first found)."),
            extra_skills: z.array(z.string()).optional().describe("Additional skill slugs or paths appended to the preset."),
            include_starter_files: z.boolean().optional().describe("Include the repo standards files (default true; false for 'brainstorm')."),
            format: z
              .enum(["markdown", "json"])
              .optional()
              .describe("'markdown' (default) or 'json' with files[] and complianceChecklist for scaffolding or audits."),
            max_bytes: z.number().int().min(512).max(196_608).optional().describe("Max markdown bytes (default 96000)."),
          },
          annotations: { readOnlyHint: true },
        },
        async (args) =>
          withToolTelemetry(identityKey, "cardinal_bootstrap_repo", async () => {
            const packet = await buildBootstrapPacket({
              preset: args.preset,
              project: args.project,
              stack: args.stack,
              skills: args.skills,
              extraSkills: args.extra_skills,
              includeStarterFiles: args.include_starter_files,
              repoScope: args.scope,
              hooks: args.hooks,
              defaultBranch: args.default_branch,
              maxBytes: args.max_bytes,
              scopes: identity.scopes,
              vaultStore,
              aclConfig,
            });
            if (args.format === "json") {
              return JSON.stringify(
                {
                  preset: packet.preset,
                  standardsVersion: packet.standardsVersion,
                  scope: packet.scope,
                  hooks: packet.hooks,
                  complianceChecklist: packet.complianceChecklist,
                  files: packet.files,
                  conductFiles: packet.conductFiles,
                  includedSkills: packet.includedSkills,
                  missingSkills: packet.missingSkills,
                  availablePresets: packet.availablePresets,
                },
                null,
                2,
              );
            }
            return packet.markdown;
          }),
      );
      mcp.registerTool(
        "cardinal_onboard",
        {
          title: "Assemble Onboarding Context",
          description:
            "Build a deterministic, scope-filtered onboarding packet (conduct rules, setup, active projects, optional project handoff, and topic map).",
          inputSchema: {
            mode: z
              .enum(["coding", "hermes"])
              .optional()
              .describe("Harness mode: 'coding' for stateless coding agents or 'hermes' for Hermes profiles."),
            project: z
              .string()
              .optional()
              .describe("Optional project slug to include agents/handoffs/<project>.md in coding mode."),
          },
          annotations: { readOnlyHint: true },
        },
        async (args) =>
          withToolTelemetry(identityKey, "cardinal_onboard", async () => {
            const packet = await buildOnboardPacket({
              mode: args.mode ?? "coding",
              project: args.project,
              scopes: identity.scopes,
              vaultStore,
              aclConfig,
            });
            return packet.markdown;
          }),
      );

      mcp.registerTool(
        "cardinal_list",
        {
          title: "List Readable Vault Topics",
          description:
            "Progressive-disclosure listing of readable markdown directories and files under an optional relative prefix.",
          inputSchema: {
            prefix: z.string().optional().describe("Optional relative directory prefix (e.g. 'skills/coding')."),
            depth: z.number().int().min(1).max(5).optional().describe("Max directory depth (1-5, default 2)."),
          },
          annotations: { readOnlyHint: true },
        },
        async (args) =>
          withToolTelemetry(identityKey, "cardinal_list", async () => {
            const listing = await vaultStore.listEntries(identity.scopes, {
              prefix: args.prefix,
              depth: args.depth,
            });
            return JSON.stringify(listing, null, 2);
          }),
      );

      mcp.registerTool(
        "cardinal_search",
        {
          title: "Search Vault Context",
          description:
            "Search readable markdown vaults and skills using hybrid/BM25 search, strictly filtered by the caller key's path scopes.",
          inputSchema: {
            query: z.string().min(1).describe("Search query text."),
            prefix: z.string().optional().describe("Optional relative path prefix filter."),
            top_k: z.number().int().min(1).max(20).optional().describe("Maximum hits to return (1-20, default 5)."),
          },
          annotations: { readOnlyHint: true },
        },
        async (args) =>
          withToolTelemetry(identityKey, "cardinal_search", async () => {
            const out = await searchEngine.search(identity.scopes, {
              query: args.query,
              prefix: args.prefix,
              topK: args.top_k,
            });
            return JSON.stringify(out, null, 2);
          }),
      );

      mcp.registerTool(
        "cardinal_read",
        {
          title: "Read Markdown Note",
          description:
            "Read a single markdown (.md) note by relative vault path, enforcing path-glob ACLs and byte limits.",
          inputSchema: {
            path: z.string().min(1).describe("Relative path inside vaults (e.g. 'skills/coding/git/SKILL.md')."),
            max_bytes: z.number().int().min(128).max(131_072).optional().describe("Optional byte limit (default 32768)."),
          },
          annotations: { readOnlyHint: true },
        },
        async (args) =>
          withToolTelemetry(identityKey, "cardinal_read", async () => {
            const note = await vaultStore.readMarkdown(identity.scopes, args.path, args.max_bytes);
            return JSON.stringify(note, null, 2);
          }),
      );
    }

    if (options.configsRoot) {
      const configTools: Array<{
        name: "cardinal_agent_config" | "cardinal_user_config";
        category: ConfigCategory;
        title: string;
        description: string;
        examplePath: string;
      }> = [
        {
          name: "cardinal_agent_config",
          category: "agents",
          title: "Read Agent Harness Configs",
          description:
            "List or read sanitized, secret-redacted agent harness configurations (OpenCode, OMP, AGY, Cursor, Claude, Codex, Hermes) under /data/configs/agents.",
          examplePath: "opencode/opencode.json",
        },
        {
          name: "cardinal_user_config",
          category: "user",
          title: "Read Personal Terminal & User Configs",
          description:
            "List or read sanitized, secret-redacted terminal/shell/personal configurations (Kitty, Fish, Zsh, Starship, Git) under /data/configs/user. Requires explicit config:read:user/** opt-in.",
          examplePath: "kitty/kitty.conf",
        },
      ];

      for (const cfg of configTools) {
        if (!canReadConfigCategory(identity.scopes, cfg.category)) continue;
        mcp.registerTool(
          cfg.name,
          {
            title: cfg.title,
            description: cfg.description,
            inputSchema: {
              action: z
                .enum(["list", "read"])
                .optional()
                .describe("Action: 'list' (default unless path is set) or 'read' one file."),
              path: z
                .string()
                .optional()
                .describe(`Relative path inside ${cfg.category}/ when reading (e.g. '${cfg.examplePath}').`),
              prefix: z.string().optional().describe("Optional relative directory prefix when listing."),
              depth: z.number().int().min(1).max(5).optional().describe("Max directory depth (1-5, default 2) when listing."),
              max_bytes: z.number().int().min(128).max(131_072).optional().describe("Optional byte limit when reading (default 32768)."),
            },
            annotations: { readOnlyHint: true },
          },
          async (args) =>
            withToolTelemetry(identityKey, cfg.name, async () => {
              const action = args.action ?? (args.path ? "read" : "list");
              if (action === "read") {
                if (!args.path || args.path.trim() === "") {
                  throw new Error("path is required when action='read'");
                }
                const res = await configStore.readConfig(
                  identity.scopes,
                  cfg.category,
                  args.path,
                  args.max_bytes,
                );
                return JSON.stringify(res, null, 2);
              }
              const listing = await configStore.listConfigs(identity.scopes, cfg.category, {
                prefix: args.prefix,
                depth: args.depth,
              });
              return JSON.stringify(listing, null, 2);
            }),
        );
      }
    }

    if (writer !== null && canWritePrefix(identity.scopes, "agents/handoffs", aclConfig)) {
      mcp.registerTool(
        "cardinal_handoff",
        {
          title: "Write Project Handoff",
          description:
            "Write a bounded cross-session handoff note under agents/handoffs/<project>.md in the isolated writable state directory.",
          inputSchema: {
            project: z.string().min(1).describe("Project slug matching /^[a-z0-9][a-z0-9._-]{0,63}$/."),
            summary: z.string().min(1).describe("Concise state summary."),
            next_steps: z.array(z.string()).optional().describe("Actionable next steps."),
            refs: z.array(z.string()).optional().describe("Relevant file paths or URLs."),
          },
        },
        async (args) =>
          withToolTelemetry(identityKey, "cardinal_handoff", async () => {
            const res = await writer.writeHandoff({
              agent: identity.agent,
              project: args.project,
              summary: args.summary,
              nextSteps: args.next_steps,
              refs: args.refs,
              assertAllowed: (logicalPath) => {
                if (!canWritePath(identity.scopes, logicalPath, aclConfig)) {
                  throw new Error(`forbidden: write scope denies ${logicalPath}`);
                }
              },
            });
            return JSON.stringify(res, null, 2);
          }),
      );
    }

    if (writer !== null && canWritePrefix(identity.scopes, "agents/proposals", aclConfig)) {
      mcp.registerTool(
        "cardinal_propose_skill",
        {
          title: "Propose Skill Update",
          description:
            "Write a reviewable skill improvement proposal under agents/proposals/ without modifying read-only source vaults.",
          inputSchema: {
            skill_path: z.string().min(1).describe("Relative target skill path (e.g. 'skills/coding/git/SKILL.md')."),
            reason: z.string().min(1).describe("Why this skill change is proposed."),
            content: z.string().min(1).describe("Proposed markdown content or diff."),
          },
        },
        async (args) =>
          withToolTelemetry(identityKey, "cardinal_propose_skill", async () => {
            const res = await writer.writeSkillProposal({
              agent: identity.agent,
              skillPath: args.skill_path,
              reason: args.reason,
              content: args.content,
              assertAllowed: (logicalPath) => {
                if (!canWritePath(identity.scopes, logicalPath, aclConfig)) {
                  throw new Error(`forbidden: write scope denies ${logicalPath}`);
                }
              },
            });
            return JSON.stringify(res, null, 2);
          }),
      );
    }

    if (hasServiceScope(identity.scopes, "board", "write")) {
      mcp.registerTool(
        "cardinal_task_create",
        {
          title: "Create Blackboard Task",
          description: "Create a task on the Cardinal blackboard.",
          inputSchema: {
            goal: z.string().min(1).describe("Task goal description."),
            parent_id: z.string().optional().describe("Optional parent task ID."),
          },
        },
        async (args) =>
          withToolTelemetry(identityKey, "cardinal_task_create", async () => {
            const body: Record<string, unknown> = {
              goal: args.goal,
              created_by: identity.agent,
            };
            if (args.parent_id && args.parent_id.trim() !== "") {
              body.parent_id = args.parent_id.trim();
            }
            const data = await backendJson(identityKey, "/api/tasks", { method: "POST", body });
            return JSON.stringify(data, null, 2);
          }),
      );
    }

    if (hasServiceScope(identity.scopes, "board", "read")) {
      mcp.registerTool(
        "cardinal_task_list",
        {
          title: "List Blackboard Tasks",
          description: "List tasks on the Cardinal blackboard, optionally filtered by status.",
          inputSchema: {
            status: z
              .enum(["open", "claimed", "done", "blocked"])
              .optional()
              .describe("Optional task status filter."),
          },
          annotations: { readOnlyHint: true },
        },
        async (args) =>
          withToolTelemetry(identityKey, "cardinal_task_list", async () => {
            const qs = args.status ? `?status=${encodeURIComponent(args.status)}` : "";
            const data = await backendJson(identityKey, `/api/tasks${qs}`);
            return JSON.stringify(data, null, 2);
          }),
      );
    }

    if (hasServiceScope(identity.scopes, "board", "write")) {
      mcp.registerTool(
        "cardinal_task_claim",
        {
          title: "Claim Blackboard Task",
          description: "Claim an open blackboard task under the caller key's agent identity.",
          inputSchema: {
            id: z.string().min(1).describe("Task ID."),
          },
        },
        async (args) =>
          withToolTelemetry(identityKey, "cardinal_task_claim", async () => {
            const data = await backendJson(
              identityKey,
              `/api/tasks/${encodeURIComponent(args.id)}/claim`,
              {
                method: "PUT",
                body: { by: identity.agent },
              },
            );
            return JSON.stringify(data, null, 2);
          }),
      );

      mcp.registerTool(
        "cardinal_task_complete",
        {
          title: "Complete Blackboard Task",
          description: "Mark a claimed blackboard task as done with an optional summary and artifact reference.",
          inputSchema: {
            id: z.string().min(1).describe("Task ID."),
            summary: z.string().optional().describe("Bounded result summary."),
            artifact_ref: z.string().optional().describe("Artifact path or URL."),
          },
        },
        async (args) =>
          withToolTelemetry(identityKey, "cardinal_task_complete", async () => {
            const body: Record<string, unknown> = {};
            if (args.summary !== undefined) body.summary = args.summary;
            if (args.artifact_ref !== undefined) body.artifact_ref = args.artifact_ref;
            const data = await backendJson(
              identityKey,
              `/api/tasks/${encodeURIComponent(args.id)}/complete`,
              {
                method: "PUT",
                body,
              },
            );
            return JSON.stringify(data, null, 2);
          }),
      );
    }

    if (hasServiceScope(identity.scopes, "mailbox", "write")) {
      mcp.registerTool(
        "cardinal_agent_send",
        {
          title: "Send Agent Mailbox Message",
          description: "Send a lightweight handoff message to another agent's mailbox.",
          inputSchema: {
            to_agent: z.string().min(1).describe("Recipient agent name."),
            type: z.string().min(1).describe("Message type."),
            payload_ref: z.string().optional().describe("Optional reference to an artifact or handoff."),
          },
        },
        async (args) =>
          withToolTelemetry(identityKey, "cardinal_agent_send", async () => {
            const body: Record<string, unknown> = {
              from_agent: identity.agent,
              to_agent: args.to_agent,
              type: args.type,
            };
            if (args.payload_ref !== undefined) body.payload_ref = args.payload_ref;
            const data = await backendJson(identityKey, "/api/messages", { method: "POST", body });
            return JSON.stringify(data, null, 2);
          }),
      );
    }

    if (hasServiceScope(identity.scopes, "mailbox", "read")) {
      mcp.registerTool(
        "cardinal_agent_inbox",
        {
          title: "Read Agent Inbox",
          description: "List messages addressed to the caller key's agent identity.",
          inputSchema: {},
          annotations: { readOnlyHint: true },
        },
        async () =>
          withToolTelemetry(identityKey, "cardinal_agent_inbox", async () => {
            const data = await backendJson(
              identityKey,
              `/api/messages?to_agent=${encodeURIComponent(identity.agent)}`,
            );
            return JSON.stringify(data, null, 2);
          }),
      );
    }

    return mcp;
  }

  return {
    port: undefined as number | undefined,

    async fetch(req: Request): Promise<Response> {
      const { pathname } = new URL(req.url);

      if (pathname === "/health" && req.method === "GET") {
        const stats = searchEngine.stats();
        return Response.json({
          status: "ok",
          version: rootPkg.version,
          searchEngine: stats.engine,
          indexedFiles: stats.indexedFiles,
        });
      }

      if (pathname !== "/mcp") {
        return Response.json({ error: "not_found" }, { status: 404 });
      }

      if (req.method !== "POST") {
        return Response.json({ error: "method_not_allowed" }, { status: 405 });
      }

      const auth = req.headers.get("authorization");
      if (auth === null || !auth.startsWith("Bearer ")) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }

      const identityKey = auth.slice(7).trim();
      if (identityKey === "") {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }

      const identity = await validate(identityKey);
      if (identity === null) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }

      const mcp = buildCallerMcpServer(identity, identityKey);
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      try {
        await mcp.connect(transport);
        const normalizedReq = await normalizeStreamableRequest(req);
        return await transport.handleRequest(normalizedReq);
      } finally {
        await mcp.close().catch(() => {});
      }
    },

    async syncIndex(force = false) {
      await searchEngine.syncIndex(force);
    },

    close() {
      searchEngine.close();
    },

    start(port = Number(process.env.PORT ?? 8789)) {
      void searchEngine.syncIndex(true).catch(() => {});
      const server = Bun.serve({ port, fetch: this.fetch.bind(this) });
      this.port = server.port;
      console.log(`cardinal-mcp listening on :${server.port}`);
      return server;
    },
  };
}

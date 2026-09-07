#!/usr/bin/env bun
/**
 * Cardinal System — Cloud Agent CLI
 *
 * Wraps @cursor/sdk for feature work, follow-ups, streaming, and listing.
 * Requires CURSOR_API_KEY (Dashboard → Integrations → API Keys).
 *
 * Usage:
 *   bun scripts/cloud-agent.ts feature "Implement X per spec Y"
 *   bun scripts/cloud-agent.ts follow-up bc-abc "Fix bun test in packages/router"
 *   bun scripts/cloud-agent.ts watch bc-abc [run-id]
 *   bun scripts/cloud-agent.ts status bc-abc [run-id]
 *   bun scripts/cloud-agent.ts list [--pr-url URL]
 *   bun scripts/cloud-agent.ts get bc-abc
 *   bun scripts/cloud-agent.ts cancel bc-abc run-xyz
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Agent,
  CursorAgentError,
  type AgentDefinition,
  type AgentOptions,
  type CloudAgentOptions,
  type McpServerConfig,
  type Run,
  type RunResult,
  type SDKMessage,
} from "@cursor/sdk";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..");
const CONFIG_PATH = join(SCRIPT_DIR, "cloud-agent-config.json");

interface CloudAgentConfig {
  repo: { url: string; startingRef: string };
  model: { id: string; params?: Array<{ id: string; value: string }> };
  autoCreatePR: boolean;
  skipReviewerRequest: boolean;
  workOnCurrentBranch: boolean;
  mode: "agent" | "plan";
  promptPrefix: string;
  subagentRoles: string[];
  mcpServers?: Record<string, McpServerConfig>;
  metadata?: Record<string, string>;
}

interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Map<string, string | boolean>;
}

function usage(): never {
  console.error(`Cardinal Cloud Agent CLI

Commands:
  feature <prompt>       Launch a cloud agent on a new feature branch → PR to dev
  follow-up <id> <prompt>  Send a follow-up run to an existing agent
  watch <id> [runId]     Stream a run (defaults to agent's latest run)
  status <id> [runId]      Poll run until terminal; print summary
  list                     List cloud agents (--pr-url, --limit)
  get <id>                 Show agent metadata
  cancel <id> <runId>      Cancel an active run

Feature flags:
  --plan                 Start in plan mode
  --no-pr                Do not auto-create a pull request
  --ref <branch>         Starting ref (default: dev)
  --pr-url <url>         Attach to an existing PR
  --work-on-branch       Push to the PR/current branch instead of cursor/*
  --quiet                No live stream; wait and print summary only
  --name <title>         Agent display name
  --with-subagents       Inline subagents from docs/agents/roles/*.md

Global:
  --help                 Show this help

Environment:
  CURSOR_API_KEY         Required. User or service-account API key.

Examples:
  bun scripts/cloud-agent.ts feature "Implement router budget UI per docs/superpowers/specs/..."
  bun scripts/cloud-agent.ts feature "Fix CI" --pr-url https://github.com/snattydev/cardinal-system/pull/42 --work-on-branch
  bun scripts/cloud-agent.ts follow-up bc-abc123 "Run verifier: bun test && bun run build"
  bun scripts/cloud-agent.ts list --pr-url https://github.com/snattydev/cardinal-system/pull/42
`);
  process.exit(0);
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Map<string, string | boolean>();
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") usage();
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags.set(key, next);
        i++;
      } else {
        flags.set(key, true);
      }
      continue;
    }
    positional.push(arg);
  }

  const command = positional[0] ?? "";
  return { command, positional: positional.slice(1), flags };
}

function flagStr(flags: Map<string, string | boolean>, key: string): string | undefined {
  const v = flags.get(key);
  return typeof v === "string" ? v : undefined;
}

function flagBool(flags: Map<string, string | boolean>, key: string): boolean {
  return flags.get(key) === true;
}

function requireApiKey(): string {
  const key = process.env.CURSOR_API_KEY?.trim();
  if (!key) {
    console.error("CURSOR_API_KEY is not set. Create one at https://cursor.com/dashboard/integrations");
    process.exit(1);
  }
  return key;
}

function loadConfig(): CloudAgentConfig {
  const raw = readFileSync(CONFIG_PATH, "utf8");
  return JSON.parse(raw) as CloudAgentConfig;
}

function normalizeRepoUrl(remote: string): string {
  const ssh = remote.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  if (ssh) return `https://${ssh[1]}/${ssh[2]!.replace(/\.git$/, "")}`;
  return remote.replace(/\.git$/, "");
}

function resolveRepoUrl(config: CloudAgentConfig): string {
  if (config.repo.url) return config.repo.url;
  try {
    const remote = Bun.spawnSync(["git", "remote", "get-url", "origin"], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    if (remote.exitCode === 0) {
      return normalizeRepoUrl(remote.stdout.toString().trim());
    }
  } catch {
    // fall through
  }
  throw new Error("Could not resolve repo URL. Set repo.url in scripts/cloud-agent-config.json");
}

function loadSubagents(roles: string[]): Record<string, AgentDefinition> | undefined {
  if (roles.length === 0) return undefined;
  const agents: Record<string, AgentDefinition> = {};
  for (const role of roles) {
    const path = join(REPO_ROOT, "docs/agents/roles", `${role}.md`);
    const content = readFileSync(path, "utf8");
    const titleMatch = content.match(/^#\s+(.+)$/m);
    agents[role] = {
      description: titleMatch?.[1] ?? role,
      prompt: content,
      model: "inherit",
    };
  }
  return agents;
}

function buildFeaturePrompt(config: CloudAgentConfig, task: string): string {
  return `${config.promptPrefix}${task}`;
}

function buildCloudOptions(
  config: CloudAgentConfig,
  flags: Map<string, string | boolean>,
): CloudAgentOptions {
  const repoUrl = resolveRepoUrl(config);
  const prUrl = flagStr(flags, "pr-url");
  const startingRef = flagStr(flags, "ref") ?? config.repo.startingRef;

  const cloud: CloudAgentOptions = {
    repos: [
      prUrl
        ? { url: repoUrl, prUrl }
        : { url: repoUrl, startingRef },
    ],
    autoCreatePR: prUrl ? false : config.autoCreatePR && !flagBool(flags, "no-pr"),
    skipReviewerRequest: config.skipReviewerRequest,
    workOnCurrentBranch:
      flagBool(flags, "work-on-branch") || (prUrl ? true : config.workOnCurrentBranch),
    metadata: config.metadata,
  };

  return cloud;
}

function buildCreateOptions(
  config: CloudAgentConfig,
  flags: Map<string, string | boolean>,
  withSubagents: boolean,
): AgentOptions {
  const roles =
    withSubagents && config.subagentRoles.length > 0
      ? config.subagentRoles
      : withSubagents
        ? ["tester", "builder", "verifier", "reviewer", "docs", "frontend", "ws-protocol"]
        : [];

  return {
    apiKey: requireApiKey(),
    model: config.model,
    name: flagStr(flags, "name"),
    mode: flagBool(flags, "plan") ? "plan" : config.mode,
    cloud: buildCloudOptions(config, flags),
    mcpServers: config.mcpServers,
    agents: loadSubagents(roles),
  };
}

function printStreamEvent(event: SDKMessage): void {
  switch (event.type) {
    case "assistant":
      for (const block of event.message.content) {
        if (block.type === "text") process.stdout.write(block.text);
      }
      break;
    case "thinking":
      process.stderr.write(`\n[thinking] ${event.text.slice(0, 120)}${event.text.length > 120 ? "…" : ""}\n`);
      break;
    case "tool_call":
      if (event.status === "running") {
        process.stderr.write(`\n[tool] ${event.name}\n`);
      }
      break;
    case "status":
      process.stderr.write(`\n[status] ${event.status}${event.message ? `: ${event.message}` : ""}\n`);
      break;
    case "result":
      if (event.status) process.stderr.write(`\n[result] ${event.status}\n`);
      break;
    default:
      break;
  }
}

async function streamRun(run: Run, quiet: boolean): Promise<RunResult> {
  if (!quiet) {
    for await (const event of run.stream()) {
      printStreamEvent(event);
    }
  }
  return run.wait();
}

function printSummary(agentId: string, runId: string, result: RunResult): void {
  console.error("\n---");
  console.error(`agent:  ${agentId}`);
  console.error(`run:    ${runId}`);
  console.error(`status: ${result.status}`);
  if (result.durationMs !== undefined) {
    console.error(`duration: ${(result.durationMs / 1000).toFixed(1)}s`);
  }
  if (result.git?.branches?.length) {
    for (const b of result.git.branches) {
      if (b.branch) console.error(`branch: ${b.branch}`);
      if (b.prUrl) console.error(`pr:     ${b.prUrl}`);
    }
  }
  console.error(`url:    https://cursor.com/agents/${agentId}`);
  if (result.result) {
    console.error("\n--- result ---\n");
    console.log(result.result);
  }
  if (result.error) {
    console.error(`error: ${result.error.message}`);
  }
}

function handleRunOutcome(result: RunResult): void {
  if (result.status === "error") process.exit(2);
  if (result.status === "cancelled") process.exit(3);
}

async function cmdFeature(
  config: CloudAgentConfig,
  task: string,
  flags: Map<string, string | boolean>,
): Promise<void> {
  if (!task.trim()) {
    console.error("feature requires a prompt string");
    process.exit(1);
  }

  const quiet = flagBool(flags, "quiet");
  const withSubagents = flagBool(flags, "with-subagents");
  const options = buildCreateOptions(config, flags, withSubagents);
  const prompt = buildFeaturePrompt(config, task);

  let agent: Awaited<ReturnType<typeof Agent.create>> | undefined;
  try {
    agent = await Agent.create(options);
    console.error(`agent: ${agent.agentId}`);
    const run = await agent.send(prompt);
    console.error(`run:   ${run.id}`);
    const result = await streamRun(run, quiet);
    printSummary(agent.agentId, run.id, result);
    handleRunOutcome(result);
  } catch (err) {
    if (err instanceof CursorAgentError) {
      console.error(`startup failed: ${err.message} (retryable=${err.isRetryable})`);
      process.exit(1);
    }
    throw err;
  } finally {
    await agent?.[Symbol.asyncDispose]?.();
  }
}

async function cmdFollowUp(
  agentId: string,
  prompt: string,
  flags: Map<string, string | boolean>,
): Promise<void> {
  if (!prompt.trim()) {
    console.error("follow-up requires a prompt string");
    process.exit(1);
  }

  const quiet = flagBool(flags, "quiet");
  const apiKey = requireApiKey();

  let agent: Awaited<ReturnType<typeof Agent.resume>> | undefined;
  try {
    agent = await Agent.resume(agentId, { apiKey });
    const run = await agent.send(prompt);
    console.error(`run: ${run.id}`);
    const result = await streamRun(run, quiet);
    printSummary(agentId, run.id, result);
    handleRunOutcome(result);
  } catch (err) {
    if (err instanceof CursorAgentError) {
      console.error(`follow-up failed: ${err.message} (retryable=${err.isRetryable})`);
      process.exit(1);
    }
    throw err;
  } finally {
    await agent?.[Symbol.asyncDispose]?.();
  }
}

async function resolveRunId(
  agentId: string,
  runId: string | undefined,
  apiKey: string,
): Promise<string> {
  if (runId) return runId;
  const runs = await Agent.listRuns(agentId, { runtime: "cloud", apiKey, limit: 1 });
  const first = runs.items[0];
  if (first) return first.id;
  throw new Error(`No runs found for agent ${agentId}`);
}

async function cmdWatch(
  agentId: string,
  runId: string | undefined,
  flags: Map<string, string | boolean>,
): Promise<void> {
  const apiKey = requireApiKey();
  const resolvedRunId = await resolveRunId(agentId, runId, apiKey);
  const run = await Agent.getRun(resolvedRunId, {
    runtime: "cloud",
    agentId,
    apiKey,
  });
  const quiet = flagBool(flags, "quiet");
  const result = await streamRun(run, quiet);
  printSummary(agentId, resolvedRunId, result);
  handleRunOutcome(result);
}

async function cmdStatus(
  agentId: string,
  runId: string | undefined,
): Promise<void> {
  const apiKey = requireApiKey();
  const resolvedRunId = await resolveRunId(agentId, runId, apiKey);
  const run = await Agent.getRun(resolvedRunId, {
    runtime: "cloud",
    agentId,
    apiKey,
  });

  if (run.status === "running") {
    const result = await run.wait();
    printSummary(agentId, resolvedRunId, result);
    handleRunOutcome(result);
    return;
  }

  printSummary(agentId, resolvedRunId, {
    status: run.status,
    result: run.result,
    error: run.error,
    durationMs: run.durationMs,
    git: run.git,
    id: run.id,
    agentId: run.agentId,
  } as RunResult);
  handleRunOutcome({ status: run.status } as RunResult);
}

async function cmdList(flags: Map<string, string | boolean>): Promise<void> {
  const apiKey = requireApiKey();
  const limit = Number(flagStr(flags, "limit") ?? "20");
  const prUrl = flagStr(flags, "pr-url");

  const page = await Agent.list({
    runtime: "cloud",
    apiKey,
    limit: Number.isFinite(limit) ? limit : 20,
    prUrl,
  });

  for (const item of page.items) {
    const cloud = item as { agentId: string; name?: string; status?: string; runtime: "cloud" };
    console.log(
      [
        cloud.agentId,
        cloud.status ?? "-",
        cloud.name ?? "(unnamed)",
      ].join("\t"),
    );
  }
  if (page.nextCursor) {
    console.error(`\n(next page: --cursor ${page.nextCursor})`);
  }
}

async function cmdGet(agentId: string): Promise<void> {
  const apiKey = requireApiKey();
  const info = await Agent.get(agentId, { apiKey });
  console.log(JSON.stringify(info, null, 2));
}

async function cmdCancel(agentId: string, runId: string): Promise<void> {
  const apiKey = requireApiKey();
  const run = await Agent.getRun(runId, { runtime: "cloud", agentId, apiKey });
  if (!run.supports("cancel")) {
    console.error(`cancel not supported: ${run.unsupportedReason("cancel")}`);
    process.exit(1);
  }
  await run.cancel();
  console.error(`cancelled ${runId}`);
}

async function main(): Promise<void> {
  const { command, positional, flags } = parseArgs(process.argv.slice(2));
  if (!command) usage();

  const config = loadConfig();

  switch (command) {
    case "feature":
      await cmdFeature(config, positional.join(" "), flags);
      break;
    case "follow-up":
      await cmdFollowUp(positional[0]!, positional.slice(1).join(" "), flags);
      break;
    case "watch":
      await cmdWatch(positional[0]!, positional[1], flags);
      break;
    case "status":
      await cmdStatus(positional[0]!, positional[1]);
      break;
    case "list":
      await cmdList(flags);
      break;
    case "get":
      await cmdGet(positional[0]!);
      break;
    case "cancel":
      await cmdCancel(positional[0]!, positional[1]!);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      usage();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

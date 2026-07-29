import { createDb, createAgentKey, listKeys, registerAgent, revokeKeysForAgent } from "@cardinal/db";
import type { AgentKind } from "@cardinal/core";
import { generateKey, hashKey } from "./index";

function usage(): never {
  console.error(`Usage:
  bun run keygen -- --agent <name> [--kind agent|subagent]   create key, print it once
  bun run keygen -- --revoke <name>                          revoke all active keys of agent
  bun run keygen -- --list                                   list keys`);
  process.exit(1);
}

function main(): void {
  const args = process.argv.slice(2);
  const db = createDb(process.env.DB_PATH ?? "./cardinal.db");
  try {
    const cmd = args[0];
    if (cmd === "--agent") {
      const agent = args[1];
      if (!agent || agent.startsWith("--")) usage();
      let kind: AgentKind | undefined;
      const kindIdx = args.indexOf("--kind");
      if (kindIdx !== -1) {
        const value = args[kindIdx + 1];
        if (value !== "agent" && value !== "subagent") usage();
        kind = value;
      }
      registerAgent(db, agent, kind ?? "agent");
      const key = generateKey();
      createAgentKey(db, {
        keyHash: hashKey(key),
        agentName: agent,
        kindOverride: kind,
      });
      console.log(key);
    } else if (cmd === "--revoke") {
      const agent = args[1];
      if (!agent || agent.startsWith("--")) usage();
      revokeKeysForAgent(db, agent);
    } else if (cmd === "--list") {
      for (const k of listKeys(db)) {
        const state = k.revoked_at ? "[revoked]" : "[active] ";
        console.log(`${state} ${k.agent_name} ${k.created_by} ${k.created_at} ${k.last_used_at ?? "-"}`);
      }
    } else {
      usage();
    }
  } finally {
    db.close();
  }
}

main();

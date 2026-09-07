# Cloud Agent API — development workflow

Automation **outside the Cardinal product** to launch Cursor cloud agents against this repo. Uses `@cursor/sdk` via `scripts/cloud-agent.ts`.

It is **not** part of the Cardinal backend (v2: the brain does not spawn hands).

## Requirements

1. **API key:** [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations)
2. **Local env:**

   ```bash
   export CURSOR_API_KEY="cursor_..."
   ```

3. **Cloud env:** `.cursor/environment.json` + `install.sh` + `start.sh` (see
   [`docs/features/2026-08-24-cloud-agent-environment.md`](../features/2026-08-24-cloud-agent-environment.md))

## Config

Defaults in [`scripts/cloud-agent-config.json`](../../scripts/cloud-agent-config.json):

| Field | Default | Use |
|-------|---------|-----|
| `repo.url` | Repo GitHub URL | Clone in the VM |
| `repo.startingRef` | `dev` | Base branch for features |
| `autoCreatePR` | `true` | Open a PR when done |
| `skipReviewerRequest` | `true` | Do not request a CI reviewer |
| `model.id` | `composer-2.5` | Agent model |
| `promptPrefix` | AGENTS.md checklist | Prefix on every `feature` |

Subagents in `.cursor/agents/` load from the cloned repo. For inline overrides, use `--with-subagents` (reads `docs/agents/roles/*.md`).

## Commands

```bash
# New feature → cursor/* branch → PR to dev
bun scripts/cloud-agent.ts feature "Implement X per docs/superpowers/specs/foo.md"

# Explore before coding
bun scripts/cloud-agent.ts feature "Design auth refactor" --plan

# Fix on an existing PR
bun scripts/cloud-agent.ts feature "Fix CI failures" \
  --pr-url https://github.com/snattydev/cardinal-system/pull/42 \
  --work-on-branch

# Follow-up (verifier, docs, etc.)
bun scripts/cloud-agent.ts follow-up bc-abc123 \
  "Run bun test and bun run build; fix any failures"

# Stream / poll
bun scripts/cloud-agent.ts watch bc-abc123
bun scripts/cloud-agent.ts status bc-abc123

# List by PR
bun scripts/cloud-agent.ts list --pr-url https://github.com/.../pull/42

# Metadata
bun scripts/cloud-agent.ts get bc-abc123

# Cancel an active run
bun scripts/cloud-agent.ts cancel bc-abc123 run-xyz
```

npm alias: `bun run cloud-agent -- feature "..."`.

## Mapping to the AGENTS.md swarm

| Local phase | Cloud equivalent |
|-------------|------------------|
| Composer parent | One cloud agent per feature |
| tester → builder → verifier | Sequential follow-ups or subagent delegation |
| Herdr orchestrator (spoof) | Background tab → `herdr agent start --kind cursor` → accept cloud (`&` / Build in cloud); close used panes if ≥1 remain |
| Herdr Background parallelism | N × Cursor-in-Herdr (or N × `feature`) in parallel; do not leave junk panes |
| PR to `dev` | `autoCreatePR` + `startingRef: dev` |
| Security review | Mention in the prompt if auth/keys/ws changed |

## Cardinal MCP (optional)

Add to `cloud-agent-config.json`:

```json
"mcpServers": {
  "cardinal": {
    "type": "http",
    "url": "https://your-cardinal.example/mcp",
    "headers": { "Authorization": "Bearer sk-cardinal-..." }
  }
}
```

Secrets: never commit. For ephemeral tokens, use `envVars` on the API (session-scoped).

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Run `finished` |
| 1 | Startup error (`CursorAgentError`) |
| 2 | Run ended in `error` |
| 3 | Run `cancelled` |

## References

- [Cloud Agents API endpoints](https://cursor.com/docs/cloud-agent/api/endpoints)
- [TypeScript SDK](https://cursor.com/docs/sdk/typescript)
- VM environment: [`docs/features/2026-08-24-cloud-agent-environment.md`](../features/2026-08-24-cloud-agent-environment.md)

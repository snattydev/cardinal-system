import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildRepoStandardsBlueprint } from "../packages/mcp/src/repo-standards";

// Cardinal runs the `full`-tier hooks from the shared blueprint.
// Run `bun run standards:sync` after editing packages/mcp/src/repo-standards.ts.
export const DOGFOOD_OPTIONS = { scope: "full", defaultBranch: "dev" } as const;
export const DOGFOOD_PATHS = [
  ".githooks/pre-commit",
  ".githooks/commit-msg",
  "scripts/install-hooks.sh",
] as const;

if (import.meta.main) {
  const root = resolve(import.meta.dir, "..");
  const blueprint = buildRepoStandardsBlueprint(DOGFOOD_OPTIONS);
  for (const rel of DOGFOOD_PATHS) {
    const file = blueprint.files.find((f) => f.path === rel);
    if (!file) throw new Error(`blueprint is missing ${rel}`);
    const target = resolve(root, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.content);
    if (file.executable) chmodSync(target, 0o755);
    console.log(`synced ${rel}`);
  }
}

import { runWorker } from "./runner";
import type { WorkerInput } from "./types";

async function defaultTaskHandler(input: WorkerInput) {
  // Base task handler for maintenance, summary, and hygiene
  const timestamp = new Date().toISOString();
  switch (input.taskType) {
    case "hygiene":
      return {
        summary: `Hygiene task ${input.taskId} processed at ${timestamp}: ${input.prompt}`,
      };
    case "summary":
      return {
        summary: `Summary task ${input.taskId} processed at ${timestamp}: ${input.prompt}`,
      };
    case "maintenance":
    default:
      return {
        summary: `Maintenance task ${input.taskId} executed at ${timestamp}: ${input.prompt}`,
      };
  }
}

async function main() {
  const rawInput = await Bun.stdin.text();
  const output = await runWorker(rawInput, defaultTaskHandler);
  process.stdout.write(output + "\n");
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Worker crash: ${msg}\n`);
  process.exit(1);
});

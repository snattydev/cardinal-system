import { runWorker } from "./runner";
import { routerProbeConfigFromEnv } from "./router-probe";
import { createDefaultTaskHandler } from "./tasks";

async function main() {
  const rawInput = await Bun.stdin.text();
  const output = await runWorker(rawInput, createDefaultTaskHandler(routerProbeConfigFromEnv()));
  process.stdout.write(output + "\n");
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Worker crash: ${msg}\n`);
  process.exit(1);
});

import type { TaskHandler } from "./runner";
import { probeRouterModels, type RouterProbeConfig } from "./router-probe";
import type { WorkerInput } from "./types";

function summaryFor(input: WorkerInput, modelCount: number): string {
  const timestamp = new Date().toISOString();
  const models = `router models=${modelCount}`;
  switch (input.taskType) {
    case "hygiene":
      return `Hygiene task ${input.taskId} processed at ${timestamp}: ${input.prompt} (${models})`;
    case "summary":
      return `Summary task ${input.taskId} processed at ${timestamp}: ${input.prompt} (${models})`;
    case "maintenance":
    default:
      return `Maintenance task ${input.taskId} executed at ${timestamp}: ${input.prompt} (${models})`;
  }
}

export function createDefaultTaskHandler(config: RouterProbeConfig): TaskHandler {
  return async (input) => {
    const probe = await probeRouterModels(config);
    return { summary: summaryFor(input, probe.modelCount) };
  };
}

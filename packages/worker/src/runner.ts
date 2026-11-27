import {
  parseWorkerInput,
  type WorkerInput,
  type WorkerOutput,
} from "./types";

export type TaskHandler = (input: WorkerInput) => Promise<{
  summary: string;
  memoryWrites?: WorkerOutput["memoryWrites"];
  escalation?: string;
}>;

export async function executeWorkerTask(
  input: WorkerInput,
  handler: TaskHandler,
): Promise<WorkerOutput> {
  try {
    const res = await handler(input);
    return {
      taskId: input.taskId,
      status: "success",
      summary: res.summary,
      memoryWrites: res.memoryWrites,
      escalation: res.escalation,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      taskId: input.taskId,
      status: "failure",
      summary: `Task failed: ${msg}`,
      escalation: "worker_task_exception",
    };
  }
}

export async function runWorker(
  rawInput: string,
  handler: TaskHandler,
): Promise<string> {
  let taskId = "unknown";
  try {
    const json = JSON.parse(rawInput);
    if (json && typeof json === "object" && typeof json.taskId === "string") {
      taskId = json.taskId;
    }
    const input = parseWorkerInput(json);
    const output = await executeWorkerTask(input, handler);
    return JSON.stringify(output);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const failureOutput: WorkerOutput = {
      taskId,
      status: "failure",
      summary: `Worker protocol error: ${msg}`,
      escalation: "worker_protocol_error",
    };
    return JSON.stringify(failureOutput);
  }
}

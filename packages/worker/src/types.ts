export type TaskType = "maintenance" | "summary" | "hygiene";

export interface WorkerInput {
  taskId: string;
  taskType: TaskType;
  prompt: string;
  memoryScopes?: string[];
  timeoutSeconds?: number;
  callbackUrl?: string;
}

export type WorkerStatus = "success" | "failure";

export interface MemoryWrite {
  path: string;
  content: string;
  action: "write" | "append";
}

export interface WorkerOutput {
  taskId: string;
  status: WorkerStatus;
  summary: string;
  memoryWrites?: MemoryWrite[];
  escalation?: string;
}

export class WorkerProtocolError extends Error {
  constructor(message: string) {
    super(`WorkerProtocolError: ${message}`);
    this.name = "WorkerProtocolError";
  }
}

export function parseWorkerInput(raw: unknown): WorkerInput {
  if (!raw || typeof raw !== "object") {
    throw new WorkerProtocolError("Input must be a valid JSON object");
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.taskId !== "string" || obj.taskId.trim().length === 0) {
    throw new WorkerProtocolError("Missing or invalid taskId");
  }

  if (
    obj.taskType !== "maintenance" &&
    obj.taskType !== "summary" &&
    obj.taskType !== "hygiene"
  ) {
    throw new WorkerProtocolError(
      `Invalid taskType: must be maintenance | summary | hygiene, got ${String(obj.taskType)}`,
    );
  }

  if (typeof obj.prompt !== "string" || obj.prompt.trim().length === 0) {
    throw new WorkerProtocolError("Missing or empty prompt");
  }

  const input: WorkerInput = {
    taskId: obj.taskId.trim(),
    taskType: obj.taskType,
    prompt: obj.prompt.trim(),
  };

  if (Array.isArray(obj.memoryScopes)) {
    input.memoryScopes = obj.memoryScopes.filter(
      (s): s is string => typeof s === "string",
    );
  }

  if (typeof obj.timeoutSeconds === "number" && obj.timeoutSeconds > 0) {
    input.timeoutSeconds = obj.timeoutSeconds;
  }

  if (typeof obj.callbackUrl === "string") {
    input.callbackUrl = obj.callbackUrl;
  }

  return input;
}

export function parseWorkerOutput(raw: unknown): WorkerOutput {
  if (!raw || typeof raw !== "object") {
    throw new WorkerProtocolError("Output must be a valid JSON object");
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.taskId !== "string") {
    throw new WorkerProtocolError("Missing taskId in output");
  }

  if (obj.status !== "success" && obj.status !== "failure") {
    throw new WorkerProtocolError(
      `Invalid status in output: must be success | failure, got ${String(obj.status)}`,
    );
  }

  if (typeof obj.summary !== "string") {
    throw new WorkerProtocolError("Missing summary in output");
  }

  const output: WorkerOutput = {
    taskId: obj.taskId,
    status: obj.status,
    summary: obj.summary,
  };

  if (Array.isArray(obj.memoryWrites)) {
    output.memoryWrites = obj.memoryWrites.map((item) => {
      const mw = item as Record<string, unknown>;
      if (typeof mw.path !== "string" || typeof mw.content !== "string") {
        throw new WorkerProtocolError("Invalid memoryWrite entry");
      }
      const action = mw.action === "append" ? "append" : "write";
      return { path: mw.path, content: mw.content, action };
    });
  }

  if (typeof obj.escalation === "string" && obj.escalation.length > 0) {
    output.escalation = obj.escalation;
  }

  return output;
}

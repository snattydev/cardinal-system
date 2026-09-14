import {
  parseWorkerOutput,
  type TaskType,
  type WorkerInput,
  type WorkerOutput,
} from "@cardinal/worker";
import type { EphemeralKeyProvider, WorkerDriver } from "./types";

export interface OrchestratorOptions {
  driver: WorkerDriver;
  keyProvider: EphemeralKeyProvider;
  backendUrl: string;
  defaultTimeoutSeconds?: number;
}

export class WorkerOrchestrator {
  private driver: WorkerDriver;
  private keyProvider: EphemeralKeyProvider;
  private backendUrl: string;
  private defaultTimeoutSeconds: number;

  constructor(options: OrchestratorOptions) {
    this.driver = options.driver;
    this.keyProvider = options.keyProvider;
    this.backendUrl = options.backendUrl;
    this.defaultTimeoutSeconds = options.defaultTimeoutSeconds ?? 300;
  }

  async dispatch(task: {
    taskId: string;
    taskType: TaskType;
    prompt: string;
    timeoutSeconds?: number;
    memoryScopes?: string[];
  }): Promise<WorkerOutput> {
    const timeoutSeconds = task.timeoutSeconds ?? this.defaultTimeoutSeconds;
    const scopes = ["task:worker", "router:completions", ...(task.memoryScopes ?? [])];

    let ephemeralKey = "";
    try {
      ephemeralKey = await this.keyProvider.createEphemeralKey(task.taskId, scopes);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        taskId: task.taskId,
        status: "failure",
        summary: `Failed to provision ephemeral key: ${msg}`,
        escalation: "key_provisioning_error",
      };
    }

    try {
      const execResult = await this.driver.spawn({
        taskId: task.taskId,
        taskType: task.taskType,
        prompt: task.prompt,
        ephemeralKey,
        backendUrl: this.backendUrl,
        timeoutSeconds,
        memoryScopes: task.memoryScopes,
      });

      if (execResult.timedOut) {
        return {
          taskId: task.taskId,
          status: "failure",
          summary: `Worker container timed out after ${timeoutSeconds}s`,
          escalation: "worker_timeout_exceeded",
        };
      }

      if (execResult.exitCode !== 0) {
        const errorDetail = execResult.stderr.trim() || execResult.stdout.trim() || "unknown exit error";
        return {
          taskId: task.taskId,
          status: "failure",
          summary: `Worker container exited with code ${execResult.exitCode}: ${errorDetail}`,
          escalation: "worker_container_exit_nonzero",
        };
      }

      try {
        const parsed = JSON.parse(execResult.stdout.trim());
        return parseWorkerOutput(parsed);
      } catch (parseErr) {
        const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        return {
          taskId: task.taskId,
          status: "failure",
          summary: `Failed to parse worker stdout JSON (${msg}): ${execResult.stdout.slice(0, 200)}`,
          escalation: "worker_output_malformed",
        };
      }
    } finally {
      if (ephemeralKey) {
        await this.keyProvider.revokeEphemeralKey(ephemeralKey).catch(() => {});
      }
    }
  }
}

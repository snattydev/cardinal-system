import type {
  SpawnWorkerOptions,
  WorkerDriver,
  WorkerExecutionResult,
} from "./types";

export interface MockDriverBehavior {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  timedOut?: boolean;
  delayMs?: number;
}

export class MockWorkerDriver implements WorkerDriver {
  private behavior: MockDriverBehavior;
  public spawnHistory: SpawnWorkerOptions[] = [];

  constructor(behavior: MockDriverBehavior = {}) {
    this.behavior = behavior;
  }

  setBehavior(behavior: MockDriverBehavior): void {
    this.behavior = behavior;
  }

  async spawn(options: SpawnWorkerOptions): Promise<WorkerExecutionResult> {
    this.spawnHistory.push(options);

    if (this.behavior.delayMs && this.behavior.delayMs > 0) {
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, this.behavior.delayMs);
      await promise;
    }

    if (this.behavior.timedOut) {
      return {
        exitCode: 124,
        stdout: "",
        stderr: "process timed out",
        timedOut: true,
      };
    }

    const defaultStdout = JSON.stringify({
      taskId: options.taskId,
      status: "success",
      summary: `Mock executed ${options.taskType}: ${options.prompt}`,
    });

    return {
      exitCode: this.behavior.exitCode ?? 0,
      stdout: this.behavior.stdout ?? defaultStdout,
      stderr: this.behavior.stderr ?? "",
      timedOut: false,
    };
  }
}

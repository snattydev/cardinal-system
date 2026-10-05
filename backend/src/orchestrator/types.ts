export interface SpawnWorkerOptions {
  taskId: string;
  taskType: "maintenance" | "summary" | "hygiene";
  prompt: string;
  ephemeralKey: string;
  backendUrl: string;
  timeoutSeconds?: number;
  memoryScopes?: string[];
}

export interface WorkerExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface WorkerDriver {
  spawn(options: SpawnWorkerOptions): Promise<WorkerExecutionResult>;
}

export interface EphemeralKeyProvider {
  createEphemeralKey(taskId: string, scopes: string[], ttlSeconds?: number): Promise<string>;
  revokeEphemeralKey(key: string): Promise<void>;
}

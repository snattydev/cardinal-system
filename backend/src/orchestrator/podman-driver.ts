import type {
  SpawnWorkerOptions,
  WorkerDriver,
  WorkerExecutionResult,
} from "./types";

export interface PodmanDriverOptions {
  imageName?: string;
  network?: string;
  memoryLimit?: string;
  cpuLimit?: string;
}

export function buildPodmanRunArgs(
  options: SpawnWorkerOptions,
  limits: Required<Pick<PodmanDriverOptions, "imageName" | "network" | "memoryLimit" | "cpuLimit">>,
  containerName: string,
): string[] {
  return [
    "podman",
    "run",
    "--name",
    containerName,
    "--replace",
    "--rm",
    "-i",
    "--cap-drop=ALL",
    `--network=${limits.network}`,
    `--memory=${limits.memoryLimit}`,
    `--cpus=${limits.cpuLimit}`,
    "-e",
    `CARDINAL_URL=${options.backendUrl}`,
    "-e",
    `CARDINAL_KEY=${options.ephemeralKey}`,
    "-e",
    `TASK_ID=${options.taskId}`,
    limits.imageName,
  ];
}

export class PodmanWorkerDriver implements WorkerDriver {
  private imageName: string;
  private network: string;
  private memoryLimit: string;
  private cpuLimit: string;

  constructor(options: PodmanDriverOptions = {}) {
    this.imageName = options.imageName ?? "localhost/cardinal-worker:latest";
    this.network = options.network ?? "cardinal-net";
    this.memoryLimit = options.memoryLimit ?? "256m";
    this.cpuLimit = options.cpuLimit ?? "0.5";
  }

  async spawn(options: SpawnWorkerOptions): Promise<WorkerExecutionResult> {
    const safeTaskId = options.taskId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const containerName = `cardinal-worker-${safeTaskId}-${Date.now()}`;
    const timeoutSeconds = options.timeoutSeconds ?? 300;

    const inputJson = JSON.stringify({
      taskId: options.taskId,
      taskType: options.taskType,
      prompt: options.prompt,
      memoryScopes: options.memoryScopes,
      timeoutSeconds,
    });

    const cmd = buildPodmanRunArgs(
      options,
      {
        imageName: this.imageName,
        network: this.network,
        memoryLimit: this.memoryLimit,
        cpuLimit: this.cpuLimit,
      },
      containerName,
    );

    const proc = Bun.spawn(cmd, {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    // Write input JSON to worker stdin and close
    proc.stdin.write(inputJson);
    proc.stdin.flush();
    proc.stdin.end();

    const { promise: timeoutPromise, resolve: resolveTimeout } =
      Promise.withResolvers<boolean>();

    const timer = setTimeout(() => {
      resolveTimeout(true);
    }, timeoutSeconds * 1000);

    const { promise: exitPromise, resolve: resolveExit } =
      Promise.withResolvers<number>();

    proc.exited.then((code) => {
      clearTimeout(timer);
      resolveExit(code);
    });

    const raceWinner = await Promise.race([
      exitPromise.then((code) => ({ timedOut: false, code })),
      timeoutPromise.then(() => ({ timedOut: true, code: 124 })),
    ]);

    if (raceWinner.timedOut) {
      try {
        proc.kill(9);
      } catch {}
      // Ensure container is stopped and removed via podman rm -f
      Bun.spawn(["podman", "rm", "-f", containerName], {
        stdout: "ignore",
        stderr: "ignore",
      });

      return {
        exitCode: 124,
        stdout: "",
        stderr: `Worker execution timed out after ${timeoutSeconds}s`,
        timedOut: true,
      };
    }

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    return {
      exitCode: raceWinner.code,
      stdout,
      stderr,
      timedOut: false,
    };
  }
}

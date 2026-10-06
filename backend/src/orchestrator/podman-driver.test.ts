import { describe, expect, test } from "bun:test";
import { buildPodmanRunArgs, workerContainerName } from "./podman-driver";

describe("buildPodmanRunArgs", () => {
  test("binds the worker to the internal network and publishes no host ports", () => {
    const args = buildPodmanRunArgs(
      {
        taskId: "task-1",
        taskType: "hygiene",
        prompt: "prune",
        ephemeralKey: "test-key",
        backendUrl: "http://backend:8787",
        timeoutSeconds: 30,
      },
      {
        imageName: "localhost/cardinal-worker:latest",
        network: "cardinal-net",
        memoryLimit: "256m",
        cpuLimit: "0.5",
      },
      "cardinal-worker-task-1",
    );

    expect(args[0]).toBe("podman");
    expect(args).toContain("--rm");
    expect(args).toContain("--cap-drop=ALL");
    expect(args).toContain("--network=cardinal-net");
    expect(args.some((arg) => arg === "-p" || arg.startsWith("--publish"))).toBe(false);
    expect(args.some((arg) => arg === "-v" || arg.startsWith("--volume"))).toBe(false);
    expect(args).toContain("CARDINAL_URL=http://backend:8787");
    expect(args).toContain("CARDINAL_KEY=test-key");
    expect(args.at(-1)).toBe("localhost/cardinal-worker:latest");
  });

  test("strips container-name metacharacters from the task id", () => {
    expect(workerContainerName("task-1", 5)).toBe("cardinal-worker-task-1-5");
    const hostile = workerContainerName("task/../$(rm)", 1000);
    expect(hostile).toBe("cardinal-worker-task______rm_-1000");
    expect(hostile).toMatch(/^cardinal-worker-[A-Za-z0-9_-]+-1000$/);
  });
});

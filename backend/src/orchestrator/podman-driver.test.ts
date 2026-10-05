import { describe, expect, test } from "bun:test";
import { buildPodmanRunArgs } from "./podman-driver";

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
});

import { describe, expect, test } from "bun:test";
import { buildPodmanRunArgs } from "./podman-driver";

describe("buildPodmanRunArgs credential argv", () => {
  test("keeps the key and backend URL inside single env arguments", () => {
    const ephemeralKey = "sk live --network=host; rm -rf /";
    const backendUrl = "http://backend:8787/$(id)";
    const args = buildPodmanRunArgs(
      {
        taskId: "task-1",
        taskType: "hygiene",
        prompt: "prune",
        ephemeralKey,
        backendUrl,
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

    expect(args).toContain(`CARDINAL_KEY=${ephemeralKey}`);
    expect(args).toContain(`CARDINAL_URL=${backendUrl}`);
    expect(args.filter((arg) => arg === "--network=host")).toEqual([]);
    expect(args).toContain("--network=cardinal-net");
    expect(args.filter((arg) => arg.startsWith("CARDINAL_KEY="))).toHaveLength(1);
    expect(args.filter((arg) => arg.startsWith("CARDINAL_URL="))).toHaveLength(1);
  });
});

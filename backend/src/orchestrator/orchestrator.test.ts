import { describe, expect, test } from "bun:test";
import { WorkerOrchestrator } from "./orchestrator";
import { MockWorkerDriver } from "./mock-driver";
import type { EphemeralKeyProvider } from "./types";

class TestKeyProvider implements EphemeralKeyProvider {
  public createdKeys: { taskId: string; scopes: string[]; key: string; ttlSeconds?: number }[] = [];
  public revokedKeys: string[] = [];
  public shouldFailCreate = false;
  public failRevoke = false;

  async createEphemeralKey(taskId: string, scopes: string[], ttlSeconds?: number): Promise<string> {
    if (this.shouldFailCreate) {
      throw new Error("key provider unavailable");
    }
    const key = `sk-cardinal-ephemeral-${taskId}`;
    this.createdKeys.push({ taskId, scopes, key, ttlSeconds });
    return key;
  }

  async revokeEphemeralKey(key: string): Promise<void> {
    this.revokedKeys.push(key);
    if (this.failRevoke) {
      throw new Error("revoke store down");
    }
  }
}

describe("WorkerOrchestrator", () => {
  test("successfully dispatches task and revokes ephemeral key", async () => {
    const keyProvider = new TestKeyProvider();
    const driver = new MockWorkerDriver({
      stdout: JSON.stringify({
        taskId: "task-001",
        status: "success",
        summary: "Hygiene finished successfully",
      }),
    });

    const orchestrator = new WorkerOrchestrator({
      driver,
      keyProvider,
      backendUrl: "http://127.0.0.1:8787",
    });

    const result = await orchestrator.dispatch({
      taskId: "task-001",
      taskType: "hygiene",
      prompt: "Prune stale session logs",
      memoryScopes: ["cardinal-system/logs/*"],
    });

    expect(result.status).toBe("success");
    expect(result.summary).toBe("Hygiene finished successfully");
    expect(keyProvider.createdKeys).toHaveLength(1);
    expect(keyProvider.createdKeys[0].scopes).toContain("task:worker");
    expect(keyProvider.createdKeys[0].scopes).toContain("cardinal-system/logs/*");
    expect(keyProvider.revokedKeys).toContain("sk-cardinal-ephemeral-task-001");
  });

  test("handles driver timeout and marks failure with escalation", async () => {
    const keyProvider = new TestKeyProvider();
    const driver = new MockWorkerDriver({ timedOut: true });

    const orchestrator = new WorkerOrchestrator({
      driver,
      keyProvider,
      backendUrl: "http://127.0.0.1:8787",
    });

    const result = await orchestrator.dispatch({
      taskId: "task-002",
      taskType: "maintenance",
      prompt: "Heavy vacuum job",
      timeoutSeconds: 10,
    });

    expect(result.status).toBe("failure");
    expect(result.escalation).toBe("worker_timeout_exceeded");
    expect(result.summary).toContain("timed out after 10s");
    expect(keyProvider.revokedKeys).toContain("sk-cardinal-ephemeral-task-002");
  });

  test("handles container nonzero exit and captures error detail", async () => {
    const keyProvider = new TestKeyProvider();
    const driver = new MockWorkerDriver({
      exitCode: 137,
      stderr: "OOM killed",
    });

    const orchestrator = new WorkerOrchestrator({
      driver,
      keyProvider,
      backendUrl: "http://127.0.0.1:8787",
    });

    const result = await orchestrator.dispatch({
      taskId: "task-003",
      taskType: "summary",
      prompt: "Summarize events",
    });

    expect(result.status).toBe("failure");
    expect(result.escalation).toBe("worker_container_exit_nonzero");
    expect(result.summary).toContain("137");
    expect(result.summary).toContain("OOM killed");
    expect(keyProvider.revokedKeys).toContain("sk-cardinal-ephemeral-task-003");
  });

  test("handles malformed stdout JSON", async () => {
    const keyProvider = new TestKeyProvider();
    const driver = new MockWorkerDriver({
      stdout: "<html>502 Bad Gateway</html>",
    });

    const orchestrator = new WorkerOrchestrator({
      driver,
      keyProvider,
      backendUrl: "http://127.0.0.1:8787",
    });

    const result = await orchestrator.dispatch({
      taskId: "task-004",
      taskType: "hygiene",
      prompt: "Clean logs",
    });

    expect(result.status).toBe("failure");
    expect(result.escalation).toBe("worker_output_malformed");
    expect(keyProvider.revokedKeys).toContain("sk-cardinal-ephemeral-task-004");
  });

  test("handles key provisioning failure gracefully", async () => {
    const keyProvider = new TestKeyProvider();
    keyProvider.shouldFailCreate = true;
    const driver = new MockWorkerDriver();

    const orchestrator = new WorkerOrchestrator({
      driver,
      keyProvider,
      backendUrl: "http://127.0.0.1:8787",
    });

    const result = await orchestrator.dispatch({
      taskId: "task-005",
      taskType: "maintenance",
      prompt: "Clean logs",
    });

    expect(result.status).toBe("failure");
    expect(result.escalation).toBe("key_provisioning_error");
    expect(driver.spawnHistory).toHaveLength(0);
    expect(keyProvider.revokedKeys).toHaveLength(0);
  });

  test("passes the ephemeral key, backend URL, and timeout to the driver", async () => {
    const keyProvider = new TestKeyProvider();
    const driver = new MockWorkerDriver();
    const orchestrator = new WorkerOrchestrator({
      driver,
      keyProvider,
      backendUrl: "http://backend:8787",
    });

    await orchestrator.dispatch({
      taskId: "task-006",
      taskType: "maintenance",
      prompt: "probe router",
      timeoutSeconds: 45,
      memoryScopes: ["knowledge/notes/*"],
    });

    expect(driver.spawnHistory).toHaveLength(1);
    const spawn = driver.spawnHistory[0];
    expect(spawn?.ephemeralKey).toBe("sk-cardinal-ephemeral-task-006");
    expect(spawn?.backendUrl).toBe("http://backend:8787");
    expect(spawn?.timeoutSeconds).toBe(45);
    expect(spawn?.memoryScopes).toEqual(["knowledge/notes/*"]);
    expect(keyProvider.createdKeys[0]?.ttlSeconds).toBe(45);
    expect(keyProvider.createdKeys[0]?.scopes).toEqual([
      "task:worker",
      "router:completions",
      "knowledge/notes/*",
    ]);
  });

  test("defaults the key TTL and driver timeout to 300s", async () => {
    const keyProvider = new TestKeyProvider();
    const driver = new MockWorkerDriver();
    const orchestrator = new WorkerOrchestrator({
      driver,
      keyProvider,
      backendUrl: "http://backend:8787",
    });

    await orchestrator.dispatch({
      taskId: "task-007",
      taskType: "hygiene",
      prompt: "prune",
    });

    expect(driver.spawnHistory[0]?.timeoutSeconds).toBe(300);
    expect(keyProvider.createdKeys[0]?.ttlSeconds).toBe(300);
    expect(keyProvider.createdKeys[0]?.scopes).toEqual(["task:worker", "router:completions"]);
  });

  test("uses stdout when a nonzero exit has no stderr", async () => {
    const keyProvider = new TestKeyProvider();
    const driver = new MockWorkerDriver({
      exitCode: 1,
      stderr: "  ",
      stdout: "worker crashed",
    });
    const orchestrator = new WorkerOrchestrator({
      driver,
      keyProvider,
      backendUrl: "http://127.0.0.1:8787",
    });

    const result = await orchestrator.dispatch({
      taskId: "task-008",
      taskType: "summary",
      prompt: "summarize",
    });

    expect(result.escalation).toBe("worker_container_exit_nonzero");
    expect(result.summary).toContain("worker crashed");
    expect(result.summary).not.toContain("unknown exit error");
  });

  test("reports an unknown exit error when stdout and stderr are blank", async () => {
    const keyProvider = new TestKeyProvider();
    const driver = new MockWorkerDriver({ exitCode: 2, stderr: "", stdout: "  " });
    const orchestrator = new WorkerOrchestrator({
      driver,
      keyProvider,
      backendUrl: "http://127.0.0.1:8787",
    });

    const result = await orchestrator.dispatch({
      taskId: "task-009",
      taskType: "summary",
      prompt: "summarize",
    });

    expect(result.summary).toContain("unknown exit error");
    expect(keyProvider.revokedKeys).toContain("sk-cardinal-ephemeral-task-009");
  });

  test("treats JSON that is not a worker result as malformed output", async () => {
    const keyProvider = new TestKeyProvider();
    const driver = new MockWorkerDriver({
      stdout: JSON.stringify({ taskId: "task-010", status: "success" }),
    });
    const orchestrator = new WorkerOrchestrator({
      driver,
      keyProvider,
      backendUrl: "http://127.0.0.1:8787",
    });

    const result = await orchestrator.dispatch({
      taskId: "task-010",
      taskType: "hygiene",
      prompt: "clean",
    });

    expect(result.status).toBe("failure");
    expect(result.escalation).toBe("worker_output_malformed");
    expect(result.summary).toContain("Missing summary");
    expect(keyProvider.revokedKeys).toContain("sk-cardinal-ephemeral-task-010");
  });

  test("returns the worker result when revoking the ephemeral key fails", async () => {
    const keyProvider = new TestKeyProvider();
    keyProvider.failRevoke = true;
    const driver = new MockWorkerDriver({
      stdout: JSON.stringify({
        taskId: "task-011",
        status: "success",
        summary: "done",
      }),
    });
    const orchestrator = new WorkerOrchestrator({
      driver,
      keyProvider,
      backendUrl: "http://127.0.0.1:8787",
    });

    const result = await orchestrator.dispatch({
      taskId: "task-011",
      taskType: "maintenance",
      prompt: "probe",
    });

    expect(result.status).toBe("success");
    expect(result.summary).toBe("done");
    expect(keyProvider.revokedKeys).toContain("sk-cardinal-ephemeral-task-011");
  });
});

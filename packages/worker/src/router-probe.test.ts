import { describe, expect, test } from "bun:test";
import { executeWorkerTask } from "./runner";
import {
  probeRouterModels,
  RouterProbeError,
  type FetchLike,
} from "./router-probe";
import { createDefaultTaskHandler } from "./tasks";
import type { WorkerInput } from "./types";

const input: WorkerInput = {
  taskId: "task-9",
  taskType: "maintenance",
  prompt: "Check router",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("probeRouterModels", () => {
  test("sends the ephemeral key to GET /v1/models", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse(200, { object: "list", data: [{ id: "fusion" }] });
    };

    const result = await probeRouterModels({
      baseUrl: "http://backend:8787/",
      apiKey: "ephemeral-test-key",
      fetchImpl,
    });

    expect(result.modelCount).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://backend:8787/v1/models");
    expect(calls[0]?.init?.method).toBe("GET");
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get("authorization")).toBe("Bearer ephemeral-test-key");
  });

  test("rejects a missing key before calling the router", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error("fetch should not run");
    };
    await expect(
      probeRouterModels({ baseUrl: "http://backend:8787", apiKey: "  ", fetchImpl }),
    ).rejects.toBeInstanceOf(RouterProbeError);
  });

  test("fails the task when the router rejects the key", async () => {
    const fetchImpl: FetchLike = async () => jsonResponse(401, { error: "unauthorized" });
    const output = await executeWorkerTask(
      input,
      createDefaultTaskHandler({
        baseUrl: "http://backend:8787",
        apiKey: "ephemeral-test-key",
        fetchImpl,
      }),
    );
    expect(output.status).toBe("failure");
    expect(output.summary).toContain("status 401");
    expect(output.summary).not.toContain("ephemeral-test-key");
    expect(output.escalation).toBe("worker_task_exception");
  });

  test("includes the model count in a successful task summary", async () => {
    const fetchImpl: FetchLike = async () =>
      jsonResponse(200, { object: "list", data: [{ id: "a" }, { id: "b" }] });
    const output = await executeWorkerTask(
      input,
      createDefaultTaskHandler({
        baseUrl: "http://backend:8787",
        apiKey: "ephemeral-test-key",
        fetchImpl,
      }),
    );
    expect(output.status).toBe("success");
    expect(output.summary).toContain("router models=2");
    expect(output.summary).toContain("Check router");
    expect(output.summary).not.toContain("ephemeral-test-key");
  });
});

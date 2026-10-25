import { describe, expect, test } from "bun:test";
import {
  parseWorkerInput,
  parseWorkerOutput,
  WorkerProtocolError,
  type WorkerInput,
} from "./types";
import { executeWorkerTask, runWorker } from "./runner";

describe("@cardinal/worker protocol & runner", () => {
  test("parseWorkerInput accepts valid maintenance task", () => {
    const raw = {
      taskId: "task-123",
      taskType: "maintenance",
      prompt: "Clean stale tmp files",
      memoryScopes: ["cardinal-system/logs/*"],
      timeoutSeconds: 60,
    };
    const input = parseWorkerInput(raw);
    expect(input.taskId).toBe("task-123");
    expect(input.taskType).toBe("maintenance");
    expect(input.prompt).toBe("Clean stale tmp files");
    expect(input.memoryScopes).toEqual(["cardinal-system/logs/*"]);
    expect(input.timeoutSeconds).toBe(60);
  });

  test("parseWorkerInput rejects invalid taskType", () => {
    const raw = {
      taskId: "task-123",
      taskType: "unsupported",
      prompt: "test",
    };
    expect(() => parseWorkerInput(raw)).toThrow(WorkerProtocolError);
  });

  test("parseWorkerInput rejects missing prompt", () => {
    const raw = {
      taskId: "task-123",
      taskType: "hygiene",
      prompt: "   ",
    };
    expect(() => parseWorkerInput(raw)).toThrow(WorkerProtocolError);
  });

  test("parseWorkerInput rejects blank taskId", () => {
    expect(() =>
      parseWorkerInput({ taskId: "   ", taskType: "hygiene", prompt: "go" }),
    ).toThrow(WorkerProtocolError);
  });

  test("parseWorkerInput drops non-string memoryScopes entries", () => {
    const input = parseWorkerInput({
      taskId: "task-123",
      taskType: "maintenance",
      prompt: "probe",
      memoryScopes: ["ok", 1, null, "also-ok"],
    });
    expect(input.memoryScopes).toEqual(["ok", "also-ok"]);
  });

  test("parseWorkerInput ignores non-positive timeoutSeconds", () => {
    const input = parseWorkerInput({
      taskId: "task-123",
      taskType: "maintenance",
      prompt: "probe",
      timeoutSeconds: 0,
    });
    expect(input.timeoutSeconds).toBeUndefined();
  });

  test("parseWorkerOutput rejects missing summary", () => {
    expect(() =>
      parseWorkerOutput({ taskId: "task-123", status: "success" }),
    ).toThrow(WorkerProtocolError);
  });

  test("parseWorkerOutput rejects invalid memoryWrite entries", () => {
    expect(() =>
      parseWorkerOutput({
        taskId: "task-123",
        status: "success",
        summary: "ok",
        memoryWrites: [{ path: "a", content: 1 }],
      }),
    ).toThrow(WorkerProtocolError);
  });

  test("parseWorkerOutput defaults memoryWrite action to write", () => {
    const output = parseWorkerOutput({
      taskId: "task-123",
      status: "success",
      summary: "ok",
      memoryWrites: [{ path: "notes/x.md", content: "hi", action: "overwrite" }],
    });
    expect(output.memoryWrites![0].action).toBe("write");
  });

  test("parseWorkerOutput validates success payload", () => {
    const raw = {
      taskId: "task-123",
      status: "success",
      summary: "Cleaned 4 stale cache files",
      memoryWrites: [
        {
          path: "cardinal-system/logs/clean.log",
          content: "Cleaned 4 files",
          action: "append",
        },
      ],
    };
    const output = parseWorkerOutput(raw);
    expect(output.taskId).toBe("task-123");
    expect(output.status).toBe("success");
    expect(output.summary).toBe("Cleaned 4 stale cache files");
    expect(output.memoryWrites).toHaveLength(1);
    expect(output.memoryWrites![0].action).toBe("append");
  });

  test("executeWorkerTask returns success status", async () => {
    const input: WorkerInput = {
      taskId: "t-1",
      taskType: "summary",
      prompt: "Summarize agent status",
    };
    const output = await executeWorkerTask(input, async (task) => {
      return {
        summary: `Summary of ${task.taskId}: all agents green`,
      };
    });
    expect(output.status).toBe("success");
    expect(output.summary).toContain("all agents green");
  });

  test("executeWorkerTask catches error and returns failure with escalation", async () => {
    const input: WorkerInput = {
      taskId: "t-2",
      taskType: "hygiene",
      prompt: "Prune database",
    };
    const output = await executeWorkerTask(input, async () => {
      throw new Error("disk full");
    });
    expect(output.status).toBe("failure");
    expect(output.summary).toContain("disk full");
    expect(output.escalation).toBe("worker_task_exception");
  });

  test("runWorker handles raw JSON string and returns serialized output", async () => {
    const raw = JSON.stringify({
      taskId: "t-3",
      taskType: "maintenance",
      prompt: "Vacuum sqlite",
    });
    const resultStr = await runWorker(raw, async () => {
      return { summary: "Vacuum complete" };
    });
    const parsed = JSON.parse(resultStr);
    expect(parsed.taskId).toBe("t-3");
    expect(parsed.status).toBe("success");
    expect(parsed.summary).toBe("Vacuum complete");
  });

  test("runWorker handles malformed JSON and returns protocol error", async () => {
    const resultStr = await runWorker("invalid json", async () => {
      return { summary: "never reached" };
    });
    const parsed = JSON.parse(resultStr);
    expect(parsed.status).toBe("failure");
    expect(parsed.escalation).toBe("worker_protocol_error");
  });
});

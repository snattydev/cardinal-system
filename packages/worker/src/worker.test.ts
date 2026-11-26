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

  test("parseWorkerInput rejects a blank task id and a non-object payload", () => {
    expect(() => parseWorkerInput(null)).toThrow(WorkerProtocolError);
    expect(() =>
      parseWorkerInput({ taskId: "  ", taskType: "maintenance", prompt: "ok" }),
    ).toThrow(WorkerProtocolError);
  });

  test("parseWorkerInput trims fields and drops invalid optional values", () => {
    const input = parseWorkerInput({
      taskId: "  task-9  ",
      taskType: "summary",
      prompt: "  summarize  ",
      memoryScopes: ["knowledge/*", 3, null, ""],
      timeoutSeconds: 0,
      callbackUrl: 12,
    });
    expect(input.taskId).toBe("task-9");
    expect(input.prompt).toBe("summarize");
    expect(input.memoryScopes).toEqual(["knowledge/*", ""]);
    expect(input.timeoutSeconds).toBeUndefined();
    expect(input.callbackUrl).toBeUndefined();

    const withTimeout = parseWorkerInput({
      taskId: "task-9",
      taskType: "hygiene",
      prompt: "prune",
      timeoutSeconds: 15,
      callbackUrl: "http://backend:8787/callback",
    });
    expect(withTimeout.timeoutSeconds).toBe(15);
    expect(withTimeout.callbackUrl).toBe("http://backend:8787/callback");
    expect(withTimeout.memoryScopes).toBeUndefined();
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

  test("parseWorkerOutput rejects a bad status and an invalid memory write", () => {
    expect(() =>
      parseWorkerOutput({ taskId: "task-123", status: "ok", summary: "done" }),
    ).toThrow(WorkerProtocolError);
    expect(() =>
      parseWorkerOutput({
        taskId: "task-123",
        status: "failure",
        summary: "done",
        memoryWrites: [{ path: "logs/a", content: 1 }],
      }),
    ).toThrow(WorkerProtocolError);
  });

  test("parseWorkerOutput defaults a missing write action and ignores an empty escalation", () => {
    const output = parseWorkerOutput({
      taskId: "task-123",
      status: "failure",
      summary: "partial",
      escalation: "",
      memoryWrites: [{ path: "logs/a", content: "note" }],
    });
    expect(output.memoryWrites?.[0]?.action).toBe("write");
    expect(output.escalation).toBeUndefined();
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

  test("executeWorkerTask stringifies a non-Error throw", async () => {
    const input: WorkerInput = {
      taskId: "t-2b",
      taskType: "hygiene",
      prompt: "Prune database",
    };
    const output = await executeWorkerTask(input, async () => {
      throw "disk full";
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
    expect(parsed.taskId).toBe("unknown");
  });

  test("runWorker keeps a task id when the payload fails protocol validation", async () => {
    const raw = JSON.stringify({
      taskId: "task-keep",
      taskType: "nope",
      prompt: "x",
    });
    const parsed = JSON.parse(
      await runWorker(raw, async () => {
        return { summary: "never reached" };
      }),
    );
    expect(parsed.taskId).toBe("task-keep");
    expect(parsed.status).toBe("failure");
    expect(parsed.escalation).toBe("worker_protocol_error");

    const numericId = JSON.parse(
      await runWorker(
        JSON.stringify({ taskId: 5, taskType: "maintenance", prompt: "x" }),
        async () => {
          return { summary: "never reached" };
        },
      ),
    );
    expect(numericId.taskId).toBe("unknown");
  });
});

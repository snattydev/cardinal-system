import { describe, expect, test } from "bun:test";
import { parseClientMessage, resolveKind } from "./protocol";

describe("parseClientMessage", () => {
  test("hello applies defaults for device and status", () => {
    const r = parseClientMessage('{"type":"hello","key":"k"}');
    expect(r).toEqual({
      ok: true,
      msg: { type: "hello", key: "k", device: "unknown", status: "idle" },
    });
  });

  test("hello preserves explicit device and status", () => {
    const r = parseClientMessage(
      '{"type":"hello","key":"k","device":"pc","status":"busy"}',
    );
    expect(r).toEqual({
      ok: true,
      msg: { type: "hello", key: "k", device: "pc", status: "busy" },
    });
  });

  test("pong without status", () => {
    expect(parseClientMessage('{"type":"pong"}')).toEqual({
      ok: true,
      msg: { type: "pong" },
    });
  });

  test("pong with status", () => {
    expect(parseClientMessage('{"type":"pong","status":"busy"}')).toEqual({
      ok: true,
      msg: { type: "pong", status: "busy" },
    });
  });

  test("bye", () => {
    expect(parseClientMessage('{"type":"bye"}')).toEqual({
      ok: true,
      msg: { type: "bye" },
    });
  });

  test("subscribe", () => {
    expect(parseClientMessage('{"type":"subscribe"}')).toEqual({
      ok: true,
      msg: { type: "subscribe" },
    });
  });

  test("invalid JSON returns not ok", () => {
    expect(parseClientMessage("{oops")).toEqual({ ok: false });
  });

  test("unknown type returns not ok", () => {
    expect(parseClientMessage('{"type":"task"}')).toEqual({ ok: false });
  });

  test("hello with invalid status enum returns not ok", () => {
    expect(parseClientMessage('{"type":"hello","key":"k","status":"sleeping"}')).toEqual({
      ok: false,
    });
  });

  test("hello without key returns not ok", () => {
    expect(parseClientMessage('{"type":"hello"}')).toEqual({ ok: false });
  });
});

describe("resolveKind", () => {
  test.each([
    ["pc", null, "agent"],
    ["localhost", null, "subagent"],
    ["localhost", "agent", "agent"],
    ["pc", "subagent", "subagent"],
  ] as const)("%s + %s -> %s", (device, override, expected) => {
    expect(resolveKind(device, override)).toBe(expected);
  });
});

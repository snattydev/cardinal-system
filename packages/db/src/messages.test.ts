import { describe, expect, test } from "bun:test";
import { createDb } from "./schema";
import { getMessage, listInbox, markMessageRead, sendMessage } from "./repos";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("messages repo", () => {
  test("sendMessage inserta con id uuid, read=0, payload_ref null y created_at", () => {
    const db = createDb(":memory:");
    const row = sendMessage(db, { fromAgent: "shinon", toAgent: "kirito", type: "handoff" });
    expect(row.id).toMatch(UUID_RE);
    expect(row).toMatchObject({
      from_agent: "shinon",
      to_agent: "kirito",
      type: "handoff",
      payload_ref: null,
      read: 0,
    });
    expect(typeof row.created_at).toBe("string");
    expect(row.created_at).not.toBe("");
    db.close();
  });

  test("sendMessage guarda payload_ref cuando se envía", () => {
    const db = createDb(":memory:");
    const row = sendMessage(db, {
      fromAgent: "shinon",
      toAgent: "kirito",
      type: "handoff",
      payloadRef: "notes/result.md",
    });
    expect(row.payload_ref).toBe("notes/result.md");
    db.close();
  });

  test("listInbox DB vacía o to_agent sin mail → []", () => {
    const db = createDb(":memory:");
    expect(listInbox(db, "kirito")).toEqual([]);
    sendMessage(db, { fromAgent: "shinon", toAgent: "asuna", type: "ping" });
    expect(listInbox(db, "kirito")).toEqual([]);
    db.close();
  });

  test("listInbox filtra por to_agent y ordena por created_at ASC", () => {
    const db = createDb(":memory:");
    const first = sendMessage(db, { fromAgent: "shinon", toAgent: "kirito", type: "a" });
    const second = sendMessage(db, { fromAgent: "asuna", toAgent: "kirito", type: "b" });
    sendMessage(db, { fromAgent: "shinon", toAgent: "asuna", type: "other" });
    db.run("UPDATE messages SET created_at = ? WHERE id = ?", ["2026-01-01 00:00:00", first.id]);
    db.run("UPDATE messages SET created_at = ? WHERE id = ?", ["2026-01-02 00:00:00", second.id]);
    const inbox = listInbox(db, "kirito");
    expect(inbox.map((m) => m.type)).toEqual(["a", "b"]);
    expect(inbox.every((m) => m.to_agent === "kirito")).toBe(true);
    db.close();
  });

  test("getMessage devuelve la fila o null", () => {
    const db = createDb(":memory:");
    const created = sendMessage(db, { fromAgent: "shinon", toAgent: "kirito", type: "ping" });
    expect(getMessage(db, created.id)?.id).toBe(created.id);
    expect(getMessage(db, "missing")).toBeNull();
    db.close();
  });

  test("markMessageRead pone read=1 y es idempotente", () => {
    const db = createDb(":memory:");
    const created = sendMessage(db, { fromAgent: "shinon", toAgent: "kirito", type: "ping" });
    expect(created.read).toBe(0);
    const marked = markMessageRead(db, created.id);
    expect(marked).not.toBeNull();
    expect(marked!.read).toBe(1);
    expect(marked!.id).toBe(created.id);
    const again = markMessageRead(db, created.id);
    expect(again).not.toBeNull();
    expect(again!.read).toBe(1);
    db.close();
  });

  test("markMessageRead desconocido → null", () => {
    const db = createDb(":memory:");
    expect(markMessageRead(db, "missing")).toBeNull();
    db.close();
  });
});

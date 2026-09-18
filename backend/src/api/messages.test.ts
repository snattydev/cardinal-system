import { describe, expect, test } from "bun:test";
import type { MessageRow } from "@cardinal/core";
import { createDb } from "@cardinal/db";
import { handleInbox, handleMarkRead, handleSendMessage } from "./messages";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonReq(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function sendMsg(
  db: ReturnType<typeof createDb>,
  body: Record<string, unknown>,
): Promise<{ id: string }> {
  const res = await handleSendMessage(
    db,
    jsonReq("http://localhost/api/messages", "POST", body),
  );
  const json = (await res.json()) as { message: { id: string } };
  return json.message;
}

describe("handleSendMessage", () => {
  test("válido → 200 {message} con id uuid, read=0, payload_ref null, created_at", async () => {
    const db = createDb(":memory:");
    const res = await handleSendMessage(
      db,
      jsonReq("http://localhost/api/messages", "POST", {
        from_agent: "shinon",
        to_agent: "kirito",
        type: "handoff",
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { message: Record<string, unknown> };
    expect(typeof body.message.id).toBe("string");
    expect(body.message.id as string).toMatch(UUID_RE);
    expect(body.message).toMatchObject({
      from_agent: "shinon",
      to_agent: "kirito",
      type: "handoff",
      payload_ref: null,
      read: 0,
    });
    expect(typeof body.message.created_at).toBe("string");
    expect(body.message.created_at).not.toBe("");
    db.close();
  });

  test("válido con payload_ref → 200 lo persiste", async () => {
    const db = createDb(":memory:");
    const res = await handleSendMessage(
      db,
      jsonReq("http://localhost/api/messages", "POST", {
        from_agent: "shinon",
        to_agent: "kirito",
        type: "handoff",
        payload_ref: "notes/result.md",
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { message: Record<string, unknown> };
    expect(body.message.payload_ref).toBe("notes/result.md");
    db.close();
  });

  test("from_agent ausente → 400 {error: 'bad_request'}", async () => {
    const db = createDb(":memory:");
    const res = await handleSendMessage(
      db,
      jsonReq("http://localhost/api/messages", "POST", { to_agent: "kirito", type: "ping" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
    db.close();
  });

  test("from_agent vacío → 400 {error: 'bad_request'}", async () => {
    const db = createDb(":memory:");
    const res = await handleSendMessage(
      db,
      jsonReq("http://localhost/api/messages", "POST", {
        from_agent: "",
        to_agent: "kirito",
        type: "ping",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
    db.close();
  });

  test("from_agent solo espacios → 400 {error: 'bad_request'}", async () => {
    const db = createDb(":memory:");
    const res = await handleSendMessage(
      db,
      jsonReq("http://localhost/api/messages", "POST", {
        from_agent: "   ",
        to_agent: "kirito",
        type: "ping",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
    db.close();
  });

  test("to_agent ausente → 400 {error: 'bad_request'}", async () => {
    const db = createDb(":memory:");
    const res = await handleSendMessage(
      db,
      jsonReq("http://localhost/api/messages", "POST", { from_agent: "shinon", type: "ping" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
    db.close();
  });

  test("to_agent vacío → 400 {error: 'bad_request'}", async () => {
    const db = createDb(":memory:");
    const res = await handleSendMessage(
      db,
      jsonReq("http://localhost/api/messages", "POST", {
        from_agent: "shinon",
        to_agent: "",
        type: "ping",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
    db.close();
  });

  test("to_agent solo espacios → 400 {error: 'bad_request'}", async () => {
    const db = createDb(":memory:");
    const res = await handleSendMessage(
      db,
      jsonReq("http://localhost/api/messages", "POST", {
        from_agent: "shinon",
        to_agent: "   ",
        type: "ping",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
    db.close();
  });

  test("type ausente → 400 {error: 'bad_request'}", async () => {
    const db = createDb(":memory:");
    const res = await handleSendMessage(
      db,
      jsonReq("http://localhost/api/messages", "POST", {
        from_agent: "shinon",
        to_agent: "kirito",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
    db.close();
  });

  test("type vacío → 400 {error: 'bad_request'}", async () => {
    const db = createDb(":memory:");
    const res = await handleSendMessage(
      db,
      jsonReq("http://localhost/api/messages", "POST", {
        from_agent: "shinon",
        to_agent: "kirito",
        type: "",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
    db.close();
  });

  test("type solo espacios → 400 {error: 'bad_request'}", async () => {
    const db = createDb(":memory:");
    const res = await handleSendMessage(
      db,
      jsonReq("http://localhost/api/messages", "POST", {
        from_agent: "shinon",
        to_agent: "kirito",
        type: "   ",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
    db.close();
  });

  test("body no JSON → 400 {error: 'bad_request'}", async () => {
    const db = createDb(":memory:");
    const res = await handleSendMessage(
      db,
      jsonReq("http://localhost/api/messages", "POST", "no es json"),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
    db.close();
  });
});

describe("handleInbox", () => {
  test("DB vacía → {messages: []}", async () => {
    const db = createDb(":memory:");
    const res = handleInbox(db, new Request("http://localhost/api/messages?to_agent=kirito"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ messages: [] });
    db.close();
  });

  test("to_agent sin mail → {messages: []}", async () => {
    const db = createDb(":memory:");
    await sendMsg(db, { from_agent: "shinon", to_agent: "asuna", type: "ping" });
    const res = handleInbox(db, new Request("http://localhost/api/messages?to_agent=kirito"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ messages: [] });
    db.close();
  });

  test("filtra por to_agent, orden created_at ASC; no mezcla inboxes", async () => {
    const db = createDb(":memory:");
    const first = await sendMsg(db, { from_agent: "shinon", to_agent: "kirito", type: "a" });
    const second = await sendMsg(db, { from_agent: "asuna", to_agent: "kirito", type: "b" });
    await sendMsg(db, { from_agent: "shinon", to_agent: "asuna", type: "other" });
    db.run("UPDATE messages SET created_at = ? WHERE id = ?", ["2026-01-01 00:00:00", first.id]);
    db.run("UPDATE messages SET created_at = ? WHERE id = ?", ["2026-01-02 00:00:00", second.id]);

    const res = handleInbox(db, new Request("http://localhost/api/messages?to_agent=kirito"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { messages: Array<{ id: string; type: string; to_agent: string }> };
    expect(body.messages.map((m) => m.type)).toEqual(["a", "b"]);
    expect(body.messages.every((m) => m.to_agent === "kirito")).toBe(true);

    const other = handleInbox(db, new Request("http://localhost/api/messages?to_agent=asuna"));
    const otherBody = (await other.json()) as { messages: Array<{ type: string }> };
    expect(otherBody.messages.map((m) => m.type)).toEqual(["other"]);
    db.close();
  });

  test("sin to_agent → 400 {error: 'missing_to_agent'}", async () => {
    const db = createDb(":memory:");
    const res = handleInbox(db, new Request("http://localhost/api/messages"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing_to_agent" });
    db.close();
  });

  test("to_agent vacío → 400 {error: 'missing_to_agent'}", async () => {
    const db = createDb(":memory:");
    const res = handleInbox(db, new Request("http://localhost/api/messages?to_agent="));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing_to_agent" });
    db.close();
  });
});

describe("handleMarkRead", () => {
  test("existente → 200 {message} con read=1; idempotente si ya estaba leído", async () => {
    const db = createDb(":memory:");
    const created = await sendMsg(db, { from_agent: "shinon", to_agent: "kirito", type: "ping" });
    const res = await handleMarkRead(
      db,
      created.id,
      jsonReq(`http://localhost/api/messages/${created.id}/read`, "PUT", {}),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { message: Record<string, unknown> };
    expect(body.message).toMatchObject({ id: created.id, read: 1 });

    const again = await handleMarkRead(
      db,
      created.id,
      jsonReq(`http://localhost/api/messages/${created.id}/read`, "PUT", {}),
    );
    expect(again.status).toBe(200);
    const againBody = (await again.json()) as { message: Record<string, unknown> };
    expect(againBody.message).toMatchObject({ id: created.id, read: 1 });
    db.close();
  });

  test("desconocido → 404 {error: 'not_found'}", async () => {
    const db = createDb(":memory:");
    const res = await handleMarkRead(
      db,
      "missing",
      jsonReq("http://localhost/api/messages/missing/read", "PUT", {}),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    db.close();
  });
});

describe("onChange callback", () => {
  test("send llama onChange con el MessageRow creado", async () => {
    const db = createDb(":memory:");
    const calls: MessageRow[] = [];
    const res = await handleSendMessage(
      db,
      jsonReq("http://localhost/api/messages", "POST", {
        from_agent: "shinon",
        to_agent: "kirito",
        type: "handoff",
      }),
      (m) => calls.push(m),
    );
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      from_agent: "shinon",
      to_agent: "kirito",
      type: "handoff",
      read: 0,
    });
    db.close();
  });

  test("mark-read llama onChange con el MessageRow leído", async () => {
    const db = createDb(":memory:");
    const created = await sendMsg(db, { from_agent: "shinon", to_agent: "kirito", type: "ping" });
    const calls: MessageRow[] = [];
    const res = await handleMarkRead(
      db,
      created.id,
      jsonReq(`http://localhost/api/messages/${created.id}/read`, "PUT", {}),
      (m) => calls.push(m),
    );
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ id: created.id, read: 1 });
    db.close();
  });

  test("mark-read 404 NO llama onChange", async () => {
    const db = createDb(":memory:");
    const calls: MessageRow[] = [];
    const res = await handleMarkRead(
      db,
      "missing",
      jsonReq("http://localhost/api/messages/missing/read", "PUT", {}),
      (m) => calls.push(m),
    );
    expect(res.status).toBe(404);
    expect(calls).toHaveLength(0);
    db.close();
  });
});

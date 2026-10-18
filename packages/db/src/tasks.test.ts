import { describe, expect, test } from "bun:test";
import { createDb } from "./schema";
import { createTask, getTask } from "./repos";

describe("tasks repo", () => {
  test("createTask stores parent_id when the parent row exists", () => {
    const db = createDb(":memory:");
    const parent = createTask(db, { goal: "parent", createdBy: "shinon" });
    const child = createTask(db, { goal: "child", createdBy: "shinon", parentId: parent.id });
    expect(getTask(db, child.id)?.parent_id).toBe(parent.id);
    db.close();
  });

  test("createTask rejects an unknown parent and inserts nothing", () => {
    const db = createDb(":memory:");
    expect(() => createTask(db, { goal: "orphan", createdBy: "shinon", parentId: "missing" })).toThrow();
    const count = db.query("SELECT COUNT(*) AS n FROM tasks").get() as { n: number };
    expect(count.n).toBe(0);
    db.close();
  });
});

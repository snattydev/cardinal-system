#!/usr/bin/env python3
"""Blackboard — shared task store for cross-provider agent coordination.

Spike 001 (throwaway). Validates the structured-board model: agents coordinate
via DB rows (tasks) instead of a human chat channel, so nobody's context or
memory gets inflated. Pure stdlib (sqlite3). No deps.

Commands:
  python3 board.py --db board.db create --goal "..." --by <agent> [--parent <id>]
  python3 board.py --db board.db list [--status open|claimed|done|blocked]
  python3 board.py --db board.db get <id>
  python3 board.py --db board.db claim <id> --by <agent>
  python3 board.py --db board.db complete <id> [--summary "..." --artifact path]
"""
import argparse
import json
import sqlite3
import sys
import uuid
from datetime import datetime, timezone

SCHEMA = """
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  goal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  assigned_to TEXT,
  created_by TEXT NOT NULL,
  parent_id TEXT,
  summary TEXT,
  artifact_ref TEXT,
  created_at TEXT,
  updated_at TEXT
);
"""


def now():
    return datetime.now(timezone.utc).isoformat()


def connect(db):
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(SCHEMA)
    return conn


def task_create(db, goal, by, parent=None):
    conn = connect(db)
    tid = uuid.uuid4().hex[:12]
    conn.execute(
        "INSERT INTO tasks (id, goal, status, created_by, parent_id, created_at, updated_at)"
        " VALUES (?,?,?,?,?,?,?)",
        (tid, goal, "open", by, parent, now(), now()),
    )
    conn.commit()
    conn.close()
    return {"id": tid, "goal": goal, "status": "open", "created_by": by}


def task_list(db, status=None):
    conn = connect(db)
    q = "SELECT * FROM tasks"
    args = []
    if status:
        q += " WHERE status = ?"
        args.append(status)
    q += " ORDER BY created_at"
    rows = [dict(r) for r in conn.execute(q, args)]
    conn.close()
    return rows


def task_get(db, tid):
    conn = connect(db)
    r = conn.execute("SELECT * FROM tasks WHERE id = ?", (tid,)).fetchone()
    conn.close()
    return dict(r) if r else None


def task_claim(db, tid, by):
    conn = connect(db)
    r = conn.execute("SELECT status FROM tasks WHERE id = ?", (tid,)).fetchone()
    if not r:
        conn.close()
        return None
    if r["status"] != "open":
        conn.close()
        return {"ok": False, "status": r["status"], "error": "not_open"}
    conn.execute(
        "UPDATE tasks SET status='claimed', assigned_to=?, updated_at=? WHERE id=?",
        (by, now(), tid),
    )
    conn.commit()
    conn.close()
    return {"ok": True, "status": "claimed", "assigned_to": by}


def task_complete(db, tid, summary=None, artifact=None):
    conn = connect(db)
    r = conn.execute("SELECT id FROM tasks WHERE id = ?", (tid,)).fetchone()
    if not r:
        conn.close()
        return None
    conn.execute(
        "UPDATE tasks SET status='done', summary=?, artifact_ref=?, updated_at=? WHERE id=?",
        (summary, artifact, now(), tid),
    )
    conn.commit()
    conn.close()
    return {"ok": True, "status": "done"}


def main():
    p = argparse.ArgumentParser(description="Blackboard spike store")
    p.add_argument("--db", default="board.db")
    sub = p.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("create")
    c.add_argument("--goal", required=True)
    c.add_argument("--by", required=True)
    c.add_argument("--parent")

    l = sub.add_parser("list")
    l.add_argument("--status")

    g = sub.add_parser("get")
    g.add_argument("id")

    cl = sub.add_parser("claim")
    cl.add_argument("id")
    cl.add_argument("--by", required=True)

    co = sub.add_parser("complete")
    co.add_argument("id")
    co.add_argument("--summary")
    co.add_argument("--artifact")

    a = p.parse_args()
    if a.cmd == "create":
        print(json.dumps(task_create(a.db, a.goal, a.by, a.parent), ensure_ascii=False))
    elif a.cmd == "list":
        for r in task_list(a.db, a.status):
            print(json.dumps(r, ensure_ascii=False))
    elif a.cmd == "get":
        print(json.dumps(task_get(a.db, a.id), ensure_ascii=False))
    elif a.cmd == "claim":
        print(json.dumps(task_claim(a.db, a.id, a.by), ensure_ascii=False))
    elif a.cmd == "complete":
        print(json.dumps(task_complete(a.db, a.id, a.summary, a.artifact), ensure_ascii=False))


if __name__ == "__main__":
    main()

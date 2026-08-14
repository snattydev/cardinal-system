#!/usr/bin/env python3
"""Minimal MCP stdio server exposing the blackboard as tools.

Implements just enough of the MCP stdio transport (newline-delimited JSON-RPC
2.0): initialize, notifications/initialized, tools/list, tools/call, ping.
No external deps — wraps board.py's store. This is the *shape* of the real
Cardinal MCP surface; interop with a real MCP client is spike-002's concern.

Run with BLACKBOARD_DB=/path/to/board.db to override the default.
"""
import json
import os
import sys

import board

DB = os.environ.get("BLACKBOARD_DB", "board.db")

TOOLS = [
    {
        "name": "task_create",
        "description": "Create a task on the shared board",
        "inputSchema": {
            "type": "object",
            "properties": {"goal": {"type": "string"}, "by": {"type": "string"}},
            "required": ["goal", "by"],
        },
    },
    {
        "name": "task_list",
        "description": "List board tasks, optionally filtered by status",
        "inputSchema": {"type": "object", "properties": {"status": {"type": "string"}}},
    },
    {
        "name": "task_claim",
        "description": "Claim an open task for an agent",
        "inputSchema": {
            "type": "object",
            "properties": {"id": {"type": "string"}, "by": {"type": "string"}},
            "required": ["id", "by"],
        },
    },
    {
        "name": "task_complete",
        "description": "Mark a task done with a bounded summary and optional artifact ref",
        "inputSchema": {
            "type": "object",
            "properties": {
                "id": {"type": "string"},
                "summary": {"type": "string"},
                "artifact": {"type": "string"},
            },
            "required": ["id"],
        },
    },
]


def call_tool(name, args):
    if name == "task_create":
        return board.task_create(DB, args["goal"], args["by"])
    if name == "task_list":
        return board.task_list(DB, args.get("status"))
    if name == "task_claim":
        return board.task_claim(DB, args["id"], args["by"])
    if name == "task_complete":
        return board.task_complete(DB, args["id"], args.get("summary"), args.get("artifact"))
    raise ValueError(f"unknown tool {name}")


def send(msg):
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


def handle(msg):
    method = msg.get("method")
    mid = msg.get("id")
    if method == "initialize":
        send({
            "jsonrpc": "2.0",
            "id": mid,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "blackboard", "version": "0.1.0"},
            },
        })
    elif method == "notifications/initialized":
        pass  # notification, no response expected
    elif method == "tools/list":
        send({"jsonrpc": "2.0", "id": mid, "result": {"tools": TOOLS}})
    elif method == "tools/call":
        try:
            name = msg["params"]["name"]
            args = msg["params"].get("arguments", {})
            result = call_tool(name, args)
            send({
                "jsonrpc": "2.0",
                "id": mid,
                "result": {"content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False)}]},
            })
        except Exception as e:
            send({"jsonrpc": "2.0", "id": mid, "error": {"code": -32602, "message": str(e)}})
    elif method == "ping":
        send({"jsonrpc": "2.0", "id": mid, "result": {}})
    # other notifications are ignored


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            handle(json.loads(line))
        except Exception as e:
            send({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": str(e)}})


if __name__ == "__main__":
    main()

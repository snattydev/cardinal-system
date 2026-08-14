#!/usr/bin/env python3
"""Test client for mcp_server.py — validates the MCP stdio framing + state.

Speaks newline-delimited JSON-RPC 2.0 over stdio to a subprocess, does the
handshake, lists tools, and exercises create + list against the store.
"""
import json
import subprocess
import sys


def rpc(proc, obj):
    proc.stdin.write(json.dumps(obj) + "\n")
    proc.stdin.flush()
    if "id" not in obj:
        return None  # notification — the server sends no response
    return json.loads(proc.stdout.readline())


def main():
    proc = subprocess.Popen(
        [sys.executable, "-u", "mcp_server.py"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        text=True,
        bufsize=1,
    )

    r = rpc(proc, {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "test", "version": "0"}},
    })
    print("initialize:", r["result"]["serverInfo"])

    rpc(proc, {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})

    r = rpc(proc, {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
    print("tools:", [t["name"] for t in r["result"]["tools"]])

    r = rpc(proc, {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "task_create", "arguments": {"goal": "smoke test", "by": "test-client"}}})
    print("create:", r["result"]["content"][0]["text"])

    r = rpc(proc, {"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "task_list", "arguments": {}}})
    print("list:", r["result"]["content"][0]["text"])

    proc.terminate()
    print("OK")


if __name__ == "__main__":
    main()

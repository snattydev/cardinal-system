#!/usr/bin/env python3
"""Mock OpenAI-compatible upstream for the Cardinal router e2e.

Runs on the HOST (python3 stdlib), binds 0.0.0.0 so the cardinal-backend
container can reach it via http://host.containers.internal:18999.

Responds to POST /v1/chat/completions with a fixed completion + usage, so the
router's auth/scope/budget/failover/metering can be exercised without a real LLM.

Usage:
  python3 scripts/mock-upstream.py            # listen on 0.0.0.0:18999
  MOCK_PORT=19000 python3 scripts/mock-upstream.py
"""
import json
import os
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(os.environ.get("MOCK_PORT", "18999"))


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):  # quieter logs
        pass

    def do_POST(self):
        if self.path != "/v1/chat/completions":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length) if length > 0 else b"{}"
        try:
            payload = json.loads(body or b"{}")
        except json.JSONDecodeError:
            payload = {}
        stream = payload.get("stream", False)
        model = payload.get("model", "test-model")

        if stream:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            chunks = [
                f'data: {{"id":"cmpl-mock","object":"chat.completion.chunk","model":"{model}","choices":[{{"index":0,"delta":{{"role":"assistant"}},"finish_reason":null}}]}}\n\n',
                f'data: {{"id":"cmpl-mock","object":"chat.completion.chunk","model":"{model}","choices":[{{"index":0,"delta":{{"content":"ok"}},"finish_reason":null}}]}}\n\n',
                f'data: {{"id":"cmpl-mock","object":"chat.completion.chunk","model":"{model}","choices":[{{"index":0,"delta":{{}},"finish_reason":"stop"}}]}}\n\n',
                "data: [DONE]\n\n",
            ]
            for c in chunks:
                self.wfile.write(c.encode())
                self.wfile.flush()
                time.sleep(0.05)
            return

        completion = {
            "id": "cmpl-mock",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": model,
            "choices": [{"index": 0, "message": {"role": "assistant", "content": "ok"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
        }
        data = json.dumps(completion).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/v1/models":
            data = json.dumps({"object": "list", "data": [{"id": "test-model", "object": "model"}]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        self.send_error(404)


if __name__ == "__main__":
    print(f"mock upstream listening on 0.0.0.0:{PORT}")
    HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()

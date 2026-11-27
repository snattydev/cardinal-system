#!/usr/bin/env python3
"""vault-query-proxy.py - exposes vault-query as HTTP JSON for Cardinal (Phase 1.6).

Cardinal runs inside a container and cannot execute the host vault-query CLI
directly. This proxy listens on loopback (127.0.0.1:8788 by default) and
delegates to the host vault-query.py script.

Run with the host virtualenv (containing fastembed + sqlite-vec):
  ~/.local/venvs/vault-index/bin/python scripts/vault-query-proxy.py [--port 8788]

Endpoints:
  POST /search  {query, top_k?, mode?} -> {results: [...]}  (mode: hybrid|semantic|keyword)
  GET  /status                         -> {status, db, files?}
"""
import argparse
import hmac
import importlib.util
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

VAULT_QUERY_PY = Path.home() / ".hermes" / "scripts" / "vault-query.py"
TOKEN = os.environ.get("VAULT_PROXY_TOKEN", "")
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}
ALLOW_UNAUTHENTICATED = False


def load_vault_query():
    spec = importlib.util.spec_from_file_location("vault_query", VAULT_QUERY_PY)
    if spec is None or spec.loader is None:
        sys.exit(f"ERROR: failed to load {VAULT_QUERY_PY}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class Handler(BaseHTTPRequestHandler):
    searcher = None
    vault = None

    def _auth_ok(self) -> bool:
        if ALLOW_UNAUTHENTICATED and not TOKEN:
            return True
        if not TOKEN:
            return False
        provided = self.headers.get("X-Vault-Token") or ""
        return hmac.compare_digest(provided, TOKEN)

    def _json(self, code: int, obj: dict) -> None:
        data = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        if not self._auth_ok():
            self._json(401, {"error": "unauthorized"})
            return
        if self.path == "/status":
            try:
                status = self.searcher.get_status()
                self._json(200, {"status": "ok", **status})
            except Exception as e:  # noqa: BLE001
                self._json(500, {"status": "error", "error": str(e)})
        else:
            self._json(404, {"error": "not_found"})

    def do_POST(self) -> None:
        if not self._auth_ok():
            self._json(401, {"error": "unauthorized"})
            return
        if self.path != "/search":
            self._json(404, {"error": "not_found"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length) or b"{}")
        except Exception as e:  # noqa: BLE001
            self._json(400, {"error": "bad_request", "detail": str(e)})
            return

        query = (body.get("query") or "").strip()
        if not query:
            self._json(400, {"error": "missing_query"})
            return
        try:
            top_k = max(1, min(int(body.get("top_k", 5)), 10))
        except (TypeError, ValueError):
            top_k = 5
        mode = body.get("mode", "hybrid")
        fn = {
            "hybrid": self.searcher.hybrid_search,
            "semantic": self.searcher.search_semantic,
            "keyword": self.searcher.search_keyword,
        }.get(mode)
        if fn is None:
            self._json(400, {"error": "invalid_mode", "modes": ["hybrid", "semantic", "keyword"]})
            return

        try:
            results = fn(query, top_k)
            self._json(200, {"results": results, "mode": mode, "top_k": top_k})
        except Exception as e:  # noqa: BLE001
            self._json(500, {"error": "search_failed", "detail": str(e)})

    def log_message(self, format: str, *args) -> None:
        sys.stderr.write(f"[vault-query-proxy] {format % args}\n")


def main() -> None:
    global ALLOW_UNAUTHENTICATED
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8788)))
    parser.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    parser.add_argument("--vault-query", default=str(VAULT_QUERY_PY))
    parser.add_argument(
        "--allow-unauthenticated",
        action="store_true",
        help="Allow running without VAULT_PROXY_TOKEN on loopback hosts only.",
    )
    args = parser.parse_args()

    if not TOKEN:
        if not args.allow_unauthenticated:
            sys.exit(
                "ERROR: VAULT_PROXY_TOKEN is required "
                "(pass --allow-unauthenticated for loopback local dev)."
            )
        if args.host not in LOOPBACK_HOSTS:
            sys.exit(
                f"ERROR: --allow-unauthenticated is only allowed on loopback hosts, got {args.host!r}."
            )
        ALLOW_UNAUTHENTICATED = True

    if not Path(args.vault_query).exists():
        sys.exit(f"ERROR: vault-query.py not found at {args.vault_query}")

    mod = load_vault_query()
    Handler.searcher = mod.VaultSearch()
    Handler.vault = mod

    httpd = HTTPServer((args.host, args.port), Handler)
    auth = "auth ON" if TOKEN else "auth OFF (loopback --allow-unauthenticated)"
    print(f"[vault-query-proxy] listening on {args.host}:{args.port} ({auth})", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[vault-query-proxy] stopped", flush=True)


if __name__ == "__main__":
    main()

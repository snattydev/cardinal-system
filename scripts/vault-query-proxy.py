#!/usr/bin/env python3
"""vault-query-proxy.py — expone vault-query como HTTP JSON para el Cardinal (Fase 1.6).

El Cardinal corre en un container y no puede ejecutar vault-query (vive en el
host con su índice y modelo fastembed). Este proxy escucha en 127.0.0.1:8788
y delega en vault-query.py del host.

Correr con el venv del host (tiene fastembed + sqlite-vec):
  ~/.local/venvs/vault-index/bin/python scripts/vault-query-proxy.py [--port 8788]

Endpoints:
  POST /search  {query, top_k?, mode?} → {results: [...]}  (mode: hybrid|semantic|keyword)
  GET  /status                        → {status, db, files?}
"""
import argparse
import importlib.util
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

VAULT_QUERY_PY = Path.home() / ".hermes" / "scripts" / "vault-query.py"
TOKEN = os.environ.get("VAULT_PROXY_TOKEN", "")


def load_vault_query():
    spec = importlib.util.spec_from_file_location("vault_query", VAULT_QUERY_PY)
    if spec is None or spec.loader is None:
        sys.exit(f"ERROR: no puedo cargar {VAULT_QUERY_PY}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class Handler(BaseHTTPRequestHandler):
    searcher = None
    vault = None

    def _auth_ok(self) -> bool:
        if not TOKEN:
            return True  # sin token configurado → sin auth (dev local)
        return self.headers.get("X-Vault-Token") == TOKEN

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

    def log_message(self, format: str, *args) -> None:  # silenciar access log
        sys.stderr.write(f"[vault-query-proxy] {format % args}\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8788)))
    parser.add_argument("--host", default=os.environ.get("HOST", "0.0.0.0"))
    parser.add_argument("--vault-query", default=str(VAULT_QUERY_PY))
    args = parser.parse_args()

    if not Path(args.vault_query).exists():
        sys.exit(f"ERROR: no encuentro vault-query.py en {args.vault_query}")

    mod = load_vault_query()
    Handler.searcher = mod.VaultSearch()
    Handler.vault = mod

    httpd = HTTPServer((args.host, args.port), Handler)
    auth = "auth ON" if TOKEN else "auth OFF (sin VAULT_PROXY_TOKEN)"
    print(f"[vault-query-proxy] escuchando en {args.host}:{args.port} ({auth})", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[vault-query-proxy] detenido", flush=True)


if __name__ == "__main__":
    main()

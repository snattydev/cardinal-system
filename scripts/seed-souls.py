#!/usr/bin/env python3
"""seed-souls.py — Migra docs/agents/*-soul.md a la DB del Cardinal (Fase 1.2.2).

1. Crea el profile si no existe (PUT /api/profiles/:name — API HTTP)
2. Inserta/actualiza el soul directo en la DB (volume cardinal-system_cardinal-db)

Solo lee docs/agents/*-soul.md del repo. No toca otros datos.

Uso: python3 scripts/seed-souls.py [--dry-run]
Requisitos: backend corriendo (:8787), JWT_SECRET en .env, podman volume montado.
"""
import argparse
import base64
import hashlib
import hmac
import json
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
AGENTS_DIR = REPO / "docs" / "agents"
BACKEND = "http://127.0.0.1:8787"
DB_HOST = Path(
    os.environ.get(
        "CARDINAL_DB_HOST",
        os.path.expanduser("~/.local/share/containers/storage/volumes/cardinal-system_cardinal-db/_data/cardinal.db"),
    )
)


def load_jwt_secret() -> str:
    env_file = REPO / ".env"
    if not env_file.exists():
        sys.exit("ERROR: no .env en el repo — no puedo firmar JWT")
    for line in env_file.read_text().splitlines():
        if line.startswith("JWT_SECRET="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("ERROR: JWT_SECRET no encontrado en .env")


def make_jwt(secret: str) -> str:
    def b64url(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    now = int(time.time())
    payload = b64url(json.dumps({"sub": "admin", "iat": now, "exp": now + 3600}).encode())
    sig = b64url(hmac.new(secret.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest())
    return f"{header}.{payload}.{sig}"


def title_display(soul_md: str, fallback: str) -> str:
    m = re.search(r"^#\s+(.+?)\s*—", soul_md, re.M)
    return m.group(1).strip() if m else fallback.capitalize()


def upsert_profile_via_api(name: str, display_name: str, token: str, dry_run: bool) -> bool:
    body = {"display_name": display_name, "kind": "permanent", "status": "active"}
    if dry_run:
        print(f"  [dry-run] PUT /api/profiles/{name} {json.dumps(body, ensure_ascii=False)}")
        return True
    req = urllib.request.Request(
        f"{BACKEND}/api/profiles/{name}",
        method="PUT",
        headers={"Cookie": f"cardinal_session={token}", "Content-Type": "application/json"},
        data=json.dumps(body).encode(),
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status == 200
    except urllib.error.HTTPError as e:
        print(f"  ✗ profile {name}: {e.code} — {e.read().decode()[:120]}")
        return False


def upsert_soul_db(name: str, soul_md: str, dry_run: bool) -> bool:
    if dry_run:
        print(f"  [dry-run] INSERT soul {name} ({len(soul_md)} chars)")
        return True
    if not DB_HOST.exists():
        print(f"  ✗ DB no encontrada en {DB_HOST}")
        return False
    conn = sqlite3.connect(DB_HOST)
    try:
        cur = conn.execute(
            """INSERT INTO souls (profile_name, soul_md, version)
               VALUES (?, ?, 1)
               ON CONFLICT(profile_name) DO UPDATE SET
                 soul_md = excluded.soul_md,
                 version = souls.version + 1,
                 updated_at = datetime('now')""",
            (name, soul_md),
        )
        conn.commit()
        action = "INSERT" if cur.rowcount == 1 else "UPDATE"
        print(f"  ✓ soul {name}: {action} ({len(soul_md)} chars)")
        return True
    except sqlite3.Error as e:
        print(f"  ✗ soul {name}: {e}")
        return False
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    files = sorted(AGENTS_DIR.glob("*-soul.md"))
    if not files:
        sys.exit(f"No hay *-soul.md en {AGENTS_DIR}")

    secret = load_jwt_secret()
    token = make_jwt(secret)
    print(f"Souls encontrados: {len(files)} en {AGENTS_DIR}")

    ok = 0
    for f in files:
        name = f.name.replace("-soul.md", "")
        soul_md = f.read_text()
        display = title_display(soul_md, name)
        print(f"== {name} ({display})")
        if upsert_profile_via_api(name, display, token, args.dry_run) and upsert_soul_db(name, soul_md, args.dry_run):
            ok += 1

    print(f"\nResultado: {ok}/{len(files)} souls")
    if args.dry_run:
        print("(dry-run — no se escribió nada)")


if __name__ == "__main__":
    main()

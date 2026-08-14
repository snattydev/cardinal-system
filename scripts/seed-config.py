#!/usr/bin/env python3
"""seed-config.py — Copia config.yaml de perfiles Hermes al Cardinal (Fase 1.7 seed).

Lee ~/.hermes/profiles/*/config.yaml completo y lo sube como
config_templates vía PUT /api/config/:profile.

Uso: python3 scripts/seed-config.py [--dry-run] [--profile NAME]
Requisitos: backend corriendo (:8787), JWT_SECRET en .env.
"""
import argparse
import base64
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
HERMES_PROFILES = Path.home() / ".hermes" / "profiles"
BACKEND = "http://127.0.0.1:8787"


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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--profile", help="solo este perfil")
    args = parser.parse_args()

    secret = load_jwt_secret()
    token = make_jwt(secret)

    profiles = sorted(p for p in HERMES_PROFILES.iterdir() if p.is_dir())
    if args.profile:
        profiles = [p for p in profiles if p.name == args.profile]
    if not profiles:
        sys.exit(f"No hay perfiles en {HERMES_PROFILES}")

    ok = 0
    for p in profiles:
        cfg = p / "config.yaml"
        if not cfg.exists():
            print(f"✗ {p.name}: sin config.yaml")
            continue
        config_yaml = cfg.read_text(errors="replace")
        if args.dry_run:
            print(f"[dry-run] {p.name}: {len(config_yaml)} chars")
            ok += 1
            continue

        req = urllib.request.Request(
            f"{BACKEND}/api/config/{p.name}",
            method="PUT",
            headers={"Cookie": f"cardinal_session={token}", "Content-Type": "application/json"},
            data=json.dumps({"config_yaml": config_yaml}).encode(),
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
            print(f"✓ {p.name}: {resp.status} — version {data.get('config', {}).get('version')} ({len(config_yaml)} chars)")
            ok += 1
        except urllib.error.HTTPError as e:
            print(f"✗ {p.name}: {e.code} — {e.read().decode()[:120]}")

    print(f"\nResultado: {ok}/{len(profiles)} configs")
    if args.dry_run:
        print("(dry-run — no se envió nada)")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""seed-profiles.py — Sincroniza perfiles Hermes locales al Cardinal (Fase 1.1.3).

Lee ~/.hermes/profiles/*/config.yaml (metadata: model.default, provider),
construye el perfil y hace PUT a /api/profiles/:name del backend Cardinal.

Uso: python3 scripts/seed-profiles.py [--dry-run]

Requisitos:
- Backend Cardinal corriendo (http://127.0.0.1:8787)
- JWT_SECRET en .env del repo (para firmar el token de admin)
- Solo lee metadata de config.yaml — no toca memorias, skills ni contenido
"""
import argparse
import base64
import hashlib
import hmac
import json
import os
import re
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


def read_profile_meta(profile_dir: Path) -> dict:
    """Extrae model.default y provider del config.yaml con regex (sin dep yaml)."""
    cfg = profile_dir / "config.yaml"
    meta = {}
    if cfg.exists():
        text = cfg.read_text(errors="replace")
        m = re.search(r"^model:\s*\n((?:[ \t]+[^\n]*\n)*)", text, re.M)
        if m:
            block = m.group(1)
            d = re.search(r"^\s+default:\s*(.+)$", block, re.M)
            if d:
                meta["model_default"] = d.group(1).strip().strip("'\"")
            p = re.search(r"^\s+provider:\s*(.+)$", block, re.M)
            if p:
                meta["provider_default"] = p.group(1).strip().strip("'\"")
    return meta


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="no hace PUT, solo muestra")
    args = parser.parse_args()

    secret = load_jwt_secret()
    token = make_jwt(secret)
    profiles = sorted(p for p in HERMES_PROFILES.iterdir() if p.is_dir())
    if not profiles:
        sys.exit("No hay perfiles en ~/.hermes/profiles/")

    print(f"Perfiles encontrados en {HERMES_PROFILES}: {len(profiles)}")
    ok = 0
    for p in profiles:
        name = p.name
        meta = read_profile_meta(p)
        body = {
            "display_name": name.capitalize(),
            "kind": "permanent",
            "status": "active",
            "device": "pc",
            **meta,
        }
        if args.dry_run:
            print(f"[dry-run] {name}: {json.dumps(body, ensure_ascii=False)}")
            continue

        req = urllib.request.Request(
            f"{BACKEND}/api/profiles/{name}",
            method="PUT",
            headers={
                "Cookie": f"cardinal_session={token}",
                "Content-Type": "application/json",
            },
            data=json.dumps(body).encode(),
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
            print(f"✓ {name}: {resp.status} — {data.get('profile', {}).get('name')}")
            ok += 1
        except urllib.error.HTTPError as e:
            print(f"✗ {name}: {e.code} — {e.read().decode()[:120]}")

    print(f"\nResultado: {ok}/{len(profiles)} perfiles sincronizados")
    if args.dry_run:
        print("(dry-run — no se envió nada)")


if __name__ == "__main__":
    main()

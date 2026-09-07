#!/usr/bin/env python3
"""seed-router.py — Seeds standard providers and model routes for Cardinal LLM Router.

Configures:
- Providers:
  1. opencode-zen (OpenCode free models via opencode-llm-proxy :4010)
  2. mock-local (Local testing mock upstream :18999)
- Routes:
  1. fast -> [opencode-zen: opencode/deepseek-v4-flash-free, mock-local: test-model]
  2. reasoning -> [opencode-zen: opencode/glm-4-flash-free, mock-local: test-model]

Usage:
  python3 scripts/seed-router.py [--db <path>] [--dry-run]
"""
import argparse
import json
import os
import sqlite3
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DEFAULT_DB = Path(
    os.environ.get(
        "CARDINAL_DB_PATH",
        os.path.expanduser("~/.local/share/containers/storage/volumes/cardinal-system_cardinal-db/_data/cardinal.db"),
    )
)
LOCAL_DB = REPO / "cardinal.db"

PROVIDERS = [
    {
        "name": "opencode-zen",
        "base_url": "http://host.containers.internal:4010/v1",
        "wire_format": "openai",
        "status": "active",
        "cost_per_mtok": 0.0,
        "models": [
            "opencode/deepseek-v4-flash-free",
            "opencode/glm-4-flash-free",
            "opencode/gemini-2.5-flash-free",
        ],
    },
    {
        "name": "mock-local",
        "base_url": "http://host.containers.internal:18999/v1",
        "wire_format": "openai",
        "status": "active",
        "cost_per_mtok": 0.0,
        "models": ["test-model"],
    },
]

ROUTES = [
    {
        "alias": "fast",
        "fallback_chain": [
            {"provider": "opencode-zen", "model": "opencode/deepseek-v4-flash-free"},
            {"provider": "mock-local", "model": "test-model"},
        ],
    },
    {
        "alias": "reasoning",
        "fallback_chain": [
            {"provider": "opencode-zen", "model": "opencode/glm-4-flash-free"},
            {"provider": "mock-local", "model": "test-model"},
        ],
    },
]


def resolve_db_path(custom_path: str | None) -> Path:
    if custom_path:
        return Path(custom_path)
    if DEFAULT_DB.exists():
        return DEFAULT_DB
    return LOCAL_DB


def seed(db_path: Path, dry_run: bool = False) -> None:
    if not db_path.exists() and not dry_run:
        sys.exit(f"ERROR: database file not found at {db_path}")

    print(f"Connecting to database: {db_path}")
    if dry_run:
        print("[dry-run] Planned seed:")
        for p in PROVIDERS:
            print(f"  Provider: {p['name']} ({p['base_url']}) models={p['models']}")
        for r in ROUTES:
            print(f"  Route: {r['alias']} -> {r['fallback_chain']}")
        return

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    try:
        # Seed providers
        for p in PROVIDERS:
            cur.execute(
                """
                INSERT INTO providers (name, base_url, wire_format, status, cost_per_mtok)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(name) DO UPDATE SET
                    base_url = excluded.base_url,
                    wire_format = excluded.wire_format,
                    status = excluded.status,
                    cost_per_mtok = excluded.cost_per_mtok
                """,
                (p["name"], p["base_url"], p["wire_format"], p["status"], p["cost_per_mtok"]),
            )
            cur.execute("SELECT id FROM providers WHERE name = ?", (p["name"],))
            provider_id = cur.fetchone()[0]

            for model_id in p["models"]:
                cur.execute(
                    """
                    INSERT INTO provider_models (provider_id, model_id)
                    VALUES (?, ?)
                    ON CONFLICT(provider_id, model_id) DO NOTHING
                    """,
                    (provider_id, model_id),
                )
            print(f"  ✓ Provider seeded: {p['name']} ({len(p['models'])} models)")

        # Seed routes
        for r in ROUTES:
            chain_json = json.dumps(r["fallback_chain"])
            cur.execute(
                """
                INSERT INTO model_routes (alias, fallback_chain)
                VALUES (?, ?)
                ON CONFLICT(alias) DO UPDATE SET fallback_chain = excluded.fallback_chain
                """,
                (r["alias"], chain_json),
            )
            print(f"  ✓ Route seeded: {r['alias']}")

        conn.commit()
        print("✓ Router database seeding complete.")
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Cardinal router providers and routes")
    parser.add_argument("--db", type=str, help="Path to SQLite database file")
    parser.add_argument("--dry-run", action="store_true", help="Print actions without modifying DB")
    args = parser.parse_args()

    db_path = resolve_db_path(args.db)
    seed(db_path, dry_run=args.dry_run)


if __name__ == "__main__":
    main()

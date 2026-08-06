#!/usr/bin/env python3
"""seed-sessions.py — Indexa sesiones de perfiles Hermes al Cardinal (Fase 1.5.2).

Lee ~/.hermes/profiles/*/state.db (tabla sessions) y las inserta en
sessions_index de la DB del Cardinal (volume cardinal-system_cardinal-db).
Solo metadata: id, título, modelo, contadores, costos — NO lee mensajes.

Uso: python3 scripts/seed-sessions.py [--dry-run] [--limit N]
Requisitos: podman volume cardinal-system_cardinal-db montado.
"""
import argparse
import os
import sqlite3
import sys
from pathlib import Path

HERMES_PROFILES = Path.home() / ".hermes" / "profiles"
DB_HOST = Path(
    os.environ.get(
        "CARDINAL_DB_HOST",
        os.path.expanduser("~/.local/share/containers/storage/volumes/cardinal-system_cardinal-db/_data/cardinal.db"),
    )
)

# Columnas de sessions (Hermes state.db) → sessions_index (Cardinal)
MAP = {
    "id": "id",
    "profile_name": "profile_name",
    "title": "title",
    "model": "model",
    "started_at": "started_at",
    "message_count": "message_count",
    "input_tokens": "input_tokens",
    "output_tokens": "output_tokens",
    "estimated_cost_usd": "estimated_cost",
}


def index_profile(state_db: Path, dry_run: bool, limit: int) -> tuple[int, int]:
    """Retorna (leídas, insertadas)."""
    if not state_db.exists():
        return 0, 0
    conn = sqlite3.connect(f"file:{state_db}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        cols = [c[1] for c in conn.execute("PRAGMA table_info(sessions)").fetchall()]
        # profile_name: de la columna si existe, si no del nombre del dir
        fallback_profile = state_db.parent.name
        src_cols = [c for c in MAP if c in cols]
        if "profile_name" not in src_cols:
            src_cols.append("profile_name")
        select = ", ".join(src_cols)
        rows = conn.execute(f"SELECT {select} FROM sessions ORDER BY started_at DESC").fetchall()
        if limit:
            rows = rows[:limit]
        read = len(rows)
        if dry_run or not DB_HOST.exists():
            if dry_run:
                print(f"  [dry-run] {state_db.parent.name}: {read} sesiones leídas")
            else:
                print(f"  ✗ DB Cardinal no encontrada en {DB_HOST}")
            return read, 0
        card = sqlite3.connect(DB_HOST)
        try:
            inserted = 0
            for row in rows:
                data = dict(row)
                profile = data.get("profile_name") or fallback_profile
                if not profile:
                    continue
                card.execute(
                    """INSERT INTO sessions_index
                       (id, profile_name, title, model, started_at, message_count,
                        input_tokens, output_tokens, estimated_cost)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                       ON CONFLICT(id) DO UPDATE SET
                         profile_name = excluded.profile_name,
                         title = excluded.title,
                         model = excluded.model,
                         started_at = excluded.started_at,
                         message_count = excluded.message_count,
                         input_tokens = excluded.input_tokens,
                         output_tokens = excluded.output_tokens,
                         estimated_cost = excluded.estimated_cost""",
                    (
                        data.get("id"),
                        profile,
                        data.get("title"),
                        data.get("model"),
                        data.get("started_at"),
                        data.get("message_count") or 0,
                        data.get("input_tokens") or 0,
                        data.get("output_tokens") or 0,
                        data.get("estimated_cost_usd") or 0,
                    ),
                )
                inserted += 1
            card.commit()
            return read, inserted
        finally:
            card.close()
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0, help="máx sesiones por perfil")
    args = parser.parse_args()

    dbs = sorted(HERMES_PROFILES.glob("*/state.db"))
    if not dbs:
        sys.exit(f"No hay state.db en {HERMES_PROFILES}")

    total_read = total_ins = 0
    for db in dbs:
        name = db.parent.name
        read, ins = index_profile(db, args.dry_run, args.limit)
        print(f"✓ {name}: {read} leídas, {ins} insertadas")
        total_read += read
        total_ins += ins

    print(f"\nResultado: {total_read} sesiones leídas, {total_ins} en Cardinal")
    if args.dry_run:
        print("(dry-run — no se escribió nada)")


if __name__ == "__main__":
    main()

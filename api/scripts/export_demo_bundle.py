"""One-off exporter: dump a completed paper + related rows into app/seed/demo_bundle.json.

Usage (from repo root):
  cd api && python scripts/export_demo_bundle.py

Edit SOURCE_PAPER_ID if you want a different completed paper from rxevidence.db.
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

SOURCE_PAPER_ID = "e793e16f-5016-47ba-83fb-5d123c896a9c"
API_DIR = Path(__file__).resolve().parent.parent
DB_PATH = API_DIR / "rxevidence.db"
OUT_PATH = API_DIR / "app" / "seed" / "demo_bundle.json"


def _rows(conn: sqlite3.Connection, sql: str, params=()) -> list[dict]:
    cur = conn.execute(sql, params)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    bundle: dict = {"paper_id": SOURCE_PAPER_ID, "tables": {}}
    bundle["tables"]["papers"] = _rows(conn, "SELECT * FROM papers WHERE id = ?", (SOURCE_PAPER_ID,))
    if not bundle["tables"]["papers"]:
        raise SystemExit(f"No paper {SOURCE_PAPER_ID} in {DB_PATH}")
    bundle["tables"]["analysis_runs"] = _rows(conn, "SELECT * FROM analysis_runs WHERE paper_id = ?", (SOURCE_PAPER_ID,))
    run_ids = [r["id"] for r in bundle["tables"]["analysis_runs"]]
    bundle["tables"]["findings"] = _rows(conn, "SELECT * FROM findings WHERE paper_id = ?", (SOURCE_PAPER_ID,))
    finding_ids = [r["id"] for r in bundle["tables"]["findings"]]
    sources: list[dict] = []
    for fid in finding_ids:
        sources.extend(_rows(conn, "SELECT * FROM finding_sources WHERE finding_id = ?", (fid,)))
    bundle["tables"]["finding_sources"] = sources
    bundle["tables"]["pico_snapshots"] = _rows(conn, "SELECT * FROM pico_snapshots WHERE paper_id = ?", (SOURCE_PAPER_ID,))
    bundle["tables"]["risk_limitations"] = _rows(conn, "SELECT * FROM risk_limitations WHERE paper_id = ?", (SOURCE_PAPER_ID,))
    bundle["tables"]["observability_events"] = _rows(conn, "SELECT * FROM observability_events WHERE paper_id = ?", (SOURCE_PAPER_ID,))
    conn.close()

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(bundle, indent=2, default=str), encoding="utf-8")
    print(f"Wrote {OUT_PATH} ({len(bundle['tables']['findings'])} findings, {len(bundle['tables']['observability_events'])} events)")


if __name__ == "__main__":
    main()

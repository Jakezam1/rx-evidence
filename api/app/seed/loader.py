"""Load pre-analyzed PARADIGM-HF (NEJMoa1409077) demo into an empty database.

Runs once at API startup when AUTO_SEED_DEMO is true (default) and the demo
paper id is not already present. Used on Render so “Try the demo” works on a
cold Postgres without calling the LLM.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.db import models
from app.seed.constants import BUNDLED_DEMO_PAPER_ID

logger = logging.getLogger(__name__)

_SEED_DIR = Path(__file__).resolve().parent
_BUNDLE_PATH = _SEED_DIR / "demo_bundle.json"
_PDF_PATH = _SEED_DIR / f"{BUNDLED_DEMO_PAPER_ID}.pdf"


def _coerce_dt(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    s = str(value).replace(" ", "T", 1)
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _maybe_json(value: Any) -> Any:
    if value is None:
        return {}
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return {}
    return {}


def _as_dict(value: Any) -> dict:
    j = _maybe_json(value)
    return j if isinstance(j, dict) else {}


def _as_list(value: Any) -> list:
    j = _maybe_json(value)
    return j if isinstance(j, list) else []


def seed_demo_paper_if_configured(db: Session) -> None:
    flag = os.getenv("AUTO_SEED_DEMO", "true").strip().lower()
    if flag not in {"1", "true", "yes", "on"}:
        return
    if not _BUNDLE_PATH.is_file() or not _PDF_PATH.is_file():
        logger.warning("Demo seed skipped: missing %s or %s", _BUNDLE_PATH, _PDF_PATH)
        return
    if db.query(models.Paper).filter(models.Paper.id == BUNDLED_DEMO_PAPER_ID).first():
        return

    raw = json.loads(_BUNDLE_PATH.read_text(encoding="utf-8"))
    tables = raw.get("tables") or {}
    try:
        for row in tables.get("papers", []):
            db.add(
                models.Paper(
                    id=row["id"],
                    file_name=row["file_name"],
                    sha256=row["sha256"],
                    status=row["status"],
                    total_pages=row.get("total_pages"),
                    uploaded_at=_coerce_dt(row.get("uploaded_at")),
                    processed_at=_coerce_dt(row.get("processed_at")),
                )
            )
        for row in tables.get("analysis_runs", []):
            db.add(
                models.AnalysisRun(
                    id=row["id"],
                    paper_id=row["paper_id"],
                    model=row["model"],
                    prompt_version=row["prompt_version"],
                    status=row["status"],
                    started_at=_coerce_dt(row.get("started_at")),
                    completed_at=_coerce_dt(row.get("completed_at")),
                    input_tokens=row.get("input_tokens"),
                    output_tokens=row.get("output_tokens"),
                    latency_ms=row.get("latency_ms"),
                    error_message=row.get("error_message"),
                )
            )
        for row in tables.get("findings", []):
            db.add(
                models.Finding(
                    id=row["id"],
                    paper_id=row["paper_id"],
                    analysis_run_id=row["analysis_run_id"],
                    category=row["category"],
                    title=row["title"],
                    summary=row["summary"],
                    clinical_implication=row["clinical_implication"],
                    statistics_json=_as_dict(row.get("statistics_json")),
                    confidence_level=row["confidence_level"],
                    evidence_strength_score=row.get("evidence_strength_score"),
                    review_status=row.get("review_status") or "unreviewed",
                    review_note=row.get("review_note"),
                    created_at=_coerce_dt(row.get("created_at")) or datetime.now(),
                    updated_at=_coerce_dt(row.get("updated_at")) or datetime.now(),
                )
            )
        for row in tables.get("finding_sources", []):
            db.add(
                models.FindingSource(
                    id=row["id"],
                    finding_id=row["finding_id"],
                    text_excerpt=row["text_excerpt"],
                    section_name=row["section_name"],
                    page_hint=row["page_hint"],
                    paragraph_hint=row.get("paragraph_hint"),
                    anchor_type=row.get("anchor_type") or "paraphrase",
                    anchor_match_score=row.get("anchor_match_score"),
                )
            )
        for row in tables.get("pico_snapshots", []):
            db.add(
                models.PicoSnapshot(
                    id=row["id"],
                    paper_id=row["paper_id"],
                    population=row.get("population"),
                    intervention=row.get("intervention"),
                    comparator=row.get("comparator"),
                    outcomes_json=_as_list(row.get("outcomes_json")),
                )
            )
        for row in tables.get("risk_limitations", []):
            db.add(
                models.RiskLimitations(
                    id=row["id"],
                    paper_id=row["paper_id"],
                    internal_validity=row.get("internal_validity"),
                    external_validity=row.get("external_validity"),
                    sponsorship_conflict=row.get("sponsorship_conflict"),
                    composite_endpoint_assessment=row.get("composite_endpoint_assessment"),
                    subgroup_assessment=row.get("subgroup_assessment"),
                )
            )
        for row in tables.get("observability_events", []):
            db.add(
                models.ObservabilityEvent(
                    id=row["id"],
                    paper_id=row["paper_id"],
                    analysis_run_id=row.get("analysis_run_id"),
                    stage=row["stage"],
                    level=row["level"],
                    message=row["message"],
                    metadata_json=_as_dict(row.get("metadata_json")),
                    created_at=_coerce_dt(row.get("created_at")) or datetime.now(),
                )
            )

        pdf_bytes = _PDF_PATH.read_bytes()
        # Defer import so this module does not import papers at load time (avoids cycles).
        from app.api.routes.papers import set_pdf_bytes

        set_pdf_bytes(BUNDLED_DEMO_PAPER_ID, pdf_bytes)

        db.commit()
        logger.info("Seeded demo paper %s (%d findings)", BUNDLED_DEMO_PAPER_ID, len(tables.get("findings", [])))
    except Exception:
        db.rollback()
        logger.exception("Demo seed failed; database left unchanged")

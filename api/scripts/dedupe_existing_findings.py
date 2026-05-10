"""Apply the same dedupe rules used in the analysis pipeline to existing DB rows.

Usage:
    cd rx-evidence/api
    source .venv/bin/activate
    python -m scripts.dedupe_existing_findings <paper_id> [--dry-run]

The script:
1. Loads all Finding rows for the given paper_id.
2. Drops 'stub' findings — those in a required-stats category (primary_outcome,
   secondary_outcome, safety) with zero of the six required statistical slots
   populated (HR, CI95, pValue, ARR, NNT, absoluteEvents).
3. Clusters the remaining findings by Jaccard similarity (>=0.5) on normalized
   title tokens within the same category, keeping the variant with the most
   populated required slots (tiebreak: longer summary, more source passages).
4. Deletes the losing rows from `findings` and their related `finding_sources`.

Run with --dry-run first to preview what would be deleted.
"""
from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from typing import Optional

from sqlalchemy.orm import Session

from app.db import models
from app.db.session import SessionLocal
from app.services.analyze_pipeline import (
    DEDUPE_JACCARD_THRESHOLD,
    DEDUPE_REQUIRED_STAT_KEYS,
    _jaccard,
    _normalize_title_tokens,
    _stats_fingerprint,
)
from app.schemas.finding import STATS_REQUIRED_CATEGORIES


def _populated_required_stat_count_from_row(row: models.Finding) -> int:
    stats = row.statistics_json or {}
    if not isinstance(stats, dict):
        return 0
    return sum(1 for key in DEDUPE_REQUIRED_STAT_KEYS if stats.get(key) not in (None, ""))


def _score_row(row: models.Finding) -> tuple[int, int, int]:
    populated = _populated_required_stat_count_from_row(row)
    source_count = (
        SessionLocal()
        .query(models.FindingSource)
        .filter(models.FindingSource.finding_id == row.id)
        .count()
    )
    return (populated, len(row.summary or ""), source_count)


def dedupe_paper(db: Session, paper_id: str, dry_run: bool) -> dict:
    rows = (
        db.query(models.Finding)
        .filter(models.Finding.paper_id == paper_id)
        .all()
    )
    if not rows:
        return {"total": 0, "stub_dropped": [], "duplicates_dropped": [], "kept": []}

    surviving: list[models.Finding] = []
    stub_dropped: list[dict] = []
    duplicates_dropped: list[dict] = []

    for row in rows:
        if row.category in STATS_REQUIRED_CATEGORIES:
            if _populated_required_stat_count_from_row(row) == 0:
                stub_dropped.append({
                    "id": row.id,
                    "title": row.title,
                    "category": row.category,
                })
                continue
        surviving.append(row)

    clusters: list[list[models.Finding]] = []
    for row in surviving:
        row_tokens = _normalize_title_tokens(row.title)
        if not row_tokens:
            clusters.append([row])
            continue
        matched = False
        for cluster in clusters:
            head = cluster[0]
            if head.category != row.category:
                continue
            head_tokens = _normalize_title_tokens(head.title)
            if _jaccard(row_tokens, head_tokens) >= DEDUPE_JACCARD_THRESHOLD:
                cluster.append(row)
                matched = True
                break
        if not matched:
            clusters.append([row])

    kept_after_titles: list[models.Finding] = []
    for cluster in clusters:
        if len(cluster) == 1:
            kept_after_titles.append(cluster[0])
            continue
        winner = max(cluster, key=_score_row)
        kept_after_titles.append(winner)
        for loser in cluster:
            if loser is winner:
                continue
            duplicates_dropped.append({
                "id": loser.id,
                "title": loser.title,
                "category": loser.category,
                "kept_id": winner.id,
                "kept_title": winner.title,
                "reason": "duplicate_title",
            })

    fingerprint_groups: dict[tuple[str, tuple[str, ...]], list[models.Finding]] = {}
    no_fingerprint: list[models.Finding] = []
    for row in kept_after_titles:
        fp = _stats_fingerprint(row.statistics_json)
        if fp is None:
            no_fingerprint.append(row)
            continue
        key = (row.category, fp)
        fingerprint_groups.setdefault(key, []).append(row)

    kept: list[models.Finding] = list(no_fingerprint)
    for group in fingerprint_groups.values():
        if len(group) == 1:
            kept.append(group[0])
            continue
        winner = max(group, key=_score_row)
        kept.append(winner)
        for loser in group:
            if loser is winner:
                continue
            duplicates_dropped.append({
                "id": loser.id,
                "title": loser.title,
                "category": loser.category,
                "kept_id": winner.id,
                "kept_title": winner.title,
                "reason": "duplicate_statistics_fingerprint",
            })

    ids_to_delete = [d["id"] for d in stub_dropped] + [d["id"] for d in duplicates_dropped]

    if ids_to_delete and not dry_run:
        db.query(models.FindingSource).filter(
            models.FindingSource.finding_id.in_(ids_to_delete)
        ).delete(synchronize_session=False)
        db.query(models.Finding).filter(
            models.Finding.id.in_(ids_to_delete)
        ).delete(synchronize_session=False)
        db.commit()

    return {
        "total": len(rows),
        "stub_dropped": stub_dropped,
        "duplicates_dropped": duplicates_dropped,
        "kept": [{"id": r.id, "title": r.title, "category": r.category} for r in kept],
    }


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Dedupe findings for a paper.")
    parser.add_argument("paper_id", help="Paper UUID to clean up")
    parser.add_argument("--dry-run", action="store_true", help="Preview only, do not delete")
    args = parser.parse_args(argv)

    db = SessionLocal()
    try:
        result = dedupe_paper(db, args.paper_id, args.dry_run)
    finally:
        db.close()

    print(f"Paper: {args.paper_id}")
    print(f"Total findings before: {result['total']}")
    print(f"Stub drops: {len(result['stub_dropped'])}")
    for d in result["stub_dropped"]:
        print(f"  - [{d['category']}] {d['title']}")
    print(f"Duplicate drops: {len(result['duplicates_dropped'])}")
    for d in result["duplicates_dropped"]:
        reason = d.get("reason", "duplicate")
        print(f"  - [{d['category']}] {d['title']}  ({reason})")
        print(f"      kept: {d['kept_title']}")
    print(f"Findings remaining: {len(result['kept'])}")
    print()
    print("Kept findings:")
    by_category: dict[str, list[dict]] = defaultdict(list)
    for r in result["kept"]:
        by_category[r["category"]].append(r)
    for category in sorted(by_category.keys()):
        for r in by_category[category]:
            print(f"  [{category}] {r['title']}")

    if args.dry_run:
        print()
        print("Dry-run only. Re-run without --dry-run to apply.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

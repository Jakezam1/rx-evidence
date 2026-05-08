import json
import os
import re
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import models
from app.schemas.finding import Finding, STATS_REQUIRED_CATEGORIES, STATS_SLOT_KEYS
from app.services.evidence_anchor import classify_anchor, score_anchor
from app.services.llm import generate_json, get_model, get_provider
from app.services.section_splitter import split_sections


def _is_parallel_enabled() -> bool:
    return os.getenv("PARALLEL_SECTIONS", "false").strip().lower() in {"1", "true", "yes", "on"}


def _max_workers() -> int:
    try:
        return max(1, int(os.getenv("MAX_PARALLEL_WORKERS", "3")))
    except ValueError:
        return 4

PROMPT_VERSION = "findings_v2"
MAX_FINDINGS_PER_PAPER = 16
MAX_FINDINGS_RESULTS_SECTION = 6
MAX_FINDINGS_OTHER_SECTION = 3
CATEGORY_PRIORITY = {
    "primary_outcome": 0,
    "secondary_outcome": 1,
    "safety": 2,
    "bias": 3,
    "generalizability": 4,
    "population": 5,
    "methods": 6,
    "context": 7,
}

# Used by the dedupe pass — these are the six required statistical slots for any
# primary_outcome / secondary_outcome / safety finding. A finding in one of those
# categories with zero of these slots filled is treated as a 'stub' and dropped.
DEDUPE_REQUIRED_STAT_KEYS = ("HR", "CI95", "pValue", "ARR", "NNT", "absoluteEvents")
DEDUPE_TITLE_STOPWORDS = {
    "a", "an", "the", "in", "of", "for", "and", "with", "is", "was", "were",
    "are", "to", "by", "on", "at", "as", "vs", "versus", "from",
}
DEDUPE_JACCARD_THRESHOLD = 0.6
DEDUPE_STATS_FINGERPRINT_KEYS = ("HR", "CI95", "pValue")


def _is_results_section(section_name: str) -> bool:
    return "result" in (section_name or "").lower()


def _section_cap(section_name: str) -> int:
    return MAX_FINDINGS_RESULTS_SECTION if _is_results_section(section_name) else MAX_FINDINGS_OTHER_SECTION


def _populated_required_stat_count(statistics: Any) -> int:
    """Count how many of the 6 required statistical slots are populated.

    Accepts a Pydantic statistics object (with model_dump) or a dict.
    A slot is 'populated' when its value is not None and not an empty string.
    """
    if statistics is None:
        return 0
    if hasattr(statistics, "model_dump"):
        stats = statistics.model_dump()
    elif isinstance(statistics, dict):
        stats = statistics
    else:
        return 0
    return sum(1 for key in DEDUPE_REQUIRED_STAT_KEYS if stats.get(key) not in (None, ""))


def _normalize_title_tokens(title: str) -> set[str]:
    """Lowercase, strip non-alphanumeric, drop common stopwords for fuzzy matching."""
    if not title:
        return set()
    words = re.findall(r"[a-z0-9]+", title.lower())
    return {w for w in words if w not in DEDUPE_TITLE_STOPWORDS}


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    intersection = len(a & b)
    union = len(a | b)
    return intersection / union if union > 0 else 0.0


def _stats_fingerprint(statistics: Any) -> Optional[tuple[str, ...]]:
    """Return a tuple of normalized values for (HR, CI95, pValue), or None if any are unreported.

    Two findings with identical fingerprints almost certainly refer to the same
    statistical claim regardless of how the LLM worded the title.
    """
    if statistics is None:
        return None
    if hasattr(statistics, "model_dump"):
        stats = statistics.model_dump()
    elif isinstance(statistics, dict):
        stats = statistics
    else:
        return None

    parts: list[str] = []
    for key in DEDUPE_STATS_FINGERPRINT_KEYS:
        value = stats.get(key)
        if value in (None, ""):
            return None
        text = str(value).lower()
        # Collapse all range/connector forms to a single separator: "0.73 to 0.87",
        # "0.73–0.87", "0.73-0.87" all normalize to the same string.
        text = text.replace("\u2013", "-").replace("\u2014", "-")
        text = re.sub(r"\bto\b", "-", text)
        text = re.sub(r"\s+", "", text)
        normalized = re.sub(r"-+", "-", text)
        parts.append(normalized)
    return tuple(parts)


def _dedupe_findings(
    candidates: list[tuple[int, int, Finding, dict]],
) -> tuple[list[tuple[int, int, Finding, dict]], list[dict]]:
    """Drop stub findings and merge near-duplicate findings by title similarity.

    Returns (kept, dropped_summaries). Each dropped summary describes why the
    finding was removed, suitable for observability logging.

    Rules:
    1. Stub drop: any finding whose category requires statistics and whose
       statistics object has zero of the six required slots populated is dropped.
    2. Cluster: remaining findings are grouped by Jaccard similarity on
       normalized title tokens (>= 0.5). Only findings of the same category can
       cluster together.
    3. Keep: within each cluster, the finding with the most populated required
       slots wins; tiebreaks are longer summary, then more source passages.
    """
    dropped: list[dict] = []

    stage_one: list[tuple[int, int, Finding, dict]] = []
    for entry in candidates:
        _, _, finding, _ = entry
        if finding.category in STATS_REQUIRED_CATEGORIES:
            populated = _populated_required_stat_count(finding.statistics)
            if populated == 0:
                dropped.append({
                    "reason": "stub_no_stats",
                    "title": finding.title,
                    "category": finding.category,
                })
                continue
        stage_one.append(entry)

    clusters: list[list[tuple[int, int, Finding, dict]]] = []
    for entry in stage_one:
        _, _, finding, _ = entry
        entry_tokens = _normalize_title_tokens(finding.title)
        if not entry_tokens:
            clusters.append([entry])
            continue
        matched = False
        for cluster in clusters:
            head_finding = cluster[0][2]
            if head_finding.category != finding.category:
                continue
            head_tokens = _normalize_title_tokens(head_finding.title)
            if _jaccard(entry_tokens, head_tokens) >= DEDUPE_JACCARD_THRESHOLD:
                cluster.append(entry)
                matched = True
                break
        if not matched:
            clusters.append([entry])

    def _score(entry: tuple[int, int, Finding, dict]) -> tuple[int, int, int]:
        _, _, finding, _ = entry
        return (
            _populated_required_stat_count(finding.statistics),
            len(finding.summary or ""),
            len(finding.sourcePassages or []),
        )

    kept_after_titles: list[tuple[int, int, Finding, dict]] = []
    for cluster in clusters:
        if len(cluster) == 1:
            kept_after_titles.append(cluster[0])
            continue
        winner = max(cluster, key=_score)
        kept_after_titles.append(winner)
        for loser in cluster:
            if loser is winner:
                continue
            _, _, loser_finding, _ = loser
            dropped.append({
                "reason": "duplicate_title",
                "title": loser_finding.title,
                "category": loser_finding.category,
                "kept_title": winner[2].title,
            })

    fingerprint_groups: dict[tuple[str, tuple[str, ...]], list[tuple[int, int, Finding, dict]]] = {}
    no_fingerprint: list[tuple[int, int, Finding, dict]] = []
    for entry in kept_after_titles:
        _, _, finding, _ = entry
        fp = _stats_fingerprint(finding.statistics)
        if fp is None:
            no_fingerprint.append(entry)
            continue
        key = (finding.category, fp)
        fingerprint_groups.setdefault(key, []).append(entry)

    kept: list[tuple[int, int, Finding, dict]] = list(no_fingerprint)
    for group in fingerprint_groups.values():
        if len(group) == 1:
            kept.append(group[0])
            continue
        winner = max(group, key=_score)
        kept.append(winner)
        for loser in group:
            if loser is winner:
                continue
            _, _, loser_finding, _ = loser
            dropped.append({
                "reason": "duplicate_statistics_fingerprint",
                "title": loser_finding.title,
                "category": loser_finding.category,
                "kept_title": winner[2].title,
            })

    return kept, dropped


def _log(db: Session, paper_id: str, run_id: str, stage: str, level: str, message: str, metadata: Optional[dict] = None):
    event = models.ObservabilityEvent(
        id=str(uuid.uuid4()),
        paper_id=paper_id,
        analysis_run_id=run_id,
        stage=stage,
        level=level,
        message=message,
        metadata_json=metadata or {},
    )
    db.add(event)
    db.commit()


def _findings_prompt(section: dict) -> str:
    section_name = section["sectionName"]
    section_cap = _section_cap(section_name)
    text_budget = 32000 if _is_results_section(section_name) else 18000
    return f"""
You are a clinical pharmacist and evidence-based medicine expert specializing in randomized controlled trials.
You are analyzing ONE section of a paper. Return ONLY a valid JSON array (no markdown fences, no preamble).

==== OUTPUT SCHEMA ====
Each finding object MUST include exactly these keys:
{{
  "id": "<string>",
  "category": "primary_outcome" | "secondary_outcome" | "population" | "methods" | "bias" | "safety" | "generalizability" | "context",
  "title": "<3-7 words>",
  "summary": "<1-3 sentences, plain language for a clinical pharmacist>",
  "clinicalImplication": "<1 sentence on practice impact>",
  "whyItMatters": "<1 sentence on decision-making relevance>",
  "confidenceLevel": "high" | "moderate" | "low",
  "confidenceRationale": "<1 sentence justifying the confidence>",
  "clinicalRelevance": "high" | "medium" | "low",
  "practiceChangeSignal": "change" | "consider" | "no_change",
  "isCompositeEndpoint": true | false,
  "compositeComponents": ["<component>", ...],
  "statistics": {{
    "HR": "<string or null>",
    "RR": "<string or null>",
    "OR": "<string or null>",
    "CI95": "<string or null>",
    "pValue": "<string or null>",
    "ARR": "<string or null>",
    "RRR": "<string or null>",
    "NNT": <integer or null>,
    "NNH": <integer or null>,
    "absoluteEvents": "<string or null>"
  }},
  "sourcePassages": [
    {{ "text": "<verbatim or close paraphrase>", "sectionName": "<string>", "pageHint": "<string>", "paragraphHint": "<string or null>", "anchorType": "verbatim" | "paraphrase" }}
  ]
}}

==== RULES (apply IN ORDER) ====

1. STATISTICAL SLOTS — for category in [primary_outcome, secondary_outcome, safety]:
   - Emit the FULL statistics object above with EVERY key present.
   - If a value is not reported in the paper, set it to null. DO NOT omit the key.
   - Nulls are diagnostic — they reveal reporting gaps the clinician needs to see.
   - For other categories you may pass {{}} if no statistics apply.

2. EFFECT SIZE EXTRACTION — for outcome and safety findings:
   - Bind each effect estimate (HR, RR, OR) in the section to a single finding.
   - If event rates per arm are reported (e.g., "21.8% vs 26.5%"), compute:
     - ARR = control rate − intervention rate (preserve sign; negative ARR = harm).
     - NNT = ceil(1 / |ARR|) when ARR is favorable; NNH when ARR is unfavorable.
   - Always include CI95 when an effect estimate is reported.
   - Always include pValue when present. If the paper says "p = NS" or "non-significant" without a number, set pValue to "NS".

3. COMPOSITE ENDPOINTS:
   - If a primary or secondary outcome is a composite (e.g., MACE, "CV death or HF hospitalization"), set isCompositeEndpoint=true and list every component in compositeComponents.
   - If component-level breakdowns are reported, mention them in summary.

4. SOURCE PASSAGES:
   - Every finding requires 1-3 source passages. NEVER return more than 3.
   - For outcome and safety findings, at least one source passage MUST contain a digit (the numerical anchor in the paper).
   - Order passages by clinical evidentiary weight, HIGHEST FIRST:
     a. The sentence containing the primary numerical anchor (HR, RR, OR, event rates, or p-value).
     b. The sentence containing the 95% confidence interval, if reported separately.
     c. The supporting contextual sentence (population, comparator, follow-up window).
   - If you have more than 3 candidate passages, drop contextual passages before statistical ones — never the reverse.
   - Prefer verbatim quotes for statistical claims; paraphrase is acceptable for narrative findings.

5. QUALITY GATE — drop the finding entirely if:
   - It is generic ("Study used randomization", "Patients were followed up") with no clinical implication.
   - It is a Background/Introduction restatement.
   - It is a methods detail with no impact on interpretation.

6. PRIORITY AND QUANTITY:
   - Order findings: primary_outcome → secondary_outcome → safety → bias → generalizability → population → methods → context.
   - Maximum {section_cap} findings for this section.
   - Prefer 1 deep, statistics-rich finding over 3 shallow ones.

7. CLINICAL PHARMACIST LENS:
   - Distinguish statistical from clinical significance. Flag in confidenceRationale when p<0.05 attaches to a clinically trivial effect.
   - Note whether the comparator is placebo vs active control when relevant.
   - Flag industry sponsorship or conflicts of interest if mentioned in this section.

==== INPUT ====
Section name: {section_name}
Pages: {section["pageStart"]}-{section["pageEnd"]}
Text:
{section["text"][:text_budget]}
"""


def _simple_prompt(kind: str, full_text: str) -> str:
    return f"""
You are reviewing an RCT paper as a clinical pharmacist.
Return only valid JSON.

Task: {kind}
Text:
{full_text[:30000]}
"""


_DIGIT_RE = re.compile(r"\d")


def _passage_priority(passage: dict) -> tuple:
    """Score a source passage for clinical evidentiary weight.

    Used only when the model returns MORE than the schema cap (3). Goal: keep
    passages with statistical content; drop narrative ones when forced to choose.
    NOTE: length is intentionally NOT a factor — statistical table rows like
    "Cough 474 (11.3) 601 (14.3) <0.001" are short BUT are the most important
    passages. Higher tuple sorts first.
    """
    text = str(passage.get("text") or "")
    has_digit = bool(_DIGIT_RE.search(text))
    is_verbatim = passage.get("anchorType") == "verbatim"
    return (has_digit, is_verbatim)


def _normalize_finding_payload(item: dict, fallback_id: str) -> dict:
    normalized = dict(item)
    raw_id = normalized.get("id")
    normalized["id"] = str(raw_id) if raw_id is not None else fallback_id
    if normalized.get("clinicalRelevance") not in ("high", "medium", "low"):
        normalized["clinicalRelevance"] = "medium"
    if normalized.get("practiceChangeSignal") not in ("change", "consider", "no_change"):
        normalized["practiceChangeSignal"] = "consider"
    normalized["confidenceRationale"] = str(normalized.get("confidenceRationale") or "").strip()
    normalized["whyItMatters"] = str(normalized.get("whyItMatters") or "").strip()

    normalized["isCompositeEndpoint"] = bool(normalized.get("isCompositeEndpoint"))
    components = normalized.get("compositeComponents") or []
    if not isinstance(components, list):
        components = []
    normalized["compositeComponents"] = [str(c).strip() for c in components if str(c).strip()]

    category = normalized.get("category")
    stats = normalized.get("statistics")
    if not isinstance(stats, dict):
        stats = {}
    if category in STATS_REQUIRED_CATEGORIES:
        for key in STATS_SLOT_KEYS:
            if key not in stats:
                stats[key] = None
    normalized["statistics"] = stats

    source_passages = normalized.get("sourcePassages")
    if isinstance(source_passages, list):
        fixed_sources = []
        for source in source_passages:
            if not isinstance(source, dict):
                continue
            source_copy = dict(source)
            anchor_type = source_copy.get("anchorType")
            if anchor_type not in ("verbatim", "paraphrase"):
                source_copy["anchorType"] = "paraphrase"
            fixed_sources.append(source_copy)
        # Schema caps sourcePassages at 3. If the model returned more, keep the
        # 3 with the highest evidentiary weight (digits > verbatim), using
        # original index as a stable tiebreaker. Under the cap, pass through.
        # We restore document order at the end so passages read in narrative flow.
        if len(fixed_sources) > 3:
            indexed = list(enumerate(fixed_sources))
            indexed.sort(key=lambda pair: (_passage_priority(pair[1]), -pair[0]), reverse=True)
            keep_indices = sorted(idx for idx, _ in indexed[:3])
            fixed_sources = [fixed_sources[i] for i in keep_indices]
        normalized["sourcePassages"] = fixed_sources

    return normalized


def _stable_finding_id(run_id: str, section_index: int, finding_index: int, candidate_id: str) -> str:
    safe_candidate = "".join(ch for ch in str(candidate_id) if ch.isalnum() or ch in ("-", "_"))
    if not safe_candidate:
        safe_candidate = "finding"
    return f"{run_id[:8]}-{section_index}-{finding_index}-{safe_candidate}"[:120]


def _has_meaningful_statistics(finding: Finding) -> bool:
    return bool(finding.statistics.model_dump(exclude_none=True))


def _is_useful_finding(finding: Finding) -> bool:
    summary_words = len(finding.summary.split())
    if summary_words < 12:
        return False
    if not finding.sourcePassages:
        return False
    if not any(len(src.text.strip()) >= 20 for src in finding.sourcePassages):
        return False
    if len(finding.whyItMatters.split()) < 6:
        return False
    if len(finding.confidenceRationale.split()) < 4:
        return False

    if finding.category in {"methods", "context"}:
        if finding.confidenceLevel != "high" and not _has_meaningful_statistics(finding):
            return False

    weak_titles = {"study design", "background", "introduction"}
    if finding.title.strip().lower() in weak_titles and not _has_meaningful_statistics(finding):
        return False

    return True


def _process_section_threadsafe(section_index: int, section: dict, model_name: str) -> dict:
    """Pure-compute worker for parallel section analysis.

    DOES NOT touch the database or any shared mutable state. Returns a dict
    that the main thread can use to write logs and dedup candidates.
    """
    result = {
        "section_index": section_index,
        "section": section,
        "logs": [],
        "candidate_findings": [],
        "tokens_in": 0,
        "tokens_out": 0,
        "completed_message": None,
    }
    section_name = section["sectionName"]

    try:
        raw_findings, usage = generate_json(_findings_prompt(section), model_name)
    except Exception as exc:
        result["logs"].append((
            "llm",
            "warn",
            f"Section analysis failed for {section_name}",
            {"error": str(exc), "section_index": section_index},
        ))
        result["completed_message"] = f"{section_name}: failed"
        return result

    result["tokens_in"] = usage.get("input_tokens") or 0
    result["tokens_out"] = usage.get("output_tokens") or 0

    if not isinstance(raw_findings, list):
        result["completed_message"] = f"{section_name}: no findings"
        return result

    section_candidates: list[tuple[int, int, Finding]] = []
    for idx, item in enumerate(raw_findings):
        if not isinstance(item, dict):
            result["logs"].append((
                "validate",
                "warn",
                "Skipping non-object finding payload",
                {"section_index": section_index},
            ))
            continue

        fallback_id = f"FIND-{uuid.uuid4().hex[:8]}-{idx}"
        normalized_item = _normalize_finding_payload(item, fallback_id)
        try:
            finding = Finding.model_validate(normalized_item)
        except ValidationError as validation_error:
            result["logs"].append((
                "validate",
                "warn",
                "Skipping invalid finding payload",
                {"errors": validation_error.errors(), "section_index": section_index},
            ))
            continue

        if not _is_useful_finding(finding):
            result["logs"].append((
                "validate",
                "warn",
                "Skipping low-utility finding",
                {"title": finding.title, "category": finding.category, "section_index": section_index},
            ))
            continue

        priority = CATEGORY_PRIORITY.get(finding.category, 99)
        section_candidates.append((priority, idx, finding))

    section_candidates.sort(key=lambda x: (x[0], x[1]))
    cap = _section_cap(section_name)
    if len(section_candidates) > cap:
        result["logs"].append((
            "validate",
            "info",
            f"Trimmed {len(section_candidates) - cap} finding(s) from {section_name} (cap {cap})",
            {"section_index": section_index},
        ))
    result["candidate_findings"] = [
        (priority, idx, finding, section) for (priority, idx, finding) in section_candidates[:cap]
    ]
    result["completed_message"] = f"{section_name}: {len(result['candidate_findings'])} kept"
    return result


def _unwrap_envelope(data: Any, expected_keys: set[str]) -> Any:
    """Strip common LLM single-key wrappers so downstream code can rely on a flat dict.

    Different providers (and the same provider on different days) wrap responses
    in envelopes like {"riskAndLimitations": {...}}, {"result": {...}}, etc.
    We unwrap up to two levels if none of the expected keys are present at the
    current level, but the wrapped dict contains them.
    """
    if not isinstance(data, dict):
        return data
    for _ in range(2):
        if not isinstance(data, dict):
            break
        if any(k in data for k in expected_keys):
            return data
        if len(data) == 1:
            inner = next(iter(data.values()))
            if isinstance(inner, dict):
                data = inner
                continue
        break
    return data


def _response_diag(value: Any) -> dict:
    """Capture a compact, safe diagnostic of an LLM response shape for observability."""
    diag: dict[str, Any] = {"type": type(value).__name__}
    if isinstance(value, dict):
        diag["keys"] = list(value.keys())[:20]
        diag["value_types"] = {k: type(v).__name__ for k, v in list(value.items())[:20]}
    elif isinstance(value, list):
        diag["length"] = len(value)
        if value:
            diag["item0_type"] = type(value[0]).__name__
    try:
        snippet = json.dumps(value, default=str)
    except Exception:
        snippet = str(value)
    diag["snippet"] = snippet[:600]
    return diag


def _humanize_key(key: str) -> str:
    """Turn 'internalValidity' or 'internal_validity' into 'Internal Validity'."""
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", str(key))
    return spaced.replace("_", " ").strip().title()


def _flatten_field(value: Any) -> Optional[str]:
    """Render any LLM response shape as plain readable text for Text columns.

    Provider-agnostic: handles flat strings, lists, and arbitrarily nested dicts.
    Each provider (Gemini, Claude, OpenAI) interprets generic JSON-extraction
    prompts slightly differently — this normalizer absorbs that variation so
    downstream persistence and UI don't need to care.

    Returns None for empty/missing values so callers can skip saving them.
    """
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, list):
        items = [_flatten_field(item) for item in value]
        items = [item for item in items if item]
        if not items:
            return None
        if len(items) == 1:
            return items[0]
        return "\n".join(f"- {item}" for item in items)
    if isinstance(value, dict):
        sections: list[str] = []
        for key, sub in value.items():
            flat = _flatten_field(sub)
            if not flat:
                continue
            label = _humanize_key(key)
            if "\n" in flat:
                sections.append(f"{label}:\n{flat}")
            else:
                sections.append(f"{label}: {flat}")
        return "\n\n".join(sections) if sections else None
    return str(value).strip() or None


def _flatten_outcomes(value: Any) -> list[str]:
    """Convert any LLM 'outcomes' shape into list[str] for the JSON column."""
    if value is None:
        return []
    if isinstance(value, str):
        return [value.strip()] if value.strip() else []
    if isinstance(value, dict):
        flat = _flatten_field(value)
        return [flat] if flat else []
    if isinstance(value, list):
        result: list[str] = []
        for item in value:
            flat = _flatten_field(item)
            if flat:
                result.append(flat)
        return result
    return []


def _has_meaningful_pico_row(row: models.PicoSnapshot) -> bool:
    return bool(
        (row.population and row.population.strip())
        or (row.intervention and row.intervention.strip())
        or (row.comparator and row.comparator.strip())
        or (row.outcomes_json and len(row.outcomes_json) > 0)
    )


def _has_meaningful_risk_row(row: models.RiskLimitations) -> bool:
    return bool(
        (row.internal_validity and row.internal_validity.strip())
        or (row.external_validity and row.external_validity.strip())
        or (row.sponsorship_conflict and row.sponsorship_conflict.strip())
        or (row.composite_endpoint_assessment and row.composite_endpoint_assessment.strip())
        or (row.subgroup_assessment and row.subgroup_assessment.strip())
    )


def run_analysis(db: Session, paper: models.Paper, pages: list[dict], retry_missing_only: bool = False) -> str:
    run_id = str(uuid.uuid4())
    provider = get_provider()
    model_name = get_model()
    run = models.AnalysisRun(
        id=run_id,
        paper_id=paper.id,
        model=f"{provider}/{model_name}",
        prompt_version=PROMPT_VERSION,
        status="processing",
    )
    db.add(run)
    paper.status = "processing"
    db.commit()

    _log(db, paper.id, run_id, "pipeline_stage", "info", "Reading paper")
    _log(
        db,
        paper.id,
        run_id,
        "section",
        "info",
        "Splitting paper into sections",
        {"provider": provider, "model": model_name},
    )
    _log(db, paper.id, run_id, "pipeline_stage", "info", "Analyzing findings")
    sections = split_sections(pages)
    section_failures = set()
    if retry_missing_only:
        recent_warnings = (
            db.query(models.ObservabilityEvent)
            .filter(
                models.ObservabilityEvent.paper_id == paper.id,
                models.ObservabilityEvent.stage == "llm",
                models.ObservabilityEvent.level == "warn",
            )
            .order_by(models.ObservabilityEvent.created_at.desc())
            .limit(200)
            .all()
        )
        for warn in recent_warnings:
            if warn.message.startswith("Section analysis failed for "):
                section_failures.add(warn.message.replace("Section analysis failed for ", "").strip())

    sections_to_process = [s for s in sections if not retry_missing_only or s["sectionName"] in section_failures]
    full_text = "\n\n".join(section["text"] for section in sections)
    existing_signatures = {
        (f.title.strip().lower(), f.summary.strip().lower())
        for f in db.query(models.Finding).filter(models.Finding.paper_id == paper.id).all()
    }

    total_in = 0
    total_out = 0
    start = time.time()
    finding_count = 0
    candidate_findings: list[tuple[int, int, Finding, dict]] = []

    parallel_enabled = _is_parallel_enabled()
    worker_count = _max_workers() if parallel_enabled else 1
    failed_sections: list[dict] = []

    try:
        if parallel_enabled and len(sections_to_process) > 1:
            _log(
                db,
                paper.id,
                run_id,
                "llm",
                "info",
                f"Analyzing {len(sections_to_process)} sections in parallel (workers={worker_count})",
                {"parallel": True, "workers": worker_count, "totalSections": len(sections_to_process)},
            )

            section_results: list[dict] = []
            with ThreadPoolExecutor(max_workers=worker_count) as executor:
                future_to_index = {
                    executor.submit(_process_section_threadsafe, idx, section, model_name): idx
                    for idx, section in enumerate(sections_to_process)
                }
                completed = 0
                for future in as_completed(future_to_index):
                    result = future.result()
                    section_results.append(result)
                    completed += 1
                    for stage, level, message, metadata in result["logs"]:
                        _log(db, paper.id, run_id, stage, level, message, metadata)
                    if result["completed_message"]:
                        _log(
                            db,
                            paper.id,
                            run_id,
                            "llm",
                            "info",
                            f"Section complete ({completed} of {len(sections_to_process)}): {result['completed_message']}",
                            {"section_index": result["section_index"], "completed": completed, "total": len(sections_to_process)},
                        )

            section_results.sort(key=lambda r: r["section_index"])
            for result in section_results:
                total_in += result["tokens_in"]
                total_out += result["tokens_out"]
                if (result.get("completed_message") or "").endswith(": failed"):
                    failed_sections.append(result["section"])
                for priority, idx, finding, section in result["candidate_findings"]:
                    signature = (finding.title.strip().lower(), finding.summary.strip().lower())
                    if signature in existing_signatures:
                        continue
                    existing_signatures.add(signature)
                    candidate_findings.append((priority, idx, finding, section))
        else:
            for section_index, section in enumerate(sections_to_process):
                _log(db, paper.id, run_id, "llm", "info", f"Analyzing section {section['sectionName']}")
                try:
                    raw_findings, usage = generate_json(_findings_prompt(section), model_name)
                except Exception as exc:
                    _log(
                        db,
                        paper.id,
                        run_id,
                        "llm",
                        "warn",
                        f"Section analysis failed for {section['sectionName']}",
                        {"error": str(exc)},
                    )
                    failed_sections.append(section)
                    continue
                total_in += usage.get("input_tokens") or 0
                total_out += usage.get("output_tokens") or 0

                if not isinstance(raw_findings, list):
                    continue

                section_candidates: list[tuple[int, int, Finding, dict]] = []
                for idx, item in enumerate(raw_findings):
                    if not isinstance(item, dict):
                        _log(db, paper.id, run_id, "validate", "warn", "Skipping non-object finding payload")
                        continue

                    fallback_id = f"FIND-{uuid.uuid4().hex[:8]}-{idx}"
                    normalized_item = _normalize_finding_payload(item, fallback_id)
                    try:
                        finding = Finding.model_validate(normalized_item)
                    except ValidationError as validation_error:
                        _log(
                            db,
                            paper.id,
                            run_id,
                            "validate",
                            "warn",
                            "Skipping invalid finding payload",
                            {"errors": validation_error.errors()},
                        )
                        continue

                    if not _is_useful_finding(finding):
                        _log(
                            db,
                            paper.id,
                            run_id,
                            "validate",
                            "warn",
                            "Skipping low-utility finding",
                            {"title": finding.title, "category": finding.category},
                        )
                        continue

                    signature = (finding.title.strip().lower(), finding.summary.strip().lower())
                    if signature in existing_signatures:
                        continue
                    existing_signatures.add(signature)
                    priority = CATEGORY_PRIORITY.get(finding.category, 99)
                    section_candidates.append((priority, idx, finding, section))

                section_candidates.sort(key=lambda x: (x[0], x[1]))
                section_cap = _section_cap(section["sectionName"])
                if len(section_candidates) > section_cap:
                    _log(
                        db,
                        paper.id,
                        run_id,
                        "validate",
                        "info",
                        f"Trimmed {len(section_candidates) - section_cap} finding(s) from {section['sectionName']} (cap {section_cap})",
                    )
                candidate_findings.extend(section_candidates[:section_cap])

        if failed_sections:
            _log(
                db,
                paper.id,
                run_id,
                "llm",
                "info",
                f"Auto-recovering {len(failed_sections)} failed section(s) sequentially",
                {"failedSections": [s["sectionName"] for s in failed_sections]},
            )
            for recovery_index, section in enumerate(failed_sections):
                # Sequential + small spacer gives Gemini room to recover from the
                # concurrent pressure that caused the original 503s.
                if recovery_index > 0:
                    time.sleep(2)
                recovery_result = _process_section_threadsafe(
                    section_index=1000 + recovery_index,
                    section=section,
                    model_name=model_name,
                )
                for stage, level, message, metadata in recovery_result["logs"]:
                    _log(db, paper.id, run_id, stage, level, message, metadata)
                total_in += recovery_result["tokens_in"]
                total_out += recovery_result["tokens_out"]
                completed_msg = recovery_result.get("completed_message") or "no findings"
                still_failed = completed_msg.endswith(": failed")
                _log(
                    db,
                    paper.id,
                    run_id,
                    "llm",
                    "info" if not still_failed else "warn",
                    f"Section recovery {recovery_index + 1}/{len(failed_sections)}: {completed_msg} ({'recovered' if not still_failed else 'still failed'})",
                    {"section": section["sectionName"]},
                )
                for priority, idx, finding, _section in recovery_result["candidate_findings"]:
                    signature = (finding.title.strip().lower(), finding.summary.strip().lower())
                    if signature in existing_signatures:
                        continue
                    existing_signatures.add(signature)
                    candidate_findings.append((priority, idx, finding, section))

        _log(db, paper.id, run_id, "pipeline_stage", "info", "Cleaning up duplicates")
        candidate_findings, dedupe_dropped = _dedupe_findings(candidate_findings)
        if dedupe_dropped:
            _log(
                db,
                paper.id,
                run_id,
                "pipeline",
                "info",
                f"Dedupe pass removed {len(dedupe_dropped)} finding(s)",
                {"dropped": dedupe_dropped},
            )

        selected_findings = sorted(candidate_findings, key=lambda x: (x[0], x[1]))[:MAX_FINDINGS_PER_PAPER]
        for selected_index, (_, _, finding, section) in enumerate(selected_findings):
            evidence_scores = []
            finding_id = _stable_finding_id(run_id, section_index=0, finding_index=selected_index, candidate_id=finding.id)
            if finding.category in STATS_REQUIRED_CATEGORIES:
                stats_payload = finding.statistics.model_dump()
            else:
                stats_payload = finding.statistics.model_dump(exclude_none=True)
            stats_payload["_meta"] = {
                "clinicalRelevance": finding.clinicalRelevance,
                "practiceChangeSignal": finding.practiceChangeSignal,
                "confidenceRationale": finding.confidenceRationale,
                "whyItMatters": finding.whyItMatters,
                "isCompositeEndpoint": finding.isCompositeEndpoint,
                "compositeComponents": finding.compositeComponents,
            }
            db_finding = models.Finding(
                id=finding_id,
                paper_id=paper.id,
                analysis_run_id=run_id,
                category=finding.category,
                title=finding.title,
                summary=finding.summary,
                clinical_implication=finding.clinicalImplication,
                statistics_json=stats_payload,
                confidence_level=finding.confidenceLevel,
                review_status=finding.reviewStatus,
                review_note=finding.reviewNote,
            )
            db.add(db_finding)
            for src in finding.sourcePassages:
                score = score_anchor(src.text, section["text"])
                evidence_scores.append(score)
                db.add(
                    models.FindingSource(
                        id=str(uuid.uuid4()),
                        finding_id=db_finding.id,
                        text_excerpt=src.text,
                        section_name=src.sectionName,
                        page_hint=src.pageHint,
                        paragraph_hint=src.paragraphHint,
                        anchor_type=src.anchorType or classify_anchor(score),
                        anchor_match_score=score,
                    )
                )
            db_finding.evidence_strength_score = round(sum(evidence_scores) / max(len(evidence_scores), 1), 3)
            finding_count += 1

        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            _log(
                db,
                paper.id,
                run_id,
                "persist",
                "warn",
                "Skipped finding save batch due to duplicate IDs",
            )

        pico_rows = db.query(models.PicoSnapshot).filter(models.PicoSnapshot.paper_id == paper.id).all()
        risk_rows = db.query(models.RiskLimitations).filter(models.RiskLimitations.paper_id == paper.id).all()
        pico_exists = any(_has_meaningful_pico_row(row) for row in pico_rows)
        risk_exists = any(_has_meaningful_risk_row(row) for row in risk_rows)

        if not retry_missing_only or not pico_exists:
            _log(db, paper.id, run_id, "pipeline_stage", "info", "Extracting PICO")
            try:
                pico_data, pico_usage = generate_json(
                    _simple_prompt("Extract PICO as JSON object with population/intervention/comparator/outcomes[]", full_text),
                    model_name,
                )
                total_in += pico_usage.get("input_tokens") or 0
                total_out += pico_usage.get("output_tokens") or 0
            except Exception as exc:
                pico_data = {}
                _log(db, paper.id, run_id, "llm", "warn", "PICO extraction failed", {"error": str(exc)})
            if isinstance(pico_data, dict):
                pico_data = _unwrap_envelope(
                    pico_data, {"population", "intervention", "comparator", "outcomes"}
                )
                population = _flatten_field(pico_data.get("population"))
                intervention = _flatten_field(pico_data.get("intervention"))
                comparator = _flatten_field(pico_data.get("comparator"))
                outcomes = _flatten_outcomes(pico_data.get("outcomes"))
                if any([population, intervention, comparator, outcomes]):
                    db.add(
                        models.PicoSnapshot(
                            id=str(uuid.uuid4()),
                            paper_id=paper.id,
                            population=population,
                            intervention=intervention,
                            comparator=comparator,
                            outcomes_json=outcomes,
                        )
                    )
                else:
                    _log(
                        db,
                        paper.id,
                        run_id,
                        "validate",
                        "warn",
                        "PICO response had no meaningful fields after normalization",
                        _response_diag(pico_data),
                    )

        if not retry_missing_only or not risk_exists:
            _log(db, paper.id, run_id, "pipeline_stage", "info", "Assessing risk of bias")
            try:
                risk_data, risk_usage = generate_json(
                    _simple_prompt(
                        "Extract risk and limitations JSON object with internalValidity/externalValidity/sponsorshipConflict/compositeEndpointAssessment/subgroupAssessment",
                        full_text,
                    ),
                    model_name,
                )
                total_in += risk_usage.get("input_tokens") or 0
                total_out += risk_usage.get("output_tokens") or 0
            except Exception as exc:
                risk_data = {}
                _log(db, paper.id, run_id, "llm", "warn", "Risk extraction failed", {"error": str(exc)})
            if isinstance(risk_data, dict):
                risk_data = _unwrap_envelope(
                    risk_data,
                    {
                        "internalValidity",
                        "externalValidity",
                        "sponsorshipConflict",
                        "compositeEndpointAssessment",
                        "subgroupAssessment",
                    },
                )
                internal_validity = _flatten_field(risk_data.get("internalValidity"))
                external_validity = _flatten_field(risk_data.get("externalValidity"))
                sponsorship_conflict = _flatten_field(risk_data.get("sponsorshipConflict"))
                composite_endpoint = _flatten_field(risk_data.get("compositeEndpointAssessment"))
                subgroup_assessment = _flatten_field(risk_data.get("subgroupAssessment"))
                if any([internal_validity, external_validity, sponsorship_conflict, composite_endpoint, subgroup_assessment]):
                    db.add(
                        models.RiskLimitations(
                            id=str(uuid.uuid4()),
                            paper_id=paper.id,
                            internal_validity=internal_validity,
                            external_validity=external_validity,
                            sponsorship_conflict=sponsorship_conflict,
                            composite_endpoint_assessment=composite_endpoint,
                            subgroup_assessment=subgroup_assessment,
                        )
                    )
                else:
                    _log(
                        db,
                        paper.id,
                        run_id,
                        "validate",
                        "warn",
                        "Risk response had no meaningful fields after normalization",
                        _response_diag(risk_data),
                    )
            elif risk_data:
                _log(
                    db,
                    paper.id,
                    run_id,
                    "validate",
                    "warn",
                    "Risk response was not a JSON object",
                    _response_diag(risk_data),
                )
        db.commit()

        _log(db, paper.id, run_id, "pipeline_stage", "info", "Building clinical summary")
        approved_and_unreviewed = db.query(models.Finding).filter(models.Finding.paper_id == paper.id).all()
        grouped = {"efficacy": [], "safety": [], "applicability": [], "practiceImpact": []}
        for finding in approved_and_unreviewed:
            if finding.category in ["primary_outcome", "secondary_outcome"]:
                grouped["efficacy"].append(finding.summary)
            elif finding.category == "safety":
                grouped["safety"].append(finding.summary)
            elif finding.category in ["generalizability", "population"]:
                grouped["applicability"].append(finding.summary)
            grouped["practiceImpact"].append(finding.clinical_implication)

        event = models.ObservabilityEvent(
            id=str(uuid.uuid4()),
            paper_id=paper.id,
            analysis_run_id=run_id,
            stage="persist",
            level="info",
            message="Computed grouped summary",
            metadata_json=grouped,
        )
        db.add(event)

        run.status = "completed"
        run.input_tokens = total_in
        run.output_tokens = total_out
        run.latency_ms = int((time.time() - start) * 1000)
        run.completed_at = datetime.now(timezone.utc)
        paper.status = "completed"
        paper.processed_at = datetime.now(timezone.utc)
        db.commit()

        _log(
            db,
            paper.id,
            run_id,
            "persist",
            "info",
            "Analysis completed",
            {"findingsCount": finding_count, "runId": run_id},
        )
        return run_id
    except Exception as exc:
        db.rollback()
        run.status = "failed"
        run.error_message = str(exc)
        run.completed_at = datetime.now(timezone.utc)
        paper.status = "failed"
        db.commit()
        _log(db, paper.id, run_id, "llm", "error", "Analysis failed", {"error": str(exc)})
        raise

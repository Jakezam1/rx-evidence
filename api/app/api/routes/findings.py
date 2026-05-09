import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from app.db import models
from app.db.session import get_db
from app.schemas.api_contracts import FindingsResponse, PicoResponse, RiskResponse, SummaryResponse
from app.schemas.finding import Finding, SourcePassage, Statistics
from app.schemas.pico import PicoSnapshot
from app.schemas.risk import RiskLimitations
from app.schemas.summary import ClinicalSummary

router = APIRouter(tags=["findings"])


@router.get("/papers/{paper_id}/findings", response_model=FindingsResponse)
def get_findings(paper_id: str, db: Session = Depends(get_db)):
    findings = db.query(models.Finding).filter(models.Finding.paper_id == paper_id).all()
    result: list[Finding] = []
    for finding in findings:
        sources = db.query(models.FindingSource).filter(models.FindingSource.finding_id == finding.id).all()
        source_passages = [
            SourcePassage(
                text=src.text_excerpt,
                sectionName=src.section_name,
                pageHint=src.page_hint,
                paragraphHint=src.paragraph_hint,
                anchorType=src.anchor_type,
                anchorMatchScore=src.anchor_match_score,
            )
            for src in sources
        ]
        stats_blob = dict(finding.statistics_json or {})
        meta = stats_blob.pop("_meta", {}) if isinstance(stats_blob.get("_meta"), dict) else {}
        result.append(
            Finding(
                id=finding.id,
                category=finding.category,
                title=finding.title,
                summary=finding.summary,
                clinicalImplication=finding.clinical_implication,
                statistics=Statistics(**stats_blob),
                confidenceLevel=finding.confidence_level,
                clinicalRelevance=meta.get("clinicalRelevance", "medium"),
                practiceChangeSignal=meta.get("practiceChangeSignal", "consider"),
                confidenceRationale=meta.get("confidenceRationale", ""),
                whyItMatters=meta.get("whyItMatters", ""),
                isCompositeEndpoint=bool(meta.get("isCompositeEndpoint", False)),
                compositeComponents=list(meta.get("compositeComponents", []) or []),
                sourcePassages=source_passages,
                reviewStatus=finding.review_status,
                reviewNote=finding.review_note,
                evidenceStrengthScore=finding.evidence_strength_score,
            )
        )
    return FindingsResponse(paperId=paper_id, findings=result)


class ReviewUpdate(BaseModel):
    reviewStatus: str
    reviewNote: Optional[str] = None


@router.patch("/findings/{finding_id}/review")
def patch_review(finding_id: str, payload: ReviewUpdate, db: Session = Depends(get_db)):
    finding = db.query(models.Finding).filter(models.Finding.id == finding_id).first()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found.")

    finding.review_status = payload.reviewStatus
    finding.review_note = payload.reviewNote
    db.add(
        models.ObservabilityEvent(
            id=str(uuid.uuid4()),
            paper_id=finding.paper_id,
            analysis_run_id=finding.analysis_run_id,
            stage="review",
            level="info",
            message=f"Finding {finding_id} updated",
            metadata_json={"reviewStatus": payload.reviewStatus},
        )
    )
    db.commit()
    return {"ok": True}


@router.get("/papers/{paper_id}/pico", response_model=PicoResponse)
def get_pico(paper_id: str, db: Session = Depends(get_db)):
    pico = db.query(models.PicoSnapshot).filter(models.PicoSnapshot.paper_id == paper_id).order_by(models.PicoSnapshot.id.desc()).first()
    if not pico:
        return PicoResponse(paperId=paper_id, pico=PicoSnapshot())
    return PicoResponse(
        paperId=paper_id,
        pico=PicoSnapshot(
            population=pico.population,
            intervention=pico.intervention,
            comparator=pico.comparator,
            outcomes=pico.outcomes_json or [],
        ),
    )


@router.get("/papers/{paper_id}/risk-limitations", response_model=RiskResponse)
def get_risk(paper_id: str, db: Session = Depends(get_db)):
    risk = db.query(models.RiskLimitations).filter(models.RiskLimitations.paper_id == paper_id).order_by(models.RiskLimitations.id.desc()).first()
    if not risk:
        return RiskResponse(paperId=paper_id, riskLimitations=RiskLimitations())
    return RiskResponse(
        paperId=paper_id,
        riskLimitations=RiskLimitations(
            internalValidity=risk.internal_validity,
            externalValidity=risk.external_validity,
            sponsorshipConflict=risk.sponsorship_conflict,
            compositeEndpointAssessment=risk.composite_endpoint_assessment,
            subgroupAssessment=risk.subgroup_assessment,
        ),
    )


@router.get("/papers/{paper_id}/summary", response_model=SummaryResponse)
def get_summary(paper_id: str, db: Session = Depends(get_db)):
    latest = (
        db.query(models.ObservabilityEvent)
        .filter(
            models.ObservabilityEvent.paper_id == paper_id,
            models.ObservabilityEvent.stage == "persist",
        )
        .order_by(models.ObservabilityEvent.created_at.desc())
        .first()
    )
    summary = latest.metadata_json if latest and isinstance(latest.metadata_json, dict) else {}
    return SummaryResponse(
        paperId=paper_id,
        summary=ClinicalSummary(
            efficacy=summary.get("efficacy", []),
            safety=summary.get("safety", []),
            applicability=summary.get("applicability", []),
            practiceImpact=summary.get("practiceImpact", []),
        ),
    )

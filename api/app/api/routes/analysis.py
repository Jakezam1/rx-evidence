from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.routes.papers import IN_MEMORY_PDFS
from app.db import models
from app.db.session import get_db
from app.schemas.api_contracts import AnalyzeResponse
from app.services.analyze_pipeline import run_analysis
from app.services.pdf_extract import extract_pdf_pages

router = APIRouter(prefix="/papers", tags=["analysis"])


@router.post("/{paper_id}/analyze", response_model=AnalyzeResponse)
def analyze_paper(paper_id: str, db: Session = Depends(get_db)):
    paper = db.query(models.Paper).filter(models.Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found.")

    file_bytes = IN_MEMORY_PDFS.get(paper_id)
    if not file_bytes:
        raise HTTPException(status_code=404, detail="PDF payload not available for this paper.")

    pages = extract_pdf_pages(file_bytes)
    run_id = run_analysis(db, paper, pages)
    findings_count = db.query(models.Finding).filter(models.Finding.paper_id == paper_id).count()
    return AnalyzeResponse(
        paperId=paper_id,
        runId=run_id,
        status="completed",
        findingsCount=findings_count,
    )


@router.post("/{paper_id}/retry-missing", response_model=AnalyzeResponse)
def retry_missing(paper_id: str, db: Session = Depends(get_db)):
    paper = db.query(models.Paper).filter(models.Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found.")

    file_bytes = IN_MEMORY_PDFS.get(paper_id)
    if not file_bytes:
        raise HTTPException(status_code=404, detail="PDF payload not available for this paper.")

    pages = extract_pdf_pages(file_bytes)
    run_id = run_analysis(db, paper, pages, retry_missing_only=True)
    findings_count = db.query(models.Finding).filter(models.Finding.paper_id == paper_id).count()
    return AnalyzeResponse(
        paperId=paper_id,
        runId=run_id,
        status="completed",
        findingsCount=findings_count,
    )

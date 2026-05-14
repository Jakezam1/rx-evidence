import hashlib
import os
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.db import models
from app.db.session import get_db
from app.schemas.api_contracts import PaperUploadResponse
from app.services.pdf_extract import extract_pdf_pages

router = APIRouter(prefix="/papers", tags=["papers"])

PDF_CACHE_DIR = Path(os.getenv("PDF_CACHE_DIR", "pdf_cache"))
PDF_CACHE_DIR.mkdir(parents=True, exist_ok=True)

_IN_MEMORY_PDFS: dict[str, bytes] = {}


def _disk_path(paper_id: str) -> Path:
    return PDF_CACHE_DIR / f"{paper_id}.pdf"


def get_pdf_bytes(paper_id: str) -> Optional[bytes]:
    """Return cached PDF bytes, falling back to disk if the in-memory cache was cleared."""
    cached = _IN_MEMORY_PDFS.get(paper_id)
    if cached:
        return cached
    path = _disk_path(paper_id)
    if path.exists():
        data = path.read_bytes()
        _IN_MEMORY_PDFS[paper_id] = data
        return data
    return None


def set_pdf_bytes(paper_id: str, file_bytes: bytes) -> None:
    _IN_MEMORY_PDFS[paper_id] = file_bytes
    try:
        _disk_path(paper_id).write_bytes(file_bytes)
    except OSError:
        pass


class _InMemoryShim(dict):
    """Backwards-compatible shim so existing `IN_MEMORY_PDFS.get(paper_id)` callsites
    transparently fall back to disk."""

    def get(self, key, default=None):
        return get_pdf_bytes(key) or default

    def __getitem__(self, key):
        value = get_pdf_bytes(key)
        if value is None:
            raise KeyError(key)
        return value


IN_MEMORY_PDFS = _InMemoryShim()


def _latest_paper_for_try_flow(db: Session) -> Optional[models.Paper]:
    """Prefer a finished analysis; otherwise newest upload (same rules as /papers/recent)."""
    paper = (
        db.query(models.Paper)
        .filter(models.Paper.status.in_(("completed", "analyzed")))
        .order_by(models.Paper.processed_at.desc().nullslast(), models.Paper.uploaded_at.desc())
        .first()
    )
    if paper is None:
        paper = db.query(models.Paper).order_by(models.Paper.uploaded_at.desc()).first()
    return paper


@router.post("", response_model=PaperUploadResponse)
async def upload_paper(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="PDF file is empty.")

    paper_id = str(uuid.uuid4())
    pages = extract_pdf_pages(file_bytes)
    digest = hashlib.sha256(file_bytes).hexdigest()

    paper = models.Paper(
        id=paper_id,
        file_name=file.filename or "upload.pdf",
        sha256=digest,
        status="uploaded",
        total_pages=len(pages),
    )
    db.add(paper)
    db.commit()

    set_pdf_bytes(paper_id, file_bytes)

    return PaperUploadResponse(paperId=paper_id, fileName=paper.file_name, status=paper.status)


@router.get("/demo")
def get_demo_paper(db: Session = Depends(get_db)):
    """Return the paper pinned via DEMO_PAPER_ID, or the same fallback as /papers/recent.

    On a fresh deploy the database is empty until someone uploads a PDF; use
    "Analyze a paper" once, or set DEMO_PAPER_ID to a paper UUID in the API env.
    """
    demo_id = os.getenv("DEMO_PAPER_ID", "").strip()
    paper = None
    if demo_id:
        paper = db.query(models.Paper).filter(models.Paper.id == demo_id).first()
        if paper is None:
            raise HTTPException(
                status_code=404,
                detail=f"DEMO_PAPER_ID is set to {demo_id} but no paper with that id exists.",
            )
    else:
        paper = _latest_paper_for_try_flow(db)
        if paper is None:
            raise HTTPException(
                status_code=404,
                detail="No papers yet. Use “Analyze a paper” on the home page first, or set DEMO_PAPER_ID in the API environment to a paper UUID.",
            )

    return {
        "paperId": paper.id,
        "fileName": paper.file_name,
        "status": paper.status,
        "totalPages": paper.total_pages,
        "uploadedAt": paper.uploaded_at.isoformat() if paper.uploaded_at else None,
        "processedAt": paper.processed_at.isoformat() if paper.processed_at else None,
    }


@router.get("/recent")
def get_recent_paper(db: Session = Depends(get_db)):
    """Return the most recently analyzed paper, preferring analyzed status.

    Used by the 'Try Demo' button on the landing page to load a pre-analyzed
    paper without making the user upload a fresh PDF.
    """
    paper = _latest_paper_for_try_flow(db)
    if paper is None:
        raise HTTPException(
            status_code=404,
            detail="No papers yet. Use “Analyze a paper” on the home page first, or set DEMO_PAPER_ID in the API environment to a paper UUID.",
        )

    return {
        "paperId": paper.id,
        "fileName": paper.file_name,
        "status": paper.status,
        "totalPages": paper.total_pages,
        "uploadedAt": paper.uploaded_at.isoformat() if paper.uploaded_at else None,
        "processedAt": paper.processed_at.isoformat() if paper.processed_at else None,
    }


@router.get("/{paper_id}/pdf")
def get_paper_pdf(paper_id: str):
    """Stream the cached PDF bytes for inline rendering in the UI."""
    data = get_pdf_bytes(paper_id)
    if data is None:
        raise HTTPException(status_code=404, detail="PDF bytes not cached for this paper.")
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{paper_id}.pdf"'},
    )

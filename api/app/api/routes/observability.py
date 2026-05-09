from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import models
from app.db.session import get_db
from app.schemas.api_contracts import ObservabilityResponse
from app.schemas.observability import ObservabilityEvent

router = APIRouter(tags=["observability"])


@router.get("/papers/{paper_id}/observability", response_model=ObservabilityResponse)
def get_observability(paper_id: str, db: Session = Depends(get_db)):
    events = (
        db.query(models.ObservabilityEvent)
        .filter(models.ObservabilityEvent.paper_id == paper_id)
        .order_by(models.ObservabilityEvent.created_at.asc())
        .all()
    )
    return ObservabilityResponse(
        paperId=paper_id,
        events=[
            ObservabilityEvent(
                stage=event.stage,
                level=event.level,
                message=event.message,
                metadata=event.metadata_json or {},
                createdAt=event.created_at.isoformat() if event.created_at else None,
            )
            for event in events
        ],
    )

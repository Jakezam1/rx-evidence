from typing import Optional

from pydantic import BaseModel


class ObservabilityEvent(BaseModel):
    stage: str
    level: str
    message: str
    metadata: dict = {}
    createdAt: Optional[str] = None

from typing import Optional

from pydantic import BaseModel


class RiskLimitations(BaseModel):
    internalValidity: Optional[str] = None
    externalValidity: Optional[str] = None
    sponsorshipConflict: Optional[str] = None
    compositeEndpointAssessment: Optional[str] = None
    subgroupAssessment: Optional[str] = None

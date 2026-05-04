from pydantic import BaseModel

from app.schemas.finding import Finding
from app.schemas.observability import ObservabilityEvent
from app.schemas.pico import PicoSnapshot
from app.schemas.risk import RiskLimitations
from app.schemas.summary import ClinicalSummary


class PaperUploadResponse(BaseModel):
    paperId: str
    fileName: str
    status: str


class AnalyzeResponse(BaseModel):
    paperId: str
    runId: str
    status: str
    findingsCount: int


class FindingsResponse(BaseModel):
    paperId: str
    findings: list[Finding]


class ObservabilityResponse(BaseModel):
    paperId: str
    events: list[ObservabilityEvent]


class PicoResponse(BaseModel):
    paperId: str
    pico: PicoSnapshot


class RiskResponse(BaseModel):
    paperId: str
    riskLimitations: RiskLimitations


class SummaryResponse(BaseModel):
    paperId: str
    summary: ClinicalSummary

from typing import Literal, Optional

from pydantic import BaseModel, Field


FindingCategory = Literal[
    "primary_outcome",
    "secondary_outcome",
    "population",
    "methods",
    "bias",
    "safety",
    "generalizability",
    "context",
]
ConfidenceLevel = Literal["high", "moderate", "low"]
ReviewStatus = Literal["unreviewed", "approved", "flagged"]
AnchorType = Literal["verbatim", "paraphrase"]
ClinicalRelevance = Literal["high", "medium", "low"]
PracticeChangeSignal = Literal["change", "consider", "no_change"]


class Statistics(BaseModel):
    ARR: Optional[str] = None
    RRR: Optional[str] = None
    NNT: Optional[int] = None
    NNH: Optional[int] = None
    HR: Optional[str] = None
    OR: Optional[str] = None
    RR: Optional[str] = None
    CI95: Optional[str] = None
    pValue: Optional[str] = None
    absoluteEvents: Optional[str] = None


class SourcePassage(BaseModel):
    text: str = Field(min_length=4)
    sectionName: str
    pageHint: str
    paragraphHint: Optional[str] = None
    anchorType: AnchorType = "paraphrase"
    anchorMatchScore: Optional[float] = None


class Finding(BaseModel):
    id: str
    category: FindingCategory
    title: str = Field(min_length=3, max_length=120)
    summary: str
    clinicalImplication: str
    statistics: Statistics = Field(default_factory=Statistics)
    confidenceLevel: ConfidenceLevel
    clinicalRelevance: ClinicalRelevance = "medium"
    practiceChangeSignal: PracticeChangeSignal = "consider"
    confidenceRationale: str = ""
    whyItMatters: str = ""
    isCompositeEndpoint: bool = False
    compositeComponents: list[str] = Field(default_factory=list)
    sourcePassages: list[SourcePassage] = Field(min_length=1, max_length=3)
    reviewStatus: ReviewStatus = "unreviewed"
    reviewNote: Optional[str] = None
    evidenceStrengthScore: Optional[float] = None


STATS_REQUIRED_CATEGORIES = {"primary_outcome", "secondary_outcome", "safety"}
STATS_SLOT_KEYS = ("HR", "RR", "OR", "CI95", "pValue", "ARR", "RRR", "NNT", "NNH", "absoluteEvents")

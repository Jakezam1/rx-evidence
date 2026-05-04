from pydantic import BaseModel


class ClinicalSummary(BaseModel):
    efficacy: list[str] = []
    safety: list[str] = []
    applicability: list[str] = []
    practiceImpact: list[str] = []

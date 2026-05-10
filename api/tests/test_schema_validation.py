from app.schemas.finding import Finding


def test_finding_schema_accepts_valid_payload():
    payload = {
        "id": "FIND-1",
        "category": "primary_outcome",
        "title": "Primary endpoint improved",
        "summary": "Treatment reduced the endpoint in trial participants.",
        "clinicalImplication": "Consider this option for similar patients.",
        "statistics": {"ARR": "2%"},
        "confidenceLevel": "high",
        "sourcePassages": [{"text": "Primary endpoint improved", "sectionName": "Results", "pageHint": "p6"}]
    }
    Finding.model_validate(payload)

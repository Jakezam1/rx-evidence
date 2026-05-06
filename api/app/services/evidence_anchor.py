from difflib import SequenceMatcher


def score_anchor(source_text: str, section_text: str) -> float:
    if not source_text or not section_text:
        return 0.0
    score = SequenceMatcher(None, source_text.lower(), section_text.lower()).ratio()
    return round(score, 3)


def classify_anchor(score: float) -> str:
    return "verbatim" if score >= 0.88 else "paraphrase"

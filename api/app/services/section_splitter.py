import re


SECTION_PATTERNS = [
    "abstract",
    "introduction",
    "methods",
    "results",
    "discussion",
    "conclusion",
    "limitations",
    "funding",
    "conflict",
]


def split_sections(pages: list[dict]) -> list[dict]:
    sections: list[dict] = []
    current = {"sectionName": "Context", "pageStart": 1, "pageEnd": 1, "text": ""}

    for page in pages:
        lines = [line.strip() for line in page["text"].splitlines() if line.strip()]
        for line in lines:
            normalized = re.sub(r"[^a-zA-Z ]", "", line).strip().lower()
            if normalized in SECTION_PATTERNS:
                if current["text"].strip():
                    sections.append(current)
                current = {
                    "sectionName": line.title(),
                    "pageStart": page["page"],
                    "pageEnd": page["page"],
                    "text": "",
                }
                continue
            current["text"] += f"{line}\n"
            current["pageEnd"] = page["page"]

    if current["text"].strip():
        sections.append(current)

    return sections

from io import BytesIO

import fitz
import pdfplumber


def extract_pdf_pages(file_bytes: bytes) -> list[dict]:
    pages: list[dict] = []

    try:
        document = fitz.open(stream=file_bytes, filetype="pdf")
        for idx, page in enumerate(document):
            text = page.get_text("text") or ""
            pages.append({"page": idx + 1, "text": text.strip()})
        document.close()
    except Exception:
        pages = []

    if pages and any(page["text"] for page in pages):
        return pages

    with pdfplumber.open(BytesIO(file_bytes)) as pdf:
        return [
            {"page": idx + 1, "text": (page.extract_text() or "").strip()}
            for idx, page in enumerate(pdf.pages)
        ]

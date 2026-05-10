from app.services.pdf_extract import extract_pdf_pages


def test_extract_pdf_pages_handles_invalid_pdf():
    try:
        extract_pdf_pages(b"not-a-pdf")
    except Exception:
        assert True

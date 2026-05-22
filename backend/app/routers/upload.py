"""
Statement upload endpoint.

POST /api/upload/statement
  - Accepts a multipart PDF upload (max 10 MB)
  - Parses it entirely in memory — no file is ever written to disk
  - Returns extracted transactions JSON
  - Requires JWT authentication
"""
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.models.user import User
from app.services.pdf_parser import parse_statement
from app.utils.auth import get_current_user

router = APIRouter()

_MAX_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post(
    "/statement",
    summary="Upload a PDF bank statement and extract transactions",
)
async def upload_statement(
    file: UploadFile = File(..., description="PDF bank statement (max 10 MB)"),
    current_user: User = Depends(get_current_user),
):
    # Validate content type
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        # Some browsers send application/octet-stream for PDFs — accept both
        # but reject anything that doesn't look like a PDF by filename too
        if not (file.filename or "").lower().endswith(".pdf"):
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Only PDF files are accepted",
            )

    # Read into memory, enforcing size limit
    file_bytes = await file.read()
    if len(file_bytes) > _MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds the 10 MB limit",
        )

    # Verify the bytes start with the PDF magic number (%PDF-)
    if not file_bytes.startswith(b"%PDF"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Uploaded file does not appear to be a valid PDF",
        )

    try:
        result = parse_statement(file_bytes)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not parse the statement: {exc}",
        )

    return result


@router.post("/debug", include_in_schema=True)
async def debug_pdf(file: UploadFile = File(...)):
    import pdfplumber, io
    contents = await file.read()
    lines = []
    with pdfplumber.open(io.BytesIO(contents)) as pdf:
        for i, page in enumerate(pdf.pages):
            text = page.extract_text()
            if text:
                for line in text.split('\n'):
                    lines.append(f"PAGE{i+1}: {line}")
    return {"lines": lines[:80], "total_lines": len(lines)}


@router.post("/debug-barclays", include_in_schema=True)
async def debug_barclays(file: UploadFile = File(...)):
    import pdfplumber, io
    contents = await file.read()
    result = []
    with pdfplumber.open(io.BytesIO(contents)) as pdf:
        for i, page in enumerate(pdf.pages):
            text = page.extract_text()
            if text:
                for line in text.split('\n'):
                    result.append(f"PAGE{i+1}: {line}")
    return {"lines": result[:100], "total": len(result)}

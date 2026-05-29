"""Document text extraction for PDF, DOCX, and plain-text files."""

from __future__ import annotations

import io
import logging
from typing import Callable, Dict

from pypdf import PdfReader
from pypdf.errors import PdfReadError
from docx import Document
from docx.opc.exceptions import PackageNotFoundError

logger = logging.getLogger(__name__)

MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_FILES = 10

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md"}


class UnsupportedFileType(ValueError):
    """Raised when a file extension is not in ALLOWED_EXTENSIONS."""


class FileTooLarge(ValueError):
    """Raised when a single file exceeds MAX_FILE_BYTES."""


class TooManyFiles(ValueError):
    """Raised when an upload includes more than MAX_FILES files."""


def _extract_pdf(data: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(data))
    except (PdfReadError, Exception) as e:
        logger.warning("Failed to read PDF: %s", e)
        return ""
    parts: list[str] = []
    for page in reader.pages:
        try:
            parts.append(page.extract_text() or "")
        except Exception as e:
            logger.warning("Failed to extract page text: %s", e)
    return "\n".join(p.strip() for p in parts if p.strip())


def _extract_docx(data: bytes) -> str:
    try:
        doc = Document(io.BytesIO(data))
    except (PackageNotFoundError, Exception) as e:
        logger.warning("Failed to read DOCX: %s", e)
        return ""
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


def _extract_text(data: bytes) -> str:
    for enc in ("utf-8", "utf-16", "latin-1"):
        try:
            return data.decode(enc).strip()
        except UnicodeDecodeError:
            continue
    return ""


_EXTRACTORS: Dict[str, Callable[[bytes], str]] = {
    ".pdf": _extract_pdf,
    ".docx": _extract_docx,
    ".txt": _extract_text,
    ".md": _extract_text,
}


def _extension(filename: str) -> str:
    name = filename.lower()
    dot = name.rfind(".")
    return name[dot:] if dot >= 0 else ""


def is_supported(filename: str) -> bool:
    return _extension(filename) in ALLOWED_EXTENSIONS


def extract_text(filename: str, data: bytes) -> str:
    """Extract plain text from a supported document.

    Raises UnsupportedFileType for unknown extensions, FileTooLarge when
    data exceeds MAX_FILE_BYTES. Returns "" for unreadable but supported
    files (e.g. scanned PDFs).
    """
    ext = _extension(filename)
    if ext not in _EXTRACTORS:
        raise UnsupportedFileType(f"Unsupported file type: {filename}")
    if len(data) > MAX_FILE_BYTES:
        raise FileTooLarge(f"{filename} exceeds {MAX_FILE_BYTES} bytes")
    return _EXTRACTORS[ext](data)

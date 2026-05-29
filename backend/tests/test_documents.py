"""Tests for backend.documents text extraction."""

from __future__ import annotations

import pytest

from backend.documents import (
    MAX_FILE_BYTES,
    UnsupportedFileType,
    FileTooLarge,
    extract_text,
    is_supported,
)


def test_extract_docx_returns_paragraph_text(docx_bytes):
    text = extract_text("notes.docx", docx_bytes)
    assert "Hello from a docx file." in text
    assert "Second paragraph with content." in text


def test_extract_text_file(text_bytes):
    assert extract_text("readme.txt", text_bytes) == "Plain text content for testing."


def test_extract_markdown_file():
    data = b"# Heading\n\nBody."
    assert "# Heading" in extract_text("doc.md", data)


def test_extract_pdf_blank_returns_empty_string(pdf_bytes):
    # The fixture PDF has a blank page; extraction should not crash.
    assert extract_text("blank.pdf", pdf_bytes) == ""


def test_unsupported_extension_raises():
    with pytest.raises(UnsupportedFileType):
        extract_text("evil.exe", b"\x00\x00")


def test_no_extension_raises():
    with pytest.raises(UnsupportedFileType):
        extract_text("Makefile", b"all:\n\techo")


def test_corrupt_pdf_returns_empty_not_crash():
    assert extract_text("broken.pdf", b"not a real pdf") == ""


def test_corrupt_docx_returns_empty_not_crash():
    assert extract_text("broken.docx", b"not a real docx") == ""


def test_empty_file_supported_extension():
    assert extract_text("empty.txt", b"") == ""


def test_file_at_size_limit_accepted():
    payload = b"a" * MAX_FILE_BYTES
    # Should not raise; extraction may produce huge text but should not crash.
    result = extract_text("big.txt", payload)
    assert len(result) == MAX_FILE_BYTES


def test_file_over_size_limit_rejected():
    payload = b"a" * (MAX_FILE_BYTES + 1)
    with pytest.raises(FileTooLarge):
        extract_text("toobig.txt", payload)


def test_is_supported_cases():
    assert is_supported("a.pdf")
    assert is_supported("A.PDF")
    assert is_supported("notes.docx")
    assert is_supported("plain.txt")
    assert is_supported("plain.md")
    assert not is_supported("script.exe")
    assert not is_supported("no_extension")

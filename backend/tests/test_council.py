"""Tests for backend.council prompt building and ranking parsing."""

from __future__ import annotations

from backend.council import build_user_prompt, parse_ranking_from_text


# ---- build_user_prompt -----------------------------------------------------

def test_build_prompt_no_documents_returns_query_unchanged():
    assert build_user_prompt("hello?", None) == "hello?"
    assert build_user_prompt("hello?", []) == "hello?"


def test_build_prompt_includes_filename_and_text():
    docs = [{"filename": "spec.pdf", "text": "API requirements"}]
    prompt = build_user_prompt("summarize", docs)
    assert "=== spec.pdf ===" in prompt
    assert "API requirements" in prompt
    assert "User question: summarize" in prompt


def test_build_prompt_skips_empty_text():
    docs = [
        {"filename": "blank.pdf", "text": ""},
        {"filename": "real.txt", "text": "useful content"},
    ]
    prompt = build_user_prompt("Q", docs)
    assert "blank.pdf" not in prompt
    assert "real.txt" in prompt
    assert "useful content" in prompt


def test_build_prompt_all_empty_documents_returns_query_unchanged():
    docs = [{"filename": "a.pdf", "text": ""}, {"filename": "b.pdf", "text": "   "}]
    assert build_user_prompt("Q", docs) == "Q"


def test_build_prompt_orders_multiple_documents():
    docs = [
        {"filename": "one.txt", "text": "alpha"},
        {"filename": "two.txt", "text": "beta"},
    ]
    prompt = build_user_prompt("compare", docs)
    assert prompt.index("one.txt") < prompt.index("two.txt")


# ---- parse_ranking_from_text -----------------------------------------------

def test_parse_well_formatted_ranking():
    text = """Some preamble.
FINAL RANKING:
1. Response C
2. Response A
3. Response B
"""
    assert parse_ranking_from_text(text) == ["Response C", "Response A", "Response B"]


def test_parse_returns_empty_when_no_responses_mentioned():
    assert parse_ranking_from_text("I cannot rank these.") == []


def test_parse_fallback_when_header_missing():
    text = "Response A is best. Then Response B. Then Response C."
    assert parse_ranking_from_text(text) == ["Response A", "Response B", "Response C"]


def test_parse_handles_extra_whitespace_in_numbered_list():
    text = """FINAL RANKING:
1.   Response A
2.    Response B
"""
    assert parse_ranking_from_text(text) == ["Response A", "Response B"]


def test_parse_boundary_single_response():
    text = "FINAL RANKING:\n1. Response A"
    assert parse_ranking_from_text(text) == ["Response A"]

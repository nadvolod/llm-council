"""Tests for backend.council prompt building and ranking parsing."""

from __future__ import annotations

import httpx
import respx

from backend.config import OPENROUTER_API_URL
from backend.council import (
    build_user_prompt,
    parse_ranking_from_text,
    run_full_council,
    stage1_collect_responses,
    generate_conversation_title,
)


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


# ---- per-request API key threading -----------------------------------------

_CANNED = "FINAL RANKING:\n1. Response A\n2. Response B\n"


def _mock_router():
    mock = respx.mock(assert_all_called=False)
    mock.post(OPENROUTER_API_URL).mock(
        return_value=httpx.Response(
            200, json={"choices": [{"message": {"content": _CANNED}}]}
        )
    )
    return mock


async def test_query_uses_provided_api_key_in_header():
    captured = []

    def capture(request: httpx.Request) -> httpx.Response:
        captured.append(request.headers.get("authorization"))
        return httpx.Response(
            200, json={"choices": [{"message": {"content": _CANNED}}]}
        )

    with respx.mock(assert_all_called=False) as mock:
        mock.post(OPENROUTER_API_URL).mock(side_effect=capture)
        results = await stage1_collect_responses("hi", "sk-test", None)

    assert results
    assert captured
    assert all(h == "Bearer sk-test" for h in captured)


async def test_run_full_council_threads_key():
    with _mock_router():
        stage1, stage2, stage3, metadata = await run_full_council("hi", "sk-test")
    assert stage1
    assert stage2
    assert stage3["response"]


async def test_generate_title_threads_key():
    with respx.mock(assert_all_called=False) as mock:
        captured = []

        def capture(request: httpx.Request) -> httpx.Response:
            captured.append(request.headers.get("authorization"))
            return httpx.Response(
                200, json={"choices": [{"message": {"content": "A Title"}}]}
            )

        mock.post(OPENROUTER_API_URL).mock(side_effect=capture)
        title = await generate_conversation_title("question", "sk-test")

    assert title == "A Title"
    assert captured == ["Bearer sk-test"]

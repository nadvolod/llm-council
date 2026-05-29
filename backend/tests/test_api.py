"""Integration tests for the FastAPI endpoints."""

from __future__ import annotations

import io
import json
import re
import uuid
from typing import List

import httpx
import pytest
import respx
from fastapi.testclient import TestClient
from pypdf import PdfWriter

from backend.config import OPENROUTER_API_URL
from backend.documents import MAX_FILES
from backend.main import app


def _mock_openrouter() -> respx.Router:
    """Set up a respx mock that returns a canned ranking response."""
    mock = respx.mock(assert_all_called=False, base_url="")
    canned_content = (
        "Response A is decent.\nResponse B is fine.\n\n"
        "FINAL RANKING:\n1. Response A\n2. Response B\n"
    )
    mock.post(OPENROUTER_API_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "choices": [
                    {"message": {"content": canned_content}}
                ]
            },
        )
    )
    return mock


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def conversation_id(client):
    resp = client.post("/api/conversations", json={})
    assert resp.status_code == 200
    return resp.json()["id"]


def test_create_and_get_conversation(client):
    resp = client.post("/api/conversations", json={})
    assert resp.status_code == 200
    body = resp.json()
    assert "id" in body
    assert body["messages"] == []

    fetch = client.get(f"/api/conversations/{body['id']}")
    assert fetch.status_code == 200


def test_get_unknown_conversation_returns_404(client):
    resp = client.get(f"/api/conversations/{uuid.uuid4()}")
    assert resp.status_code == 404


def test_send_message_unknown_conversation_returns_404(client):
    resp = client.post(
        f"/api/conversations/{uuid.uuid4()}/message",
        data={"content": "hello"},
    )
    assert resp.status_code == 404


def test_send_message_with_no_files_succeeds(client, conversation_id):
    with _mock_openrouter():
        resp = client.post(
            f"/api/conversations/{conversation_id}/message",
            data={"content": "hello council"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["stage1"]
    assert body["stage3"]["response"]


def test_send_message_with_text_file_persists_document(client, conversation_id):
    with _mock_openrouter():
        resp = client.post(
            f"/api/conversations/{conversation_id}/message",
            data={"content": "summarize"},
            files=[("files", ("note.txt", b"Important note body", "text/plain"))],
        )
    assert resp.status_code == 200

    conv = client.get(f"/api/conversations/{conversation_id}").json()
    user_msgs = [m for m in conv["messages"] if m["role"] == "user"]
    assert len(user_msgs) == 1
    docs = user_msgs[0].get("documents", [])
    assert len(docs) == 1
    assert docs[0]["filename"] == "note.txt"
    assert "Important note body" in docs[0]["text"]


def test_prior_turn_documents_re_included_on_next_turn(client, conversation_id):
    """Boundary: documents uploaded on turn 1 should still appear in turn 2's prompt."""
    captured: List[dict] = []

    def capture(request: httpx.Request) -> httpx.Response:
        captured.append(json.loads(request.content))
        return httpx.Response(
            200,
            json={
                "choices": [
                    {"message": {"content": "FINAL RANKING:\n1. Response A\n"}}
                ]
            },
        )

    with respx.mock(assert_all_called=False) as mock:
        mock.post(OPENROUTER_API_URL).mock(side_effect=capture)

        # Turn 1 with file
        client.post(
            f"/api/conversations/{conversation_id}/message",
            data={"content": "first"},
            files=[("files", ("ref.txt", b"reference material XYZ", "text/plain"))],
        )

        # Turn 2 without file — prior doc must be threaded through.
        captured.clear()
        client.post(
            f"/api/conversations/{conversation_id}/message",
            data={"content": "follow-up"},
        )

    assert captured, "no OpenRouter calls captured for turn 2"
    # At least one of turn-2's stage-1 calls must include the prior doc text.
    stage1_calls = [
        c for c in captured
        if c["messages"][0]["content"].startswith("Reference documents")
    ]
    assert stage1_calls, "expected stage-1 prompt to reference uploaded document"
    assert any("reference material XYZ" in c["messages"][0]["content"] for c in stage1_calls)


def test_reject_unsupported_file_type(client, conversation_id):
    resp = client.post(
        f"/api/conversations/{conversation_id}/message",
        data={"content": "hi"},
        files=[("files", ("evil.exe", b"\x00\x00", "application/octet-stream"))],
    )
    assert resp.status_code == 415


def test_reject_too_many_files(client, conversation_id):
    files = [
        ("files", (f"f{i}.txt", b"x", "text/plain"))
        for i in range(MAX_FILES + 1)
    ]
    resp = client.post(
        f"/api/conversations/{conversation_id}/message",
        data={"content": "hi"},
        files=files,
    )
    assert resp.status_code == 413


def test_boundary_exactly_max_files_accepted(client, conversation_id):
    files = [
        ("files", (f"f{i}.txt", b"x", "text/plain"))
        for i in range(MAX_FILES)
    ]
    with _mock_openrouter():
        resp = client.post(
            f"/api/conversations/{conversation_id}/message",
            data={"content": "hi"},
            files=files,
        )
    assert resp.status_code == 200


def test_stream_endpoint_emits_all_stage_events(client, conversation_id):
    with _mock_openrouter():
        resp = client.post(
            f"/api/conversations/{conversation_id}/message/stream",
            data={"content": "stream test"},
        )
    assert resp.status_code == 200
    body = resp.text
    types = [
        m.group(1)
        for m in re.finditer(r'data: \{"type": "([^"]+)"', body)
    ]
    assert "stage1_start" in types
    assert "stage1_complete" in types
    assert "stage2_start" in types
    assert "stage2_complete" in types
    assert "stage3_start" in types
    assert "stage3_complete" in types
    assert "complete" in types


def test_stream_endpoint_reports_error_when_all_models_fail(client, conversation_id):
    with respx.mock(assert_all_called=False) as mock:
        mock.post(OPENROUTER_API_URL).mock(
            return_value=httpx.Response(500, json={"error": "boom"})
        )
        resp = client.post(
            f"/api/conversations/{conversation_id}/message/stream",
            data={"content": "will fail"},
        )
    assert resp.status_code == 200
    assert '"type": "error"' in resp.text

"""Tests for the async, user-scoped Postgres storage layer."""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from backend import storage
from backend.models import Base, User


@pytest.fixture
async def session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as s:
        yield s


async def _make_user(session, clerk_id="clerk_a", email="a@b.com") -> User:
    user = User(clerk_id=clerk_id, email=email)
    session.add(user)
    await session.flush()
    return user


async def test_create_and_get_roundtrip(session):
    user = await _make_user(session)
    conv = await storage.create_conversation(session, user.id)
    assert conv["id"]
    assert conv["title"] == "New Conversation"
    assert conv["messages"] == []

    fetched = await storage.get_conversation(session, user.id, conv["id"])
    assert fetched is not None
    assert fetched["id"] == conv["id"]


async def test_list_conversations_returns_only_owners(session):
    a = await _make_user(session, "clerk_a", "a@b.com")
    b = await _make_user(session, "clerk_b", "b@b.com")
    await storage.create_conversation(session, a.id)
    await storage.create_conversation(session, a.id)
    await storage.create_conversation(session, b.id)

    a_list = await storage.list_conversations(session, a.id)
    b_list = await storage.list_conversations(session, b.id)
    assert len(a_list) == 2
    assert len(b_list) == 1
    for item in a_list:
        assert set(item.keys()) >= {"id", "created_at", "title", "message_count"}


async def test_user_isolation(session):
    a = await _make_user(session, "clerk_a", "a@b.com")
    b = await _make_user(session, "clerk_b", "b@b.com")
    conv = await storage.create_conversation(session, a.id)

    # B cannot fetch A's conversation
    assert await storage.get_conversation(session, b.id, conv["id"]) is None
    # A can
    assert await storage.get_conversation(session, a.id, conv["id"]) is not None


async def test_messages_preserve_order(session):
    user = await _make_user(session)
    conv = await storage.create_conversation(session, user.id)
    cid = conv["id"]

    await storage.add_user_message(session, cid, "first question", None)
    await storage.add_assistant_message(
        session,
        cid,
        stage1=[{"model": "m", "response": "r"}],
        stage2=[{"model": "m", "ranking": "FINAL RANKING:\n1. Response A"}],
        stage3={"model": "chair", "response": "final"},
    )
    await storage.add_user_message(session, cid, "second question", None)

    fetched = await storage.get_conversation(session, user.id, cid)
    msgs = fetched["messages"]
    assert [m["role"] for m in msgs] == ["user", "assistant", "user"]
    assert msgs[0]["content"] == "first question"
    assert msgs[1]["stage3"]["response"] == "final"
    assert msgs[2]["content"] == "second question"


async def test_update_conversation_title(session):
    user = await _make_user(session)
    conv = await storage.create_conversation(session, user.id)
    await storage.update_conversation_title(session, conv["id"], "New Title")
    fetched = await storage.get_conversation(session, user.id, conv["id"])
    assert fetched["title"] == "New Title"


async def test_collect_documents_dedupes_by_filename_latest_wins():
    conversation = {
        "messages": [
            {"role": "user", "documents": [{"filename": "a.txt", "text": "old"}]},
            {"role": "assistant", "stage1": []},
            {"role": "user", "documents": [{"filename": "a.txt", "text": "new"}]},
            {"role": "user", "documents": [{"filename": "b.txt", "text": "bee"}]},
        ]
    }
    docs = storage.collect_conversation_documents(conversation)
    by_name = {d["filename"]: d["text"] for d in docs}
    assert by_name == {"a.txt": "new", "b.txt": "bee"}

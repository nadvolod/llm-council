"""Async, user-scoped Postgres storage for conversations.

Each operation is scoped by ``user_id`` so no cross-tenant access is possible.
ORM rows are serialized to the dict shapes defined by the API contract.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Conversation, Message


def _conversation_meta(conv: Conversation, message_count: int) -> Dict[str, Any]:
    """Serialize a conversation to list-view metadata."""
    return {
        "id": conv.id,
        "created_at": conv.created_at.isoformat() if conv.created_at else None,
        "title": conv.title,
        "message_count": message_count,
    }


def _serialize_message(msg: Message) -> Dict[str, Any]:
    """Serialize a message row to the contract dict shape."""
    out: Dict[str, Any] = {"role": msg.role}
    if msg.content is not None:
        out["content"] = msg.content
    if msg.stage1 is not None:
        out["stage1"] = msg.stage1
    if msg.stage2 is not None:
        out["stage2"] = msg.stage2
    if msg.stage3 is not None:
        # stage3 is persisted as JSON text (the council emits a dict).
        try:
            out["stage3"] = json.loads(msg.stage3)
        except (ValueError, TypeError):
            out["stage3"] = msg.stage3
    if msg.documents:
        out["documents"] = msg.documents
    return out


def _serialize_conversation(conv: Conversation) -> Dict[str, Any]:
    return {
        "id": conv.id,
        "created_at": conv.created_at.isoformat() if conv.created_at else None,
        "title": conv.title,
        "messages": [_serialize_message(m) for m in conv.messages],
    }


async def create_conversation(session: AsyncSession, user_id: str) -> Dict[str, Any]:
    """Create a new conversation owned by ``user_id``."""
    conv = Conversation(user_id=user_id, title="New Conversation")
    session.add(conv)
    await session.commit()
    await session.refresh(conv, attribute_names=["messages"])
    return _serialize_conversation(conv)


async def _load_conversation(
    session: AsyncSession, user_id: str, conversation_id: str
) -> Optional[Conversation]:
    """Load an owned conversation ORM row (with messages) or None."""
    result = await session.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user_id,
        )
    )
    conv = result.scalar_one_or_none()
    if conv is None:
        return None
    # Ensure messages are loaded (ordered by position via the relationship).
    await session.refresh(conv, attribute_names=["messages"])
    return conv


async def get_conversation(
    session: AsyncSession, user_id: str, conversation_id: str
) -> Optional[Dict[str, Any]]:
    """Return the owned conversation as a dict, or None if not found/owned."""
    conv = await _load_conversation(session, user_id, conversation_id)
    if conv is None:
        return None
    return _serialize_conversation(conv)


async def list_conversations(
    session: AsyncSession, user_id: str
) -> List[Dict[str, Any]]:
    """List the user's conversations (metadata only), newest first."""
    result = await session.execute(
        select(Conversation)
        .where(Conversation.user_id == user_id)
        .order_by(Conversation.created_at.desc())
    )
    conversations = result.scalars().all()

    out: List[Dict[str, Any]] = []
    for conv in conversations:
        count = (
            await session.execute(
                select(func.count(Message.id)).where(
                    Message.conversation_id == conv.id
                )
            )
        ).scalar_one()
        out.append(_conversation_meta(conv, count))
    return out


async def _next_position(session: AsyncSession, conversation_id: str) -> int:
    count = (
        await session.execute(
            select(func.count(Message.id)).where(
                Message.conversation_id == conversation_id
            )
        )
    ).scalar_one()
    return int(count)


async def add_user_message(
    session: AsyncSession,
    conversation_id: str,
    content: str,
    documents: Optional[List[Dict[str, Any]]] = None,
) -> None:
    """Append a user message to a conversation."""
    position = await _next_position(session, conversation_id)
    msg = Message(
        conversation_id=conversation_id,
        role="user",
        content=content,
        documents=documents or None,
        position=position,
    )
    session.add(msg)
    await session.commit()


async def add_assistant_message(
    session: AsyncSession,
    conversation_id: str,
    stage1: List[Dict[str, Any]],
    stage2: List[Dict[str, Any]],
    stage3: Dict[str, Any],
) -> None:
    """Append an assistant message holding all 3 council stages."""
    position = await _next_position(session, conversation_id)
    msg = Message(
        conversation_id=conversation_id,
        role="assistant",
        stage1=stage1,
        stage2=stage2,
        # stage3 column is Text per the schema; store the dict as JSON text.
        stage3=json.dumps(stage3) if stage3 is not None else None,
        position=position,
    )
    session.add(msg)
    await session.commit()


async def update_conversation_title(
    session: AsyncSession, conversation_id: str, title: str
) -> None:
    """Update the title of a conversation."""
    conv = (
        await session.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )
    ).scalar_one_or_none()
    if conv is None:
        raise ValueError(f"Conversation {conversation_id} not found")
    conv.title = title
    await session.commit()


def collect_conversation_documents(
    conversation: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Flatten all documents attached to prior user messages.

    Later messages win on filename collision (most recent upload of a
    given filename is the one passed to the council). Pure function.
    """
    by_name: Dict[str, Dict[str, Any]] = {}
    for msg in conversation.get("messages", []):
        if msg.get("role") != "user":
            continue
        for doc in msg.get("documents", []) or []:
            name = doc.get("filename")
            if name:
                by_name[name] = doc
    return list(by_name.values())

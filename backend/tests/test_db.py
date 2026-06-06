import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from backend.models import Base, User, Conversation, Message


@pytest.fixture
async def session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as s:
        yield s


async def test_user_conversation_message_roundtrip(session):
    user = User(clerk_id="clerk_123", email="a@b.com")
    session.add(user)
    await session.flush()
    conv = Conversation(user_id=user.id, title="T")
    session.add(conv)
    await session.flush()
    msg = Message(conversation_id=conv.id, role="user", content="hi", position=0)
    session.add(msg)
    await session.commit()
    assert user.id is not None
    assert conv.user_id == user.id
    assert msg.conversation_id == conv.id

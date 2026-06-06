import pytest, jwt, time
from cryptography.hazmat.primitives.asymmetric import rsa
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from backend import auth
from backend.models import Base, User


@pytest.fixture
async def session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as s:
        yield s


@pytest.fixture
def keypair():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _token(key, **claims):
    payload = {"sub": "clerk_abc", "exp": int(time.time()) + 600, **claims}
    return jwt.encode(payload, key, algorithm="RS256")


async def test_valid_token_upserts_user(session, keypair, monkeypatch):
    monkeypatch.setattr(auth, "_get_signing_key", lambda token: keypair.public_key())
    token = _token(keypair, email="a@b.com")
    user = await auth.authenticate(token, session)
    assert user.clerk_id == "clerk_abc"
    again = await auth.authenticate(token, session)   # second call: no duplicate
    assert again.id == user.id


async def test_expired_token_rejected(session, keypair, monkeypatch):
    monkeypatch.setattr(auth, "_get_signing_key", lambda token: keypair.public_key())
    token = _token(keypair, exp=int(time.time()) - 10)
    with pytest.raises(auth.AuthError):
        await auth.authenticate(token, session)


async def test_bad_signature_rejected(session, keypair, monkeypatch):
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    monkeypatch.setattr(auth, "_get_signing_key", lambda token: keypair.public_key())
    token = _token(other)
    with pytest.raises(auth.AuthError):
        await auth.authenticate(token, session)

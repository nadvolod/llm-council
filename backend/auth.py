"""Clerk JWT verification + lazy user provisioning."""
import os, jwt
from jwt import PyJWKClient
from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from .db import get_session
from .models import User

CLERK_JWKS_URL = os.getenv("CLERK_JWKS_URL", "")
# Optional: when set, the token's `iss` claim is verified against it (defense in
# depth on top of JWKS signature verification). Left empty in tests.
CLERK_ISSUER = os.getenv("CLERK_ISSUER", "")
_jwk_client = PyJWKClient(CLERK_JWKS_URL) if CLERK_JWKS_URL else None


class AuthError(Exception):
    pass


def _get_signing_key(token: str):
    if _jwk_client is None:
        raise AuthError("JWKS not configured")
    return _jwk_client.get_signing_key_from_jwt(token).key


async def authenticate(token: str, session: AsyncSession) -> User:
    try:
        key = _get_signing_key(token)
        decode_kwargs: dict = {"algorithms": ["RS256"], "options": {"verify_aud": False}}
        if CLERK_ISSUER:
            decode_kwargs["issuer"] = CLERK_ISSUER
        claims = jwt.decode(token, key, **decode_kwargs)
    except Exception as e:
        raise AuthError(str(e))
    clerk_id = claims.get("sub")
    if not clerk_id:
        raise AuthError("no sub claim")
    user = (await session.execute(select(User).where(User.clerk_id == clerk_id))).scalar_one_or_none()
    if user is None:
        user = User(clerk_id=clerk_id, email=claims.get("email"))
        session.add(user)
        try:
            await session.commit()
            await session.refresh(user)
        except IntegrityError:
            # A concurrent request provisioned the same user first; reuse it.
            await session.rollback()
            user = (
                await session.execute(select(User).where(User.clerk_id == clerk_id))
            ).scalar_one()
    return user


async def get_current_user(
    authorization: str = Header(default=""),
    session: AsyncSession = Depends(get_session),
) -> User:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    try:
        return await authenticate(authorization[7:], session)
    except AuthError as e:
        raise HTTPException(status_code=401, detail=str(e))

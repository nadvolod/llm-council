# Public Hosted LLM Council — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the local LLM Council into a public, hosted product: Clerk auth (username+password+CAPTCHA), users supply their own OpenRouter key (stored in Clerk metadata), synced conversation history in Neon Postgres, a Next.js+TypeScript frontend on Vercel with a cinematic animated landing page, and the existing FastAPI council backend (now multi-tenant) on Railway/Render.

**Architecture:** Three independent tracks. **Track A (Backend)** makes FastAPI multi-tenant: Postgres-backed user-scoped storage, Clerk JWT verification, per-request OpenRouter key read from Clerk. **Track B (Frontend app)** is a Next.js+TS migration: Clerk auth, ported council UI, JWT-attaching API client, inline API-key panel via Clerk server actions. **Track C (Landing page)** builds the marketing site inside the Track B scaffold. A and B run in parallel (disjoint dirs: `backend/` vs `frontend/`); C runs after B's scaffold exists.

**Tech Stack:** FastAPI, SQLAlchemy (async) + asyncpg, Neon Postgres, Clerk (Backend API + JWT), Next.js 15 App Router, TypeScript, React 19, Framer Motion, Vitest, pytest.

**Spec:** `docs/superpowers/specs/2026-06-06-public-hosted-council-design.md`

---

## Parallelization & Dependencies

| Track | Owns (dirs) | Depends on | Parallel with |
|---|---|---|---|
| A — Backend multi-tenancy | `backend/` | none | B |
| B — Frontend app | `frontend/` (Next.js) | API contract (fixed below) | A |
| C — Landing page | `frontend/app/(marketing)/`, `frontend/components/landing/` | B (Tasks B1–B3 scaffold) | A |

**Fixed API contract (so B can build against A without waiting):** all routes require `Authorization: Bearer <clerk_jwt>`. Base URL = `NEXT_PUBLIC_API_URL`.

- `GET  /api/conversations` → `[{id, created_at, title, message_count}]`
- `POST /api/conversations` → `{id, created_at, title, messages: []}`
- `GET  /api/conversations/{id}` → `{id, created_at, title, messages: [...]}` (404 if not owner)
- `POST /api/conversations/{id}/message` (multipart: `content`, `files[]`) → `{stage1, stage2, stage3, metadata}` (409 if no key in Clerk)
- `POST /api/conversations/{id}/message/stream` (multipart) → SSE events `stage1_start|stage1_complete|stage2_start|stage2_complete|stage3_start|stage3_complete|title_complete|complete|error` (409 if no key)

Key management is NOT a FastAPI route — it is Next.js server actions writing Clerk metadata (Track B, Task B6).

---

# TRACK A — Backend Multi-Tenancy

**Owner dir:** `backend/`. Commit prefix: `feat(backend):`. Run tests with `uv run pytest`.

## Task A1: Add dependencies

**Files:**
- Modify: `pyproject.toml`

- [ ] **Step 1: Add runtime deps** to `[project].dependencies`:

```
    "sqlalchemy[asyncio]>=2.0.0",
    "asyncpg>=0.29.0",
    "alembic>=1.13.0",
    "pyjwt[crypto]>=2.9.0",
    "clerk-backend-api>=1.0.0",
```

- [ ] **Step 2: Add dev dep** to `[dependency-groups].dev`: `"aiosqlite>=0.20.0"` (tests run against SQLite in-memory).

- [ ] **Step 3: Install:** Run `uv sync`. Expected: resolves, no errors.

- [ ] **Step 4: Commit:** `git add pyproject.toml uv.lock && git commit -m "feat(backend): add db/auth/clerk dependencies"`

## Task A2: Database models & engine

**Files:**
- Create: `backend/db.py` (engine/session factory)
- Create: `backend/models.py` (SQLAlchemy ORM models)
- Test: `backend/tests/test_db.py`

ORM models match the spec schema. `User`, `Conversation`, `Message`. JSON columns use SQLAlchemy `JSON` type (portable across Postgres/SQLite). Timestamps `DateTime(timezone=True)`.

- [ ] **Step 1: Write failing test** `backend/tests/test_db.py`:

```python
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
```

- [ ] **Step 2: Run, expect fail:** `uv run pytest backend/tests/test_db.py -v` → ImportError (no models).

- [ ] **Step 3: Implement `backend/models.py`:**

```python
"""SQLAlchemy ORM models."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Integer, ForeignKey, DateTime, JSON
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

def _uuid() -> str:
    return str(uuid.uuid4())

def _now() -> datetime:
    return datetime.now(timezone.utc)

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    clerk_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

class Conversation(Base):
    __tablename__ = "conversations"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String, default="New Conversation")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    messages: Mapped[list["Message"]] = relationship(
        cascade="all, delete-orphan", order_by="Message.position"
    )

class Message(Base):
    __tablename__ = "messages"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    stage1: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    stage2: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    stage3: Mapped[str | None] = mapped_column(Text, nullable=True)
    documents: Mapped[list | None] = mapped_column(JSON, nullable=True)
    position: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
```

- [ ] **Step 4: Implement `backend/db.py`:**

```python
"""Async engine + session factory."""
import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

DATABASE_URL = os.getenv("DATABASE_URL", "")
# Neon gives postgres://; SQLAlchemy async needs postgresql+asyncpg://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

engine = create_async_engine(DATABASE_URL) if DATABASE_URL else None
SessionLocal = async_sessionmaker(engine, expire_on_commit=False) if engine else None

async def get_session() -> AsyncSession:  # FastAPI dependency
    async with SessionLocal() as session:
        yield session
```

- [ ] **Step 5: Run, expect pass:** `uv run pytest backend/tests/test_db.py -v` → PASS.
- [ ] **Step 6: Commit:** `git add backend/models.py backend/db.py backend/tests/test_db.py && git commit -m "feat(backend): add SQLAlchemy models and async engine"`

## Task A3: Clerk JWT verification dependency

**Files:**
- Create: `backend/auth.py`
- Test: `backend/tests/test_auth.py`

`get_current_user` verifies a Clerk JWT (RS256) against Clerk JWKS, extracts `sub` (clerk_id) and `email`, lazily upserts a `User`, and returns it. JWKS fetching is wrapped in `_get_signing_key(token)` so tests can monkeypatch it.

- [ ] **Step 1: Write failing test** `backend/tests/test_auth.py` (generates an RS256 keypair, signs a token, monkeypatches the JWKS lookup to return the public key):

```python
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
```

- [ ] **Step 2: Run, expect fail:** `uv run pytest backend/tests/test_auth.py -v` → ImportError.

- [ ] **Step 3: Implement `backend/auth.py`:**

```python
"""Clerk JWT verification + lazy user provisioning."""
import os, jwt
from jwt import PyJWKClient
from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from .db import get_session
from .models import User

CLERK_JWKS_URL = os.getenv("CLERK_JWKS_URL", "")
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
        claims = jwt.decode(token, key, algorithms=["RS256"], options={"verify_aud": False})
    except Exception as e:
        raise AuthError(str(e))
    clerk_id = claims.get("sub")
    if not clerk_id:
        raise AuthError("no sub claim")
    user = (await session.execute(select(User).where(User.clerk_id == clerk_id))).scalar_one_or_none()
    if user is None:
        user = User(clerk_id=clerk_id, email=claims.get("email"))
        session.add(user)
        await session.commit()
        await session.refresh(user)
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
```

- [ ] **Step 4: Run, expect pass.** `uv run pytest backend/tests/test_auth.py -v` → PASS.
- [ ] **Step 5: Commit:** `git add backend/auth.py backend/tests/test_auth.py && git commit -m "feat(backend): add Clerk JWT auth dependency"`

## Task A4: Clerk key-read module

**Files:**
- Create: `backend/clerk_keys.py`
- Test: `backend/tests/test_clerk_keys.py`

Reads the user's OpenRouter key from Clerk `privateMetadata.openrouterKey` via the Clerk Backend API, with a short TTL in-memory cache. The network call is isolated in `_fetch_private_metadata(clerk_id)` for monkeypatching.

- [ ] **Step 1: Failing test** `backend/tests/test_clerk_keys.py`:

```python
import pytest
from backend import clerk_keys

async def test_returns_key_when_present(monkeypatch):
    monkeypatch.setattr(clerk_keys, "_fetch_private_metadata",
                        lambda cid: {"openrouterKey": "sk-or-xyz"})
    clerk_keys._cache.clear()
    assert await clerk_keys.get_openrouter_key("clerk_1") == "sk-or-xyz"

async def test_raises_when_absent(monkeypatch):
    monkeypatch.setattr(clerk_keys, "_fetch_private_metadata", lambda cid: {})
    clerk_keys._cache.clear()
    with pytest.raises(clerk_keys.NoKeyError):
        await clerk_keys.get_openrouter_key("clerk_2")
```

- [ ] **Step 2: Run, expect fail.**
- [ ] **Step 3: Implement `backend/clerk_keys.py`:**

```python
"""Read a user's OpenRouter key from Clerk privateMetadata (cached)."""
import os, time
from clerk_backend_api import Clerk

CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY", "")
_CACHE_TTL = 60.0
_cache: dict[str, tuple[float, str]] = {}

class NoKeyError(Exception):
    pass

def _fetch_private_metadata(clerk_id: str) -> dict:
    with Clerk(bearer_auth=CLERK_SECRET_KEY) as clerk:
        user = clerk.users.get(user_id=clerk_id)
    return dict(user.private_metadata or {})

async def get_openrouter_key(clerk_id: str) -> str:
    now = time.time()
    hit = _cache.get(clerk_id)
    if hit and hit[0] > now:
        return hit[1]
    meta = _fetch_private_metadata(clerk_id)
    key = meta.get("openrouterKey")
    if not key:
        raise NoKeyError("no openrouter key set")
    _cache[clerk_id] = (now + _CACHE_TTL, key)
    return key
```

- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit:** `git add backend/clerk_keys.py backend/tests/test_clerk_keys.py && git commit -m "feat(backend): add Clerk OpenRouter key reader"`

## Task A5: Thread per-request API key through council

**Files:**
- Modify: `backend/openrouter.py` (add `api_key` param)
- Modify: `backend/council.py` (pass `api_key` down all stage functions)
- Modify: `backend/config.py` (remove `OPENROUTER_API_KEY` global)
- Test: `backend/tests/test_council.py` (existing — update to pass `api_key`)

- [ ] **Step 1: Update `query_model`** in `backend/openrouter.py` — add required `api_key: str` param, build header from it, remove the `OPENROUTER_API_KEY` import:

```python
async def query_model(model, messages, api_key: str, timeout: float = 120.0):
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    ...
async def query_models_parallel(models, messages, api_key: str):
    tasks = [query_model(m, messages, api_key) for m in models]
    ...
```

- [ ] **Step 2: Thread `api_key`** through every function in `backend/council.py` that ends up calling `query_model`/`query_models_parallel` (`stage1_collect_responses`, `stage2_collect_rankings`, `stage3_synthesize_final`, `generate_conversation_title`, `run_full_council`) — add `api_key: str` parameter and forward it. Do not read any global key.

- [ ] **Step 3: Remove** `OPENROUTER_API_KEY` line from `backend/config.py` and its import in `openrouter.py`.

- [ ] **Step 4: Update existing council tests** to pass a dummy `api_key="sk-test"` and assert the Authorization header (respx mocks) uses it. Run `uv run pytest backend/tests/test_council.py -v` → PASS.

- [ ] **Step 5: Commit:** `git add backend/ && git commit -m "feat(backend): thread per-request OpenRouter key through council"`

## Task A6: Postgres-backed, user-scoped storage

**Files:**
- Rewrite: `backend/storage.py` (async, session+user scoped)
- Test: `backend/tests/test_storage.py`

Each function takes `session: AsyncSession` and is scoped by `user_id`. Replaces the JSON-file API with the same logical operations. Shapes returned match the API contract.

- [ ] **Step 1: Failing test** `backend/tests/test_storage.py` covering: create→get roundtrip; `list_conversations` returns only the owner's; `get_conversation` returns None for another user's id; add user+assistant messages preserve order; `collect_conversation_documents` dedupes by filename (latest wins). (Use the in-memory engine fixture from A2.) Include a `test_user_isolation` asserting user B cannot fetch user A's conversation.

- [ ] **Step 2: Run, expect fail.**

- [ ] **Step 3: Implement** async functions in `backend/storage.py`, all scoped by `user_id`:
  `create_conversation(session, user_id) -> dict`,
  `get_conversation(session, user_id, conversation_id) -> dict | None`,
  `list_conversations(session, user_id) -> list[dict]`,
  `add_user_message(session, conversation_id, content, documents)`,
  `add_assistant_message(session, conversation_id, stage1, stage2, stage3)`,
  `update_conversation_title(session, conversation_id, title)`,
  `collect_conversation_documents(conversation: dict) -> list` (pure, unchanged logic).
  `position` = current message count. Serialize ORM rows to the contract dict shapes (messages include `role, content, stage1, stage2, stage3, documents`).

- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit:** `git add backend/storage.py backend/tests/test_storage.py && git commit -m "feat(backend): user-scoped Postgres storage"`

## Task A7: Wire routes — auth, key, user-scoping, CORS

**Files:**
- Modify: `backend/main.py`
- Test: `backend/tests/test_api.py` (existing — update for auth + scoping + 409)

- [ ] **Step 1: Update `test_api.py`** to (a) override `get_current_user` dependency with a fake user, (b) override `get_session` with the in-memory session, (c) monkeypatch `clerk_keys.get_openrouter_key` to return `"sk-test"` (and a variant raising `NoKeyError`), (d) assert `409` on send-message when key missing, (e) assert a conversation created by user A is `404` for user B. Mock OpenRouter via respx.

- [ ] **Step 2: Run, expect fail.**

- [ ] **Step 3: Implement** in `backend/main.py`:
  - Add `Depends(get_current_user)` to every `/api/conversations*` route; pass `session` via `Depends(get_session)`.
  - Scope all storage calls by `user.id`; return 404 when `get_conversation` is None.
  - Before running the council, fetch the key: `try: api_key = await clerk_keys.get_openrouter_key(user.clerk_id) except NoKeyError: raise HTTPException(409, "no_openrouter_key")`. Pass `api_key` into `run_full_council` / stage functions (both the batch and `/stream` endpoints).
  - CORS: replace hardcoded localhost origins with `allow_origins=os.getenv("CORS_ORIGINS","http://localhost:3000").split(",")`.

- [ ] **Step 4: Run, expect pass:** `uv run pytest backend/tests/ -v` → all PASS.
- [ ] **Step 5: Commit:** `git add backend/main.py backend/tests/test_api.py && git commit -m "feat(backend): authed, user-scoped routes with Clerk key + 409"`

## Task A8: DB schema bootstrap + deploy config

**Files:**
- Create: `backend/create_tables.py` (idempotent `Base.metadata.create_all` runner)
- Create: `backend/.env.example`
- Create: `Procfile` (Railway/Render start command)

- [ ] **Step 1:** `backend/create_tables.py` — async script that connects via `db.engine` and runs `Base.metadata.create_all`; invocable as `uv run python -m backend.create_tables`.
- [ ] **Step 2:** `backend/.env.example` with: `DATABASE_URL=`, `CLERK_JWKS_URL=`, `CLERK_SECRET_KEY=`, `CORS_ORIGINS=`.
- [ ] **Step 3:** `Procfile`: `web: uv run uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
- [ ] **Step 4: Commit:** `git add backend/create_tables.py backend/.env.example Procfile && git commit -m "feat(backend): table bootstrap + deploy config"`

---

# TRACK B — Frontend App (Next.js + TypeScript)

**Owner dir:** `frontend/`. Commit prefix: `feat(frontend):`. **This track replaces the Vite SPA with a Next.js app.** Run tests with `npm test` (Vitest).

> Preserve the existing component JSX/CSS as reference while porting; delete Vite-only files (`vite.config.js`, `index.html`, `src/main.jsx`) once the Next app builds.

## Task B1: Scaffold Next.js + TypeScript

**Files:** `frontend/package.json`, `frontend/tsconfig.json`, `frontend/next.config.ts`, `frontend/app/layout.tsx`, `frontend/app/page.tsx`, `frontend/.env.example`

- [ ] **Step 1:** Replace deps in `package.json`: add `next@^15`, keep `react@19`/`react-dom@19`/`react-markdown`; add `@clerk/nextjs@^6`, `framer-motion@^11`; scripts → `{"dev":"next dev","build":"next build","start":"next start","test":"vitest run","lint":"next lint"}`. Add dev deps `typescript`, `@types/node`. Run `npm install`.
- [ ] **Step 2:** Add `tsconfig.json` (Next defaults, `"strict": true`, path alias `"@/*": ["./*"]`).
- [ ] **Step 3:** `app/layout.tsx` wraps children in `<ClerkProvider>`, imports global CSS, renders a shared `<Footer/>` (placeholder until C). `app/page.tsx` = temporary "Hello" so build passes.
- [ ] **Step 4:** `.env.example`: `NEXT_PUBLIC_API_URL=`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=`, `CLERK_SECRET_KEY=`.
- [ ] **Step 5:** Run `npm run build` → succeeds. Commit `feat(frontend): scaffold Next.js + TypeScript + Clerk provider`.

## Task B2: Clerk auth pages + route protection

**Files:** `frontend/middleware.ts`, `frontend/app/sign-in/[[...sign-in]]/page.tsx`, `frontend/app/sign-up/[[...sign-up]]/page.tsx`

- [ ] **Step 1:** `middleware.ts` using `clerkMiddleware` + `createRouteMatcher` — protect `/app(.*)`; leave `/`, `/sign-in`, `/sign-up` public.
- [ ] **Step 2:** Sign-in/sign-up catch-all pages rendering Clerk `<SignIn/>`/`<SignUp/>`. (CAPTCHA/bot protection enabled in Clerk dashboard — note in `frontend/README.md`.)
- [ ] **Step 3:** Manual check: `npm run dev`, visiting `/app` redirects to `/sign-in`. Commit `feat(frontend): Clerk auth pages and protected routes`.

## Task B3: API client with JWT (lib/api.ts)

**Files:** Create `frontend/lib/api.ts`; Test `frontend/lib/__tests__/api.test.ts`

Port the existing `api.js` to TS. Every call gets `Authorization: Bearer <token>`; token supplied by caller (from Clerk `useAuth().getToken()`), so the module stays testable without Clerk.

- [ ] **Step 1: Failing test** — `sendMessage` builds multipart FormData and sets the Authorization header from an injected `getToken`; mock `fetch`. Also test `listConversations` attaches the header.
- [ ] **Step 2: Run, expect fail.**
- [ ] **Step 3: Implement** `createApi(getToken: () => Promise<string|null>)` returning `{listConversations, createConversation, getConversation, sendMessage, sendMessageStream}` mirroring the existing methods + the fixed contract; base URL from `process.env.NEXT_PUBLIC_API_URL`; SSE parsing identical to current `sendMessageStream`.
- [ ] **Step 4: Run, expect pass.** Commit `feat(frontend): typed API client with Clerk JWT`.

## Task B4: Port council UI components

**Files:** Create `frontend/components/council/{ChatInterface,Stage1,Stage2,Stage3,Sidebar}.tsx` + their CSS (copied from `frontend/src/components/`); Tests: port `frontend/src/__tests__/ChatInterface.test.jsx` → `frontend/components/council/__tests__/ChatInterface.test.tsx`

- [ ] **Step 1:** Copy each component to `.tsx`, add prop types/interfaces, keep markup/CSS/`react-markdown` usage identical. Replace direct `api` import with the `createApi` instance passed via props/context.
- [ ] **Step 2:** Port the ChatInterface test (Enter sends / Shift+Enter newline) to `.tsx`; run `npm test` → PASS.
- [ ] **Step 3:** Commit `feat(frontend): port council UI components to TSX`.

## Task B5: Council page `/app` assembling components

**Files:** Create `frontend/app/app/page.tsx` (client component); `frontend/app/app/layout.tsx`

- [ ] **Step 1:** `/app` page = client component: builds `api = createApi(getToken)` from `useAuth`, holds conversation list + current conversation state (port `App.jsx` orchestration), renders `<Sidebar>` + `<ChatInterface>` + Stage components, includes `<UserButton/>`.
- [ ] **Step 2:** Manual smoke (with backend running + a Clerk dev user + key set): create conversation, send message, see streamed stages.
- [ ] **Step 3:** Commit `feat(frontend): council app page`.

## Task B6: API-key server actions + inline ApiKeyPanel

**Files:** Create `frontend/app/actions/openrouter-key.ts` (server actions); `frontend/components/settings/ApiKeyPanel.tsx`; Test `frontend/components/settings/__tests__/ApiKeyPanel.test.tsx`

- [ ] **Step 1: Server actions** `setOpenRouterKey(formData)` and `clearOpenRouterKey()` (`"use server"`):
  - `setOpenRouterKey`: validate the key with a fetch to `https://openrouter.ai/api/v1/models` using the key; on non-200 return `{error}`; on success `clerkClient().users.updateUser(userId, { privateMetadata: { openrouterKey: key }, publicMetadata: { hasKey: true, last4: key.slice(-4), validatedAt: Date.now() } })`. Get `userId` from `auth()`.
  - `clearOpenRouterKey`: set `privateMetadata.openrouterKey = null`, `publicMetadata = { hasKey: false }`.
- [ ] **Step 2: Failing test** for a small pure helper `validateOpenRouterKey(key, fetchImpl)` extracted from the action (so it's unit-testable without Clerk): returns `{ok:true,last4}` on 200, `{ok:false}` on 401. Mock fetch. Implement helper, action calls it.
- [ ] **Step 3:** `ApiKeyPanel.tsx` (client): reads `useUser().user.publicMetadata.hasKey` → shows "Add your key" form (calls `setOpenRouterKey`) when false, or "Key •••• <last4> · Replace/Remove" when true. Inline error display.
- [ ] **Step 4: Test** ApiKeyPanel renders the form when `hasKey` false and the masked state when true (mock `useUser`). Run `npm test` → PASS.
- [ ] **Step 5:** In `/app` page: when a council request returns `409`, render `<ApiKeyPanel/>` inline above the composer. Commit `feat(frontend): OpenRouter key server actions + inline ApiKeyPanel`.

## Task B7: Remove Vite remnants

**Files:** Delete `frontend/vite.config.js`, `frontend/index.html`, `frontend/src/main.jsx`, `frontend/eslint.config.js` (replace w/ Next lint), old `src/` once ported.

- [ ] **Step 1:** Delete Vite-only files; ensure `npm run build` + `npm test` pass. Commit `chore(frontend): remove Vite scaffolding`.

---

# TRACK C — Landing Page (after B1–B3)

**Owner dirs:** `frontend/app/(marketing)/`, `frontend/components/landing/`. Commit prefix: `feat(landing):`. Aesthetic: Direction A (dark cinematic "Deliberation Chamber"), Framer Motion, honors `prefers-reduced-motion`.

## Task C1: Marketing layout + theme + Hero

**Files:** Create `frontend/app/(marketing)/page.tsx`, `frontend/app/(marketing)/layout.tsx`, `frontend/components/landing/Hero.tsx`, `frontend/components/landing/landing.css`

- [ ] **Step 1:** Marketing layout: dark gradient-mesh background, top nav with logo + Clerk `<SignInButton/>`/`<SignUpButton/>` (show `<UserButton/>` + "Open app" when signed in).
- [ ] **Step 2:** `Hero.tsx`: headline "Four minds. One verdict.", subhead, "Start your council →" CTA → `/sign-up`. Framer Motion: orbiting/converging council nodes (animated, transform/opacity only), hero parallax on scroll. `prefers-reduced-motion` disables motion.
- [ ] **Step 3:** Test (Vitest + Testing Library): Hero renders headline + CTA linking to `/sign-up`. Run `npm test` → PASS.
- [ ] **Step 4:** Commit `feat(landing): marketing layout + animated hero`.

## Task C2: Content sections

**Files:** Create `frontend/components/landing/{HowItWorks,WhyCouncil,ProductPeek,Byok,FAQ,FinalCTA}.tsx`

- [ ] **Step 1:** `HowItWorks` — animated 3-stage walkthrough (parallel answers → anonymized peer review → chairman synthesis), scroll-reveal.
- [ ] **Step 2:** `WhyCouncil` — 3 value-prop cards (anonymized review kills favoritism / diverse models catch errors / full transparency).
- [ ] **Step 3:** `ProductPeek` — stylized mock of the council UI (stage tabs + aggregate ranking).
- [ ] **Step 4:** `Byok` — "Free to use — you only pay OpenRouter directly. Your key, your data." 3-step: sign up → paste key → run.
- [ ] **Step 5:** `FAQ` — is it free / where's my key stored / which models / is my data private. `FinalCTA` — large "Convene your council" → `/sign-up`.
- [ ] **Step 6:** Compose all into `(marketing)/page.tsx` in order. Test: page renders each section heading. `npm test` → PASS. Commit `feat(landing): content sections`.

## Task C3: Footer with attribution

**Files:** Create `frontend/components/landing/Footer.tsx`; use it in `app/layout.tsx`

- [ ] **Step 1:** Footer: "Built by Nikolay Advolodkin" linking to LinkedIn (`NEXT_PUBLIC_AUTHOR_LINKEDIN_URL`, documented in `.env.example`), GitHub repo link, and the vibe-code warning text from README.
- [ ] **Step 2:** Test: Footer renders the attribution text and an anchor to the LinkedIn URL. `npm test` → PASS. Commit `feat(landing): footer with attribution`.

---

## Final Integration (after A + B + C)

- [ ] Backend: `uv run pytest backend/tests/ -v` all green.
- [ ] Frontend: `npm test` and `npm run build` green.
- [ ] Manual end-to-end (local): sign up (CAPTCHA) → add OpenRouter key → create council → watch streamed stages → reload → history persists → sign out/in on a second browser → history present (DB-synced).
- [ ] Deploy backend to Railway/Render (env: `DATABASE_URL`, `CLERK_JWKS_URL`, `CLERK_SECRET_KEY`, `CORS_ORIGINS`); run `python -m backend.create_tables`.
- [ ] Deploy frontend to Vercel (env: `NEXT_PUBLIC_API_URL`, Clerk keys, `NEXT_PUBLIC_AUTHOR_LINKEDIN_URL`).
- [ ] Enable Clerk Smart CAPTCHA + bot protection + username/password + required email in the Clerk dashboard.

## Out of Scope (v1)
Per-user model customization; free trial/demo; Clerk account-deletion webhook → data cascade; email-verification gate; persisting computed metadata.

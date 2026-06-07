# Public Hosted LLM Council — Design

**Date:** 2026-06-06
**Status:** Approved design, pre-implementation
**Author:** Brainstormed with Nikolay Advolodkin

## Goal

Turn the existing local LLM Council app into a public, hosted product where anyone
can sign up, supply their own OpenRouter API key, and run the 3-stage council. The
product is fronted by a beautiful, motion-rich marketing landing page and credits
Nikolay Advolodkin in the footer.

## Decisions (locked)

| Area | Decision |
|---|---|
| Access model | **BYO key only** — every user supplies their own OpenRouter key. Zero inference cost to the operator. No free trial, no demo runs. |
| Backend host | **Frontend on Vercel, FastAPI backend on Railway/Render.** Preserves working Python council code; no serverless streaming-timeout risk. |
| Auth | **Clerk** (hosted auth) — username + password, **email required** (for password reset). |
| CAPTCHA / abuse | **Clerk Smart CAPTCHA (Cloudflare Turnstile)** + Clerk bot detection on sign-up. No custom CAPTCHA code. |
| API key storage | **Clerk `privateMetadata`** (server-only readable). No encryption code, no key table, no `KEY_ENC_SECRET`; the raw key never touches our DB. |
| Database | **Neon Postgres** for synced conversation history (cross-device). Replaces local JSON file storage. |
| Migration | **None.** Existing `data/conversations/*.json` are dev artifacts; fresh start. |
| Council config | **Fixed** for v1 — users run the existing curated 4-model council + chairman with their key. No per-user model selection. |
| Frontend stack | **Migrate to Next.js (App Router) + TypeScript.** SSR landing page for SEO/share; council UI ported from the Vite SPA. |
| No-key UX | **Inline "add your key" panel** in the council UI (not a redirect). |
| Landing aesthetic | **Direction A — Cinematic "Deliberation Chamber":** dark, premium, gradient-mesh, orbiting/converging council nodes, glassmorphism, Framer Motion. |
| Footer credit | "Built by Nikolay Advolodkin" linking to **LinkedIn** (exact URL supplied at implementation). |

## Architecture

```
   Browser  ──▶  Next.js app (Vercel)
                  • Landing page (SSR, SEO)
                  • Council chat UI (ported, client-rendered, behind auth)
                  • Clerk auth components
                      │  authed fetch — Authorization: Bearer <clerk_jwt>
                      ▼
                 FastAPI (Railway/Render)
                  • Verifies Clerk JWT against JWKS
                  • 3-stage council logic (existing)
                  • Reads caller's OpenRouter key from Clerk
                    (Clerk Backend API) per request
                      │
            ┌─────────┼──────────┬──────────────┐
            ▼         ▼          ▼              ▼
   Neon Postgres   Clerk      OpenRouter   (Clerk also stores
   • users         Backend    API           the user's API key
   • conversations API        (user's key)  in privateMetadata)
   • messages    (read key)
```

- **Clerk is the identity source of truth.** Frontend uses Clerk hosted components.
  Every authed request to FastAPI carries a Clerk session JWT.
- **FastAPI becomes multi-tenant.** The single global `OPENROUTER_API_KEY` and shared
  conversation store are removed. All council/conversation operations are scoped to the
  authenticated user; inference uses that user's key, read from Clerk `privateMetadata`
  via the Clerk Backend API per request.
- **Monorepo, two deploys:** `frontend/` → Vercel, `backend/` → Railway/Render.

## Data Model (Neon Postgres)

```
users
  id              uuid pk
  clerk_id        text unique not null      -- Clerk JWT 'sub'
  email           text
  created_at      timestamptz default now()

-- NOTE: the OpenRouter API key is NOT stored here. It lives in Clerk
--       privateMetadata (server-only). No key table, no encryption.

conversations
  id              uuid pk
  user_id         uuid not null fk → users(id) on delete cascade   -- indexed
  title           text
  created_at      timestamptz default now()

messages
  id              uuid pk
  conversation_id uuid not null fk → conversations(id) on delete cascade  -- indexed
  role            text not null              -- 'user' | 'assistant'
  content         text                       -- user text (null for assistant)
  stage1          jsonb                      -- assistant only
  stage2          jsonb                      -- assistant only
  stage3          text                       -- assistant only
  documents       jsonb                      -- uploaded doc text (existing feature)
  position        int not null               -- order within conversation
  created_at      timestamptz default now()
```

This mirrors the current JSON message shape (`{role, stage1, stage2, stage3}` +
documents), relational and user-scoped. Computed metadata (`label_to_model`,
`aggregate_rankings`) remains ephemeral — returned by the API, not persisted, exactly
as today.

## API-Key Handling (Clerk privateMetadata — no custom encryption)

The raw OpenRouter key never touches our database or our encryption code. Clerk stores
it in the user's `privateMetadata` (server-only readable). We mirror non-secret status
(`hasKey`, `last4`, `validatedAt`) into `publicMetadata` so the UI can show key state
without a backend round-trip.

- **Set (Next.js server action `setOpenRouterKey`):** runs server-side where Clerk's
  Backend SDK is available. Validates the key against OpenRouter with a cheap call (list
  models / minimal ping); on success writes the raw key to `privateMetadata.openrouterKey`
  and `{hasKey:true, last4, validatedAt}` to `publicMetadata`. Rejects invalid keys with
  a clear error. The raw key is never persisted client-side or in our DB.
- **In use (FastAPI):** when running a council, FastAPI reads the caller's key from Clerk
  via the Backend API (`GET /users/{id}` → `privateMetadata.openrouterKey`, using
  `CLERK_SECRET_KEY`), passes it to the existing `query_model()` calls in-memory, then
  discards it. **Never logged, never returned to the client.** Short-lived per-user cache
  is acceptable to avoid a Clerk call on every request.
- **Read status:** the UI reads `publicMetadata` (`hasKey`, `last4`, `validatedAt`)
  directly from the Clerk session — no backend call needed.
- **Delete (server action):** clears `privateMetadata.openrouterKey` and resets
  `publicMetadata`.
- **No key = no council:** council endpoints return `409` when `privateMetadata` has no
  key; the UI shows the inline "add your key" panel.

Trade-off accepted: this trusts Clerk to store the user's own key. That is consistent
with Clerk already being the identity trust anchor, and it removes the most
security-sensitive custom code (AES-GCM, master secret, key table).

## Auth & Request Authorization

Sign-up / sign-in via Clerk hosted components: username + password, email required,
Smart CAPTCHA (Turnstile) + bot detection enabled on sign-up.

Authorization flow:

```
1. User signs in → Clerk issues a session JWT (held by Clerk SDK in the browser)
2. Frontend calls FastAPI with  Authorization: Bearer <clerk_jwt>
3. FastAPI dependency get_current_user():
     • fetch + cache Clerk JWKS; verify signature, exp, audience/issuer
     • extract clerk_id from 'sub'
     • lazy upsert into users (create row on first sight) → return user row
4. All conversation/key/message routes depend on get_current_user();
   every query is scoped by user_id (no cross-tenant access).
```

- **First-login provisioning:** lazy upsert on first JWT seen. No webhook for v1.
  (Clerk webhook for account-deletion → cascade-delete user data is a fast-follow.)
- **CORS:** FastAPI allows only the Vercel production + preview domains, with the
  Authorization header permitted.
- **Route protection:** Next.js middleware protects `/app/*` (council); the marketing
  landing page is fully public.

## Frontend — Next.js Migration + Landing Page

```
frontend/  (Next.js App Router + TypeScript → Vercel)
  app/
    (marketing)/page.tsx     → landing page (public, SSR)
    app/page.tsx             → council chat UI (protected, client-rendered)
    sign-in/, sign-up/       → Clerk pages
    layout.tsx               → ClerkProvider, fonts, persistent footer
  middleware.ts              → Clerk: protect /app/*, marketing public
  components/
    council/  ← Stage1/2/3, ChatInterface, Sidebar (ported from Vite)
    landing/  ← Hero, HowItWorks, WhyCouncil, ProductPeek, Byok, FAQ, CTA, Footer
    settings/ ← ApiKeyPanel (inline)
  lib/api.ts                 → fetch wrapper; attaches Clerk JWT;
                               base URL from NEXT_PUBLIC_API_URL
```

**Migration approach:** the council UI ports mechanically — React components move in
largely as-is; `api.js` → `lib/api.ts` (attaches Clerk JWT, targets the backend URL);
SSE streaming logic unchanged; CSS carries over. Council chat stays client-rendered
behind auth (SSR only matters for the public landing page).

**Landing page — Direction A (Cinematic Deliberation Chamber):**

- Motion: **Framer Motion** for orchestrated + scroll-driven motion; CSS for ambient
  loops (orbiting nodes, glow pulses). Hero parallax, section reveals on scroll.
  Honors `prefers-reduced-motion`.
- Sections, top to bottom (approved):
  1. **Hero** — headline + subhead + "Start your council" CTA; orbiting council nodes
     converging; sign in / sign up top-right.
  2. **How it works** — animated 3-stage walkthrough (parallel answers → anonymized
     peer review & ranking → chairman synthesis).
  3. **Why a council beats one model** — value props (anonymized review kills
     favoritism, diverse models catch errors, full transparency); feature cards.
  4. **Product peek** — stylized screenshot of the real council UI (stage tabs +
     aggregate ranking).
  5. **Bring your own key** — "Free to use — you only pay OpenRouter directly. Your
     key, your data." 3-step: sign up → paste key → run.
  6. **FAQ** — is it free, where's my key stored, which models, is my data private.
  7. **Final CTA band** — large closing "Convene your council" button.
  8. **Footer** — "Built by Nikolay Advolodkin" → LinkedIn; GitHub repo link; vibe-code
     warning carried from README.
- **Performance guardrails:** animate transform/opacity only; lazy-load below-the-fold
  to protect first paint and the SSR/SEO win.

## Backend Endpoints (after change)

Key management is handled by **Next.js server actions** (set / delete), not FastAPI,
because that is where Clerk's Backend SDK and validation live. Key *status* is read from
Clerk `publicMetadata` client-side. FastAPI is responsible only for council +
conversations:

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/conversations` | yes | scoped to user |
| POST | `/api/conversations` | yes | create for user |
| GET | `/api/conversations/{id}` | yes | 404 if not owned by user |
| POST | `/api/conversations/{id}/message` | yes | 409 if no key; runs council with user's key |
| POST | `/api/conversations/{id}/message/stream` | yes | SSE; 409 if no key |

`storage.py` is reimplemented against Postgres (user-scoped). The council logic
(`council.py`, `openrouter.py`) changes only to accept a per-request API key instead of
reading a global config value. A small Clerk client module reads the caller's key from
`privateMetadata` (with a short-lived per-user cache).

## Testing

- **Backend (pytest, extends existing suite):**
  - auth dependency: valid / invalid / expired JWT
  - Clerk key-read module: returns key when present, raises when absent (mock Clerk API)
  - per-user isolation: user A cannot read user B's conversations
  - `409` when council invoked and the user has no key in Clerk
  - existing council + document tests retained
- **Frontend (Vitest):**
  - `setOpenRouterKey` server action: validates against OpenRouter (mock accept + reject),
    writes Clerk metadata on success
  - ApiKeyPanel states: no key / has key / invalid key (driven by `publicMetadata`)
  - api wrapper attaches Clerk JWT
  - landing page renders core sections
  - ported council component tests retained
- **Manual smoke before launch:** sign up (with CAPTCHA) → add key → run council →
  watch streamed stages → sign out / back in → data persists.

## Deployment & Secrets

- **Frontend → Vercel** (root `frontend/`): `NEXT_PUBLIC_API_URL`, Clerk publishable
  key, Clerk secret key.
- **Backend → Railway/Render** (`python -m backend.main`): `DATABASE_URL` (Neon),
  `CLERK_SECRET_KEY` (to read key from Clerk Backend API), Clerk JWKS URL / issuer,
  allowed CORS origins. The global `OPENROUTER_API_KEY` is removed; no `KEY_ENC_SECRET`.
- **Secrets:** all via platform env vars, never committed.

## Implementation Phasing (single spec, built in order)

1. **Backend multi-tenancy:** Neon Postgres schema + migrations; Clerk JWT verification
   dependency; Clerk key-read module (reads `privateMetadata`, short cache); reimplement
   `storage.py` user-scoped; thread per-request key through `council.py`/`openrouter.py`;
   remove global key.
2. **Frontend scaffold:** Next.js + TypeScript + Clerk; port council UI; `lib/api.ts`
   with JWT; `setOpenRouterKey`/delete server actions; inline ApiKeyPanel driven by
   `publicMetadata`; route protection middleware.
3. **Landing page:** Direction A with Framer Motion; all 8 sections; footer credit.
4. **Deploy + wire:** Vercel + Railway/Render env config; CORS; end-to-end smoke test.

## Out of Scope (v1)

- Per-user council/model customization (fixed council for now).
- Free trial / demo runs (BYO key only).
- Clerk account-deletion webhook → data cascade (fast-follow).
- Email verification gate before first run (optional later).
- Persisting computed metadata to the DB.

## Open Inputs (needed at implementation time, not design gaps)

- Exact LinkedIn URL for the footer credit.
- Choice of Railway vs Render (either satisfies the design; pick at deploy time).

# LLM Council — Frontend (Next.js + TypeScript)

Next.js 15 (App Router) app: public marketing landing page + Clerk-authenticated
council UI. Talks to the FastAPI council backend over an authed `fetch` wrapper
(`lib/api.ts`) that attaches the Clerk session JWT.

## Develop

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev
```

## Scripts

- `npm run dev` — Next dev server
- `npm run build` — production build
- `npm test` — Vitest unit/component tests
- `npm run lint` — Next ESLint

## Environment variables

See `.env.example`:

- `NEXT_PUBLIC_API_URL` — FastAPI backend base URL
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` — Clerk keys
- `NEXT_PUBLIC_AUTHOR_LINKEDIN_URL` / `NEXT_PUBLIC_GITHUB_REPO_URL` — footer links

## Clerk dashboard configuration (manual, deferred)

These must be set in the Clerk dashboard — they cannot be configured from code:

- Enable **Username + Password** authentication and require **email** (for password reset).
- Enable **Smart CAPTCHA (Cloudflare Turnstile)** and bot protection on sign-up.
- Configure allowed origins / paths so `/sign-in`, `/sign-up`, and `/app` resolve.

## Routes

- `/` — public marketing landing page
- `/sign-in`, `/sign-up` — Clerk hosted auth components
- `/app` — council UI (protected by `middleware.ts`)

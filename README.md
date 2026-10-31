# Closer

Plan something that brings you closer. A thoughtful celebration companion that helps you plan personal celebrations, adapt when things change, and keep every decision in your hands. Built for PromptWars Virtual, Challenge 5.

Project documents: [`prd.md`](prd.md) · [`design.md`](design.md) · [`architecture.md`](architecture.md) · [`rules.md`](rules.md) · [`task_today.md`](task_today.md) · [`PROMPT_LOG.md`](PROMPT_LOG.md)

## Stack

Next.js (App Router) and TypeScript, Tailwind CSS v4, shadcn/ui, Framer Motion, Supabase (Postgres, Auth, Storage, RLS), Groq via Vercel AI SDK (`openai/gpt-oss-20b`), Zod, Vitest and Playwright, deployed on Vercel.

## AI Provider

- **Provider:** Groq via `@ai-sdk/groq`
- **Model:** `openai/gpt-oss-20b` (configured in `.env.local` as `AI_MODEL=openai/gpt-oss-20b`)
- **Structured Output:** Strictly typed Zod schemas via `generateText` and `Output.object`.
- **Honest Fallback:** Returns explicit flag `source: "ai" | "fallback"`; UI notifies the user if starter templates are used.
- **Privacy:** Strict error metadata logging only (no prompts, messages, responses, headers, or recipient data).
- **Smoke Testing:** Run live AI smoke tests on-demand with `$env:RUN_LIVE_AI="1"; npm test tests/ai/orchestrator.test.ts`.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in values; never commit .env.local
npm run dev                  # http://localhost:3000
```

| Script | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm test` | Vitest, including the database schema tests (PGlite) |

## Environment variables

See `.env.example`. `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `AI_MODEL_CHAIN`, `COMPAT_BASE_URL`, `COMPAT_API_KEY`, and `COMPAT_LABEL` are server-only and must never be prefixed with `NEXT_PUBLIC_`.

## Database

`schema.sql` is the source of truth for tables, constraints, RLS policies, and rate limiting. Run it in the Supabase SQL editor and enable anonymous sign-ins (Authentication settings). `tests/db/schema.test.ts` runs the same file on PGlite to check integrity rules and privileges.

## Authentication (Supabase Auth)

Authentication uses `@supabase/ssr` with sessions refreshed in Next.js 16's `src/proxy.ts`. Server components read user identity via `supabase.auth.getUser()`.

### Required Supabase Dashboard Steps:
1. **Anonymous Sign-Ins**: Enable in **Authentication > Sign In / Up > Anonymous Sign-Ins**. This allows zero-friction initial plan generation.
2. **Email Provider**: Enable in **Authentication > Providers > Email**.
3. **Google OAuth**: Enable in **Authentication > Providers > Google**, adding `${origin}/auth/callback` to Authorized Redirect URIs in Google Cloud Console and Supabase.
4. **URL Configuration**: In **Authentication > URL Configuration**, set Site URL (`http://localhost:3000` or production URL) and add `http://localhost:3000/**` to Redirect URLs.
5. **Plan Upgrading**: Users with anonymous sessions can upgrade their existing plan via the "Save your plan" flow (`updateUser` for email/password or `linkIdentity` for Google), keeping the exact same `auth.uid()` and preserved relational records.

## Fonts

Fraunces, DM Sans, and Caveat are self-hosted in `src/fonts/` under the SIL Open Font License (licences alongside).

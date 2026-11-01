# Closer

Plan something that brings you closer.

Live application: https://closer-planner.vercel.app/

## What Closer is

Most celebration planning software starts with tasks, spreadsheets and line items. Closer starts with the person: who they are, what they love, and how you hope they will feel. Once that emotional direction is clear, Closer turns it into a concrete plan with a budget, a timeline, backup options and vendor help. You stay in control of every decision. The AI proposes, and you approve.

## Features

- **Three ways to start**: "I have an idea", "Help me discover" (a few gentle questions about the person) and "I need it now" (a fast path for tonight or this week).
- **Plan with a computed budget and timeline**: budget totals and over-budget warnings are calculated by code, not by the AI.
- **Change engine with undo**: when the date, budget or guest count changes, the AI proposes trade-offs that keep the emotional intent. Nothing applies until you approve it, every apply creates a snapshot, and you can restore a previous version.
- **Vendors**: suggestions, a quote parser for pasted vendor emails or WhatsApp messages (with prompt-injection defences), and drafted email or WhatsApp enquiries.
- **Surprise Shield**: a recipient link that reveals nothing before the reveal time (see below).
- **Letters from loved ones**: a contribution link for friends and family, with an organiser review step.
- **Our Blend**: a short quiz comparing how the organiser and a friend understand the recipient's tastes.
- **Calendar and countdown**: countdown, run sheet, optional browser reminders and `.ics` export.
- **Invitation**: a customisable invitation card, exportable as PNG or HTML, plus an email draft.
- **Voice input**: speech input on the intake form, with an English and Hindi toggle.
- **Bring your own key (BYOK)**: use your own Groq or Gemini key for the session.

## How it works: AI proposes, code decides

- **Deterministic engine (`src/lib/engine`)**: money is handled in integer minor units, so there is no floating-point drift. Budget, timeline, versions, the Shield rules and the `.ics` export are plain, tested code.
- **AI provider chain (`AI_MODEL_CHAIN`)**: requests go through an ordered list of models. Rate limits, server errors and timeouts trigger a backoff and fail over to the next entry. A failing entry is skipped for a 60-second cooldown (kept in memory per server instance). If the whole chain fails, a template fallback is used and clearly labelled (`source: "fallback"`).
- **Validated output**: AI responses are parsed against Zod schemas. Invalid output is retried once, then falls back.

## Surprise Shield

- Share tokens are 32 random bytes. Only a SHA-256 hash is stored, so a database leak cannot reveal a working link.
- Before `reveal_at`, the server returns a neutral cover state with no message and no letters.
- Expired, revoked, unpublished and unknown tokens all return the same generic 404.
- Recipient endpoints send `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
- All of this is enforced on the server, not by hiding things in the interface.

## Security

- **Row Level Security** is enabled on all 12 tables in `schema.sql`.
- **Headers**: Content Security Policy, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and HSTS (see `next.config.ts`).
- **Rate limiting**: Postgres-backed `rate_limit_hit()`, with an in-memory fallback. AI endpoints allow 10 requests per 60 seconds per user.
- **BYOK**: keys live in `sessionStorage` for the tab session, are sent per request in a header, and are not stored or logged. A BYOK request never silently falls back to the server key.
- **Server-only secrets**: the Supabase service-role client and environment loader import `server-only`.

## Tech stack

Versions are from `package.json`.

- Next.js 16.4.3 (App Router), React 19.3.0, TypeScript 5
- Tailwind CSS v4, Lucide React, Framer Motion 14.7.1
- Supabase: `@supabase/ssr` 0.12.7, `@supabase/supabase-js` 2.118.0
- Vercel AI SDK `ai` 7.0.155 with `@ai-sdk/groq`, `@ai-sdk/google` and `@ai-sdk/openai-compatible`
- Zod 4.6.7, DOMPurify 3.4.17, html-to-image 1.11.13
- Vitest 5.0.5 with PGlite 0.5.12, Playwright 1.64.1 with axe-core 4.14.0

## Getting started

Prerequisites: Node.js 20.9 or newer, npm, and a Supabase project.

```bash
git clone https://github.com/prakashkamath1926/Closer-Planner.git
cd Closer-Planner
npm install
cp .env.example .env.local   # macOS/Linux; fill in values, never commit .env.local
```

On Windows PowerShell, use `Copy-Item .env.example .env.local` instead of `cp`.

Run `schema.sql` in your Supabase project's SQL editor, then:

```bash
npm run dev          # http://localhost:3000
npm run typecheck
npm run lint
npm test             # Vitest, including database schema tests on PGlite
npm run test:e2e     # Playwright
npm run build
```

Environment variable names (see `.env.example`):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_MODEL_CHAIN`, `GROQ_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `APP_BASE_URL`, and optionally `COMPAT_BASE_URL`, `COMPAT_API_KEY`, `COMPAT_LABEL`, `SUPABASE_PROJECT_REF`. Server-side secrets must never be prefixed with `NEXT_PUBLIC_`.

## AI configuration

Models are configured as an ordered chain:

```env
AI_MODEL_CHAIN=groq:openai/gpt-oss-20b,groq:openai/gpt-oss-120b,google:gemini-3.1-flash-lite
GROQ_API_KEY=your_groq_api_key
GOOGLE_GENERATIVE_AI_API_KEY=your_google_ai_key
```

- **Groq** through `@ai-sdk/groq`.
- **Google Gemini** through `@ai-sdk/google`.
- **Optional OpenAI-compatible endpoint** through `COMPAT_BASE_URL`, `COMPAT_API_KEY` and `COMPAT_LABEL`.

Live AI smoke tests are opt-in: set `RUN_LIVE_AI=1` and run `npm test tests/ai/orchestrator.test.ts`.

## Deploying

Closer runs on Vercel with a Supabase backend.

1. **Anonymous sign-ins**: enable under Authentication, Sign In / Up. They let people plan without an account first.
2. **Email provider**: enable under Authentication, Providers, Email.
3. **Google sign-in**: enable the Google provider.
   - In Google Cloud Console, set the authorised redirect URI to Supabase's callback: `https://<project-ref>.supabase.co/auth/v1/callback`.
   - In Supabase, under Authentication, URL Configuration, add the app callback `https://<your-domain>/auth/callback` to Redirect URLs.
4. **Site URL**: set your production domain in Supabase URL Configuration.
5. **Database**: run `schema.sql` in the SQL editor.
6. Add the environment variables above in Vercel.

Anonymous users can save their plan by upgrading to an email or Google account. The user id stays the same, so their data is kept.

## Project structure

```
src/
├── app/                    # App Router pages and API routes
│   ├── plan/[id]/          # Plan dashboard
│   ├── r/[token]/          # Surprise Shield recipient view
│   └── contribute/[token]/ # Letters from loved ones
├── components/             # UI components
├── fonts/                  # Self-hosted fonts (SIL Open Font License)
├── lib/
│   ├── ai/                 # Orchestrator, router, prompts, schemas, BYOK client
│   ├── engine/             # Deterministic logic (money, budget, timeline, shield, ics)
│   ├── security/           # Rate limiting, sanitisation
│   └── supabase/           # Browser, server and admin clients
└── proxy.ts                # Session refresh and route protection
tests/                      # Vitest, security and Playwright tests
schema.sql                  # Tables, constraints, RLS, rate limiting
```

## Known limitations

- Applying a change makes several sequential database writes, not one atomic transaction.
- Reminders only fire while the page is open.
- The CSP allows `'unsafe-inline'` for scripts and styles.
- The in-memory rate limiter and model cooldown are per server instance.
- Live Supabase RLS tests only run with `SUPABASE_INTEGRATION_TEST=true`; the default suite uses PGlite.
- Accounts are created pre-confirmed, so there is no email verification step.

See [`AUDIT-SECURITY.md`](AUDIT-SECURITY.md) for the security review.

## Built with AI

Generative AI helped draft code, schemas, tests and prompts, and it is also part of the product. The developer set the product direction and the rules (honest by design, human approval for changes, the Shield enforced on the server), chose between options, and ran the tests, reviews and security audit. [`PROMPT_LOG.md`](PROMPT_LOG.md) records the prompts and how they evolved.

## Docs

- [`prd.md`](prd.md): product requirements
- [`architecture.md`](architecture.md): system design
- [`design.md`](design.md): Blush & Botanical design system
- [`rules.md`](rules.md): project rules
- [`DEPLOY.md`](DEPLOY.md): deployment notes
- [`PROMPT_LOG.md`](PROMPT_LOG.md): prompt history

## Challenge

Built for PromptWars Virtual Challenge 5 (Celebration & Event Planner).

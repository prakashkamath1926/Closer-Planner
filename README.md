# Closer

Plan something that brings you closer.  
Live application: https://closer-planner.vercel.app/

## What Closer is

Most celebration planning software starts with tasks, spreadsheets, and line items. Closer starts with the person: who they are, what they love, and how you hope they will feel. Once the emotional direction is clear, Closer turns it into a concrete, executable plan with budgets, schedules, contingency alternatives, and vendor quotes. The human organizer remains in control of every financial and personal commitment, while AI handles the heavy lifting of discovery and adaptation.

<!-- screenshots: add later -->

## Features

- **Three intake paths**: "I have an idea" (maps tasks, costs, and timings for an existing concept), "Help me discover" (3–5 gentle questions exploring personality and feeling), and "I need it now" (fast track defaulting to tonight/this weekend).
- **Computed plan & budget**: Automated budget allocation with over-budget alerts, task checklists with intent tags, and one-click Plan B fallback swapping.
- **Change engine & undo**: When constraints shift (dates, budget, guest count), the AI proposes 2–3 structured trade-offs that preserve emotional intent; applying creates a snapshot for one-click version rollback.
- **Vendor management & quote parsing**: 5-stage status workflow (Suggested to Confirmed), unstructured quote parser with prompt-injection defense, side-by-side quote comparison, and pre-drafted WhatsApp/email inquiries.
- **Surprise Shield**: Recipient teaser portal with confidential budgeting and encrypted share links.
- **Letters from loved ones**: Shareable contribution link for friends and family, with an organizer review step before anything is revealed.
- **Our Blend**: Dual-perspective quiz comparing how the organizer and a confidant understand the recipient's tastes, producing an alignment score.
- **Timeline & calendar**: Real-time countdown ticker, minute-by-minute execution run sheet, browser notification alerts, and RFC 5545 `.ics` export.
- **Invitation mini-site**: Customizable invitation cards with botanical motifs, AI copy helper, and export to PNG, clean standalone HTML, or email draft.
- **Voice input**: Hands-free speech recognition in English and Hindi with live audio feedback.
- **BYOK (Bring Your Own Key)**: Support for personal Google Gemini or Groq API keys directly from the browser.

## How it works: AI proposes, code decides

Closer maintains a strict boundary between probabilistic generation and deterministic logic:

- **Deterministic engine (`src/lib/engine`)**: All financial arithmetic is executed strictly in integer minor units (paise/cents) to prevent floating-point drift. Timeline validation enforces cycle-free Directed Acyclic Graphs (DAGs) so prerequisites always precede dependent tasks.
- **AI provider chain (`AI_MODEL_CHAIN`)**: The server routes requests across an ordered failover chain (e.g. Groq open-weight models followed by Google Gemini). Transient rate limits or server errors trigger automatic backoff and rollover; if the chain is exhausted, a labeled template fallback activates (`source: "fallback"`).
- **Zod-validated structured outputs**: 100% of LLM outputs are validated against strict Zod schemas using `Output.object`. Invalid outputs are rejected and retried once before falling back.

## Surprise Shield

The Surprise Shield guarantees the recipient never accidentally encounters budgets, vendor notes, or unfinished ideas:

- **Cryptographic tokens**: Share tokens are 32 random bytes stored in the database strictly as SHA-256 hashes (`token_hash`). Raw tokens are never persisted.
- **Server-enforced reveal gating**: Before `reveal_at`, the server returns a neutral cover state ("Something special is being prepared") with null messages and empty letters.
- **Generic 404s**: Expired, revoked, unpublished, or invalid tokens all return identical generic 404 responses (`{ "error": "Not found" }`) to prevent enumeration or state leaking.
- **Privacy headers**: All recipient endpoints explicitly send `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

## Security

- **Row Level Security (RLS)**: Enforced across all 11 application tables in Supabase Postgres. Users can only access their own occasions, items, and versions.
- **Security headers & CSP**: Strict Content Security Policy (`frame-ancestors 'none'`, `object-src 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`).
- **Rate limiting**: PostgreSQL-backed rate limiter via `rate_limit_hit()` with an in-memory fallback per server instance (10 requests / 60 seconds for AI endpoints).
- **BYOK privacy**: User-provided API keys are held strictly in browser `sessionStorage`, cleared upon closing the tab, sent via custom request headers, and never persisted to databases or server logs.
- **Server-only secrets**: Service role keys and default AI provider tokens are guarded with `server-only` imports and never reach client bundles.

## Tech stack

- **Framework**: Next.js 16.4.3 (App Router, Turbopack, React 19.3.0, TypeScript 5)
- **Styling**: Tailwind CSS v4, Lucide React (1.63.0), tw-animate-css (1.4.0)
- **Database & Auth**: Supabase (@supabase/ssr 0.12.7, @supabase/supabase-js 2.118.0)
- **AI & Validation**: Vercel AI SDK (ai 7.0.155, @ai-sdk/groq 4.0.72, @ai-sdk/google 4.0.107, @ai-sdk/openai-compatible 3.0.82), Zod 4.6.7
- **Animation & Export**: Framer Motion 14.7.1, html-to-image 1.11.13, DOMPurify 3.4.17
- **Testing**: Vitest 5.0.5 with PGlite 0.5.12, Playwright 1.64.1 with axe-core 4.14.0

## Getting started

### Prerequisites
- Node.js 22.x or newer
- npm 10.x or newer
- A Supabase project

### Setup
```bash
# 1. Clone and install
git clone https://github.com/prakashkamath1926/Closer-Planner.git
cd Closer-Planner
npm install

# 2. Configure environment
cp .env.example .env.local
```

Populate the variable names in `.env.local` (from `.env.example`):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AI_MODEL_CHAIN`
- `GROQ_API_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `APP_BASE_URL`
- Optional: `COMPAT_BASE_URL`, `COMPAT_API_KEY`, `COMPAT_LABEL`, `SUPABASE_PROJECT_REF`

```bash
# 3. Apply database schema
# Run schema.sql in your Supabase project's SQL Editor

# 4. Start development server
npm run dev

# 5. Run verification suite
npm test                 # Vitest unit & schema tests on embedded PGlite
npm run test:e2e         # Playwright end-to-end tests
npm run build            # Production Next.js build
```

## AI configuration

Closer uses an ordered model chain configured via `AI_MODEL_CHAIN` in `.env.local`:
```env
AI_MODEL_CHAIN=groq:openai/gpt-oss-20b,groq:openai/gpt-oss-120b,google:gemini-3.1-flash-lite
GROQ_API_KEY=your_groq_api_key
GOOGLE_GENERATIVE_AI_API_KEY=your_google_ai_key
```

- **Groq**: Fast inference via `@ai-sdk/groq` using models such as `openai/gpt-oss-20b` or `openai/gpt-oss-120b`.
- **Google Generative AI**: Semantic reasoning via `@ai-sdk/google` using models like `gemini-3.1-flash-lite`.
- **Optional OpenAI-compatible**: Custom endpoints via `COMPAT_BASE_URL` (HTTPS only), `COMPAT_API_KEY`, and `COMPAT_LABEL`.

The system tries entries sequentially, automatically applying a 60-second circuit-breaker cooldown upon fatal errors before falling back to local templates.

## Deploying

Deployed on Vercel with a Supabase PostgreSQL backend.

### Supabase dashboard configuration
1. **Anonymous sign-ins**: Enable in **Authentication > Sign In / Up**.
2. **Email provider**: Enable in **Authentication > Providers > Email**.
3. **Google OAuth**: Enable in **Authentication > Providers > Google**.
   - In Google Cloud Console, set the Authorized Redirect URI to Supabase's callback: `https://<project-ref>.supabase.co/auth/v1/callback`.
   - In Supabase **Authentication > URL Configuration > Redirect URLs**, add your application's callback URL: `${origin}/auth/callback`.
4. **Site URL**: In Supabase URL Configuration, set your live production domain (e.g. `https://closer-planner.vercel.app`).
5. **Database schema**: Execute `schema.sql` in the Supabase SQL Editor.

## Project structure

```
src/
├── app/                    # Next.js App Router (pages & API routes)
│   ├── api/                # AI, plan, auth, vendor, blend, and recipient APIs
│   ├── plan/[id]/          # Master celebration dashboard (plan, vendors, timeline, etc.)
│   ├── r/[token]/          # Surprise Shield recipient view
│   └── contribute/[token]/ # Letters from loved ones contributor portal
├── components/             # React UI components (intake, budget, timeline, vendors, modals)
├── lib/
│   ├── ai/                 # Orchestrator, prompts, Zod schemas, router, BYOK client
│   ├── engine/             # Deterministic logic (money, budget, timeline, run-sheet, shield)
│   ├── security/           # Rate limiting and request sanitization
│   └── supabase/           # SSR browser, server, and service-role admin clients
└── proxy.ts                # Next.js session refresh proxy
```

## Known limitations

- **Multi-step change apply**: Applying a trade-off performs sequential database mutations rather than wrapping all item updates in a single atomic database transaction.
- **Client-bound reminders**: Browser task notifications and chimes only fire while the application tab remains open in an active browser session.
- **CSP unsafe-inline**: Content Security Policy permits `'unsafe-inline'` for script and style tags to accommodate runtime hydration and animation styles.
- **Rate limiting scope**: In-memory rate limiting fallback operates per serverless runtime instance rather than across a globally coordinated distributed cache.
- **Integration test gating**: Live Supabase RLS integration tests require `SUPABASE_INTEGRATION_TEST=true` and live database credentials; standard CI runs on embedded PGlite.
- **Pre-confirmed signups**: Account creation endpoints auto-confirm user emails via administrative auth rather than requiring outbound verification emails.

## Built with AI

Detailed prompt history and architectural evolutions are tracked in [`PROMPT_LOG.md`](PROMPT_LOG.md). Generative AI was used as a rapid scaffolding and drafting partner for Zod schemas, React components, and prompt engineering. The human developer established all core constraints, directed the "Honest by Design" philosophy, authored the deterministic financial and DAG engines, and verified every database policy and security boundary.

## Docs index

- [`prd.md`](prd.md) — Product requirements and user journeys
- [`architecture.md`](architecture.md) — System boundaries and state management
- [`design.md`](design.md) — Blush & Botanical design tokens and typography
- [`rules.md`](rules.md) — Development constraints and invariant rules
- [`DEPLOY.md`](DEPLOY.md) — Deployment checklist and environment reference
- [`PROMPT_LOG.md`](PROMPT_LOG.md) — Prompts, decisions, and evolution log

## Challenge

Built with care for PromptWars Virtual Challenge 5 (Celebration & Event Planner).

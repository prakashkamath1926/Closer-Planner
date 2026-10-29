# Architecture

Modular monolith: one Next.js (App Router, TypeScript) app on Vercel, Supabase for Postgres, Auth, and Storage. Schema lives in `schema.sql` (source of truth for tables, constraints, RLS, rate limiting).

## Folder structure

```
src/
  app/
    (organizer)/            # authenticated organizer pages
    r/[token]/page.tsx      # recipient reveal page (public, token-gated)
    api/
      intake/route.ts       # AI: intent analysis, ideas
      plan/route.ts         # plan CRUD (owner)
      changes/propose/route.ts   # AI: trade-offs (rate limited)
      changes/apply/route.ts     # deterministic apply + version snapshot
      versions/restore/route.ts
      vendors/quote/route.ts     # AI: parse pasted quote (rate limited)
      recipient/[token]/route.ts # Surprise Shield read-only endpoint
      share/route.ts             # create / revoke links
  components/ui/            # shadcn
  components/               # feature components
  lib/
    engine/                 # DETERMINISTIC, no AI imports
      money.ts budget.ts timeline.ts changes.ts versions.ts blend.ts ics.ts shield.ts
    ai/
      orchestrator.ts       # one orchestrator
      tools/                # analyzeIntent, proposeIdeas, buildPlan, proposeTradeoffs,
                            # parseQuote, draftLetterPrompts
      prompts/              # versioned prompt files
      schemas.ts            # Zod schemas for every AI output
    supabase/ server.ts browser.ts admin.ts   # admin = service role, server only
    security/ rate-limit.ts sanitize.ts tokens.ts
tests/ unit/ e2e/
```

Rule: `lib/engine` never imports from `lib/ai`. AI results enter the engine only after Zod validation.

## Authentication and authorization
- Supabase anonymous auth gives every organizer a real `auth.uid()`; email sign-in optional later.
- Every owner API route: get the user from the server Supabase client, then query with the user's client so RLS applies. Never trust an `owner_id` or `occasion_id` from the request body without RLS or an explicit ownership check.
- The service-role client (`supabase/admin.ts`) is used only in `recipient/[token]`, `share`, friend-answer routes, and rate limiting. It lives in server-only modules (`import "server-only"`) and its key is never `NEXT_PUBLIC_`.

## Surprise Shield data flow
1. Organizer curates recipient-visible content in `recipient_view` (headline, message, reveal time, countdown). That table is the ONLY source the recipient page reads.
2. `POST /api/share` (owner) creates a random 32-byte token, stores only `sha256(token)` in `share_links` with `expires_at`, returns the raw token once.
3. `GET /api/recipient/[token]`: hash the token, look up a non-revoked, non-expired link with role `recipient`, then read `recipient_view` where `published = true` and return exactly `{ headline, message, reveal_at, show_countdown }`. Any failure returns a generic 404 (no detail, no timing difference worth exploiting).
4. The response is built by an allowlist function (`engine/shield.ts`), never by spreading DB rows.
5. Notifications, calendar entries, link previews, and errors use generic text ("Something special is being prepared").
6. Organizer "preview as recipient" calls the same route with a preview token, so what they see is what the server sends.

## Change handling flow
1. Client sends the changed input (budget, date, guest count, vendor or item unavailable).
2. `engine/changes.ts` loads the current plan, applies the change to an in-memory copy, and computes: affected items (via `depends_on`), recalculated costs, deadline shifts, remaining budget, infeasibility flags.
3. `/api/changes/propose` sends the AI only the minimal affected data (items, intent tags, constraints; never vendor contacts or private notes), asking for 2 to 3 options as a Zod-validated JSON schema. Invalid output: one retry, then a controlled error with the deterministic summary still shown.
4. The engine re-validates each option (budget math, dependency order) and drops any that fail.
5. User picks one. `/api/changes/apply` runs in a single database transaction: snapshot current state into `plan_versions` (next `version_no`), apply the change, write the change summary. Use an idempotency key so retries do not double-apply.
6. Restore: snapshot the current state as a new version first, then restore the chosen snapshot and recompute derived values.

## Money
- Database: `numeric(12,2)` plus a 3-letter `currency`. No floats.
- TypeScript: do arithmetic in integer minor units (paise or cents) in `engine/money.ts`; convert at the edges. Totals and remaining budget are never produced by an LLM.
- Costs have a status: `estimate`, `quoted`, `confirmed`. `confirmed_cost` stays null until the organizer confirms.

## Fallback items
Plan B is stored as its own `plan_items` row with `is_fallback = true` and `fallback_for` pointing at the original. The original is never overwritten. A check constraint prevents self-reference and keeps `is_fallback` consistent with `fallback_for`. Applying a fallback is a user-approved change that goes through the versioned change flow.

The `fallback_for` foreign key is `ON DELETE NO ACTION` (deferrable, initially immediate), not `SET NULL`: SET NULL would violate the consistency constraint and could orphan a Plan B. An original cannot be deleted while a Plan B still points at it. To delete both on purpose, delete them in one statement or one transaction. Deleting an occasion still cascades cleanly. A Plan B can be deleted on its own.

## Plan item references (`depends_on`, `fallback_for`)
- Postgres has no foreign keys on array columns, so a deferred constraint trigger (`plan_items_validate_refs`) checks at commit that every `depends_on` id exists, belongs to the same occasion, and is not the item itself. `fallback_for` must also be in the same occasion. A full plan can be inserted in any order inside one statement or transaction.
- When an item is deleted, its id is removed from other items' `depends_on` (`plan_items_clean_dependents`), so nothing dangles.
- Cycles are not detected in SQL. `engine/timeline.ts` must reject cyclic graphs, and every route that writes `depends_on` validates with Zod and the engine before saving.
- Covered by `tests/db/schema.test.ts` (runs `schema.sql` on PGlite, real Postgres in WASM).

## AI layer
- One orchestrator exposes typed tools; each tool has a Zod input schema, a Zod output schema, and its own versioned prompt file.
- Prompts use an explicit role, fixed constraints, and delimited untrusted data blocks (`<user_data>…</user_data>`) with the instruction that content inside is data, never instructions.
- Groq (`openai/gpt-oss-20b`, configured via `GROQ_API_KEY` and `AI_MODEL=openai/gpt-oss-20b`) called only from server routes via Vercel AI SDK `generateText` + `Output.object` structured output (strict schema mode). Set `maxOutputTokens`, a timeout, and at most one retry. Fallback to Gemini (`GOOGLE_GENERATIVE_AI_API_KEY`) supported.
- When AI calls fail or fall back, an explicit flag (`source: "ai" | "fallback"`) is returned so the client UI displays an honest notice ("AI is unavailable, showing starter templates") rather than misrepresenting templates as AI output.
- Privacy-safe logging: log only tool name, model id, error name, and HTTP status code. Never log prompts, responses, or user content.
- Tools never receive more than they need: the quote parser sees only the pasted text; the invitation generator sees only recipient-approved fields.
- Generated HTML and SVG: allowlist sanitize (DOMPurify or equivalent, scripts, event handlers, and external URLs stripped), rendered in a sandboxed iframe or as static markup. No model-generated JavaScript is executed.

## Rate limiting
- AI routes call `rate_limit_hit('ai:<user_id>', 60, 10)` and `rate_limit_hit('ai-ip:<ip>', 60, 20)` through the admin client before any model call. False means HTTP 429 with a friendly message and `Retry-After`.
- Also cap request body size and input field lengths (Zod `.max()`), and cap the number of regenerations per occasion per hour.
- In-memory limiters do not work reliably on serverless, which is why the counter lives in Postgres.
- `rate_limit_hit` is `SECURITY DEFINER`, revoked from `public`, `anon` and `authenticated`, and explicitly granted to `service_role` only. `rate_limits` has RLS on, no policies, and no grants to `anon` or `authenticated`. Call it only from server code through the admin client. Tests in `tests/db/schema.test.ts` check these privileges.

## Our Blend (P1)
`engine/blend.ts`: fixed question set with typed answers; score = matching comparable answers / comparable answers; unanswered and incomparable questions are excluded and the count is shown. Friend answers come from the organizer's manual entry first (`respondent_role = 'friend'`); link-based entry is a later add-on.

## Security checklist
- [ ] Secrets only in Vercel env vars; `.env*` in `.gitignore`; `.env.example` committed with names only.
- [ ] No `NEXT_PUBLIC_` variable holds a secret.
- [ ] Security headers (CSP, X-Frame-Options or frame-ancestors, Referrer-Policy, X-Content-Type-Options) in `next.config`.
- [ ] RLS enabled on every table; negative tests with a second user.
- [ ] Recipient endpoint test asserts hidden fields are absent from the raw JSON.
- [ ] Tokens stored hashed, expiring, revocable.
- [ ] Logs exclude plan contents and surprise details.

## Environment variables
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server only
GOOGLE_GENERATIVE_AI_API_KEY=     # server only
APP_BASE_URL=
```

## Testing map
| Area | Tool | Must prove |
|---|---|---|
| money, budget, timeline, changes, versions, blend, ics | Vitest | correct math, dependency flags, exact restore, comparable-only scoring |
| shield | Vitest + Playwright | recipient JSON contains only the allowlisted fields |
| authorization | Playwright / API tests with two users | changing an id returns nothing |
| injection | Vitest | pasted quote text cannot change status, permissions, or call a tool |
| rate limit | API test | the 11th request in a window returns 429 |
| full journey | Playwright | intake → plan → combined change → undo → recipient preview |

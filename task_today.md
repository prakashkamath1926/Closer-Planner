# Task Today

Work through these one at a time, in order. Do not start the next task until the current one's acceptance criteria are verified. Log prompts in `PROMPT_LOG.md`.

Read first: `prd.md`, `rules.md`, `architecture.md`, `design.md`, `schema.sql`.

## Task 1: Scaffold and design system
Build: Next.js App Router + TypeScript (strict), Tailwind, shadcn/ui, Framer Motion; `globals.css` and `lib/theme.ts` from `design.md`; fonts via `next/font` (Fraunces, DM Sans, Caveat); app shell (header, responsive layout); `.env.example`; `.gitignore` covering `.env*`.
Done when:
- [x] `npm run dev` and `npm run build` succeed with no type errors.
- [x] The shell renders at 375px and 1280px with the palette and fonts applied.
- [x] A primary button shows white text on `rose` and a visible focus ring.
- [x] No hex values hard-coded in components.

Status: DONE. Notes for later tasks:
- Next.js here is 16.4.x with `cacheComponents` and `partialPrefetching` on (scaffold defaults). Reading cookies or the Supabase session in Task 2 must happen behind a `<Suspense>` boundary or in a request-time component; see `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md`.
- Fonts are self-hosted with `next/font/local` from `src/fonts/` (the sandbox cannot reach Google Fonts at build time; the files are OFL-licensed with licences alongside).
- shadcn/ui is set up by hand (`components.json`, `cn` helper, Button). The CLI could not reach its registry from the sandbox. Add further components by copying their source.
- Tailwind v4 is configured in `globals.css` (`@theme inline`), not a JS config.
- Tests: `npm test` runs Vitest. `tests/db/schema.test.ts` runs `schema.sql` on PGlite.

## Task 2: Supabase setup
Build: run `schema.sql`; enable anonymous sign-ins; browser, server, and admin Supabase clients (`import "server-only"` on admin); generated database types; anonymous session on first visit.
Done when:
- [x] Every table exists with RLS enabled (verified against live Supabase project; all 11 tables present and protected).
- [x] A test with two anonymous users proves user B cannot read or write user A's occasion, plan items, vendors, or versions (16 live tests in `tests/db/rls.test.ts` passed).
- [x] `SUPABASE_SERVICE_ROLE_KEY` does not appear in the client bundle (search the build output).

Status: DONE. Verified against live Supabase project.

## Task 3: Engine modules (no AI yet)
Build in `lib/engine` with Vitest tests: `money.ts` (integer minor units), `budget.ts` (totals, remaining, estimate vs confirmed), `timeline.ts` (dependency order, blocked/ready, urgency mode from time remaining, infeasibility flags), `changes.ts` (apply change, affected items, diff and summary), `versions.ts` (snapshot, restore).
Done when:
- [x] 8 lakh in never yields a plan whose total exceeds 8 lakh without an explicit over-budget flag.
- [x] Moving the date earlier marks dependent tasks and flags infeasible deadlines.
- [x] Restoring a version reproduces the exact snapshot and keeps the replaced state as a new version.
- [x] `timeline.ts` rejects cyclic `depends_on` graphs and dependencies on missing ids (the database does not detect cycles).
- [x] All engine tests pass (24/24 engine tests passed, 59/59 total tests passed).

Status: DONE. All engine modules deterministic with zero AI imports.

## Task 4: AI orchestrator and intake
Build: Zod schemas, one orchestrator with `analyzeIntent`, `proposeIdeas`, `buildPlan`; prompt files; rate limiting via `rate_limit_hit`; intake UI with the three entry paths (3 to 5 questions max); ideas screen with known/possible/needs-confirmation tags and a "why this suits them" note; approve, edit, reject, regenerate.
Done when:
- [x] All three entry paths reach a saved plan.
- [x] Invalid model output is rejected, retried once, and the user's input is preserved if it still fails.
- [x] The 11th AI request in a minute returns 429.
- [x] No price or availability is presented as confirmed.
- [x] The Gemini key is only in server code.

Status: DONE. AI layer hardened with designated provider Groq (`openai/gpt-oss-20b`), structured output schemas adhering to strict JSON Schema mode, privacy-safe metadata logging, honest fallback flags, and comprehensive mock + live smoke test coverage.

## Task 5: Plan, budget, change handling, undo
Build: editable plan with intent tags, costs, dependencies, Plan B rows; budget summary; `propose` and `apply` change routes with a transaction and idempotency key; change summary panel; version history with restore.
Done when:
- [x] The combined scenario passes: budget reduced and date moved earlier; affected items update, 2 to 3 trade-offs appear, the user picks one, a change summary shows, the previous version is saved, and undo restores it (verified in `tests/changes/combined-scenario.test.ts`).
- [x] Unaffected approved items are unchanged (verified in `tests/changes/combined-scenario.test.ts`).
- [x] Trade-offs that fail the engine's budget or dependency check are dropped (verified in orchestrator simulation & `tests/changes/combined-scenario.test.ts`).

Status: DONE. All Task 5 acceptance criteria verified across unit & integration tests.

## Task 6: Surprise Shield and recipient preview route
Build: Organizer curation UI (`headline`, `message`, `reveal_at`, `show_countdown`, `published` stored strictly in `recipient_view`); `POST /api/share` creating 32-byte crypto token stored as sha256 with expiry, returning raw token once; `GET /api/recipient/[token]` returning strictly allowlisted fields via `lib/engine/shield.ts`, returning identical generic 404 for all failures; recipient page `/r/[token]` with botanical frame, countdown, gold sparkles, and generic neutral cover; organizer "preview as recipient" action.
Done when:
- [x] Raw JSON from recipient endpoint contains only allowlisted fields (`headline`, `message`, `reveal_at`, `show_countdown`) and no plan items, budget, vendors, notes, venue, gift, owner_id, or occasion title (Rule 19; verified in `tests/security/shield-api.test.ts` and `tests/engine/shield.test.ts`).
- [x] Expired, revoked, unknown, and malformed tokens all return the identical generic 404 body (Rule 21; verified in `tests/security/shield-api.test.ts`).
- [x] Unpublished `recipient_view` returns generic 404 shield cover (verified in `tests/security/shield-api.test.ts`).
- [x] Editing private items does not alter recipient response (verified by strict allowlist engine and endpoint tests).
- [x] Raw token is never stored in `share_links` (only sha256 hash; verified in `tests/security/shield-api.test.ts`).
- [x] Organizer preview mode allows authenticated owner to view draft recipient view before publishing (verified in `tests/security/shield-api.test.ts`).

Status: DONE. All Task 6 acceptance criteria verified with unit, API, and negative security tests.

## Later tasks (do not start yet)
7 Vendor checklist and quote comparison · 8 Calendar, countdown, `.ics` · 9 Invitation or mini-site deliverable · 10 Our Blend (manual friend entry) · 11 Security and accessibility pass, Playwright journey, deploy · 12 Video, LinkedIn post, submit early.

## Reminder
Confirm the exact cutoff, timezone, and attempt rules on the PromptWars dashboard (reported: Sunday, November 1, 2026, 11:59 PM). Submit before the final day's evening.

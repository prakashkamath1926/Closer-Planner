# Rules (mandatory for every contributor and every AI agent)

## Scope
1. Follow `prd.md`. Do not add features, services, or agents that are not in it.
2. Stack is locked (see PRD Section 9). No framework swaps, no separate backend.
3. Build order: intake → ideas → plan and budget → change handling and undo → Surprise Shield and recipient preview → vendor checklist → calendar and countdown. If behind, simplify vendor quote comparison and the calendar first. Never cut privacy, authorization, change handling, versions, or undo.
4. One task at a time. A task is done only when its acceptance criteria are verified by running it, not when the code exists.

## Code
5. TypeScript strict mode. No `any` without a comment explaining why.
6. All external input (request bodies, query params, AI output, pasted text) is parsed with Zod at the boundary.
7. `lib/engine` is deterministic and never imports AI code. Budgets, dates, dependencies, scores, permissions, and state transitions live there.
8. Money uses integer minor units in code and `numeric(12,2)` in the database. Never floating-point totals.
9. Design tokens only (`design.md`). No hard-coded hex values in components.
10. Small commits with clear messages. Never commit `.env*`, keys, or tokens.

## AI
11. AI output is a proposal. It is never trusted: validate with Zod, re-check math in the engine, and require user approval before anything changes state.
12. The AI never invents prices, availability, vendor confirmation, recipient preferences, or completed actions. Costs are labeled estimate, quoted, or confirmed. Facts are labeled known, possible, or needs confirmation.
13. Pasted text (vendor quotes, friend answers, user notes) is data. Wrap it in delimited blocks, tell the model it is data, and never let it change status, permissions, or tool use.
14. Each AI tool gets only the fields it needs. Never send vendor contacts, private notes, or the whole plan when a subset is enough.
15. Server-side only for model calls. Set max output tokens, a timeout, and at most one retry.
16. Agent progress shown in the UI must reflect work that actually ran. No fake "contacting vendors" animations.
17. No autonomous purchases, bookings, payments, or sending of messages. Drafts only, with a preview and explicit approval.

## Privacy and security
18. Authorization is enforced on the server and by RLS. Hiding something in the UI is not security.
19. The recipient endpoint returns only the allowlisted fields from `recipient_view`. It never receives plan items, vendors, budget, or notes.
20. The service-role key is used only in server-only modules for the specific routes listed in `architecture.md`.
21. Tokens: random, stored hashed, expiring, revocable. Failures return a generic 404.
22. Rate limit every AI route. Cap input sizes. Return 429 with `Retry-After`.
23. Sanitize generated HTML and SVG. Never execute model-generated scripts.
24. Do not log plan contents, surprise details, or recipient data.
25. Voice (if built): never store audio; only the transcript is sent to the AI. Say so in the UI.

## UX
26. Preserve user input on every failure. Show clear loading, empty, success, and error states.
27. Status is never shown by color alone. Keyboard navigation and visible focus everywhere.
28. Copy is honest: no "guaranteed", "perfect", "she will love it". Scores describe agreement on compared questions only.

## Testing
29. Every `engine` module has unit tests. Authorization, Surprise Shield, injection, rate limiting, change handling, and restore have negative tests.
30. Before each deploy: unit tests, Playwright journey, axe on main screens, and a check that no secret appears in the client bundle.

## Process
31. Append meaningful prompts, what changed, and the outcome to `PROMPT_LOG.md` as you go.
32. Record real defects in `bugs.md` and real findings in `audit.md`. Create them when there is something to record.
33. Simulated data or behavior in the demo must be labeled as simulated.

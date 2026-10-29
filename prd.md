# Product Requirements Document (PRD)

**Status: LOCKED.** Four implementation clarifications (marked **[Clarified]**) were folded in without reopening product scope.

## 1. Document Information

- **Product:** Celebration Planner (working title)
- **Event:** PromptWars Virtual Hackathon, Challenge 5: Celebration & Event Planner
- **Target:** Functional, deployed, demonstrable hackathon MVP
- **Reported deadline:** Sunday, November 1, 2026, 11:59 PM. Confirm the exact cutoff, timezone, and attempt rules on the official hackathon dashboard before submission.
- **Reported submission attempts:** Three, with only the final attempt counting. Treat as unverified until confirmed on the dashboard.

## 2. Product Vision

### The problem
People want to create celebrations that make someone feel loved, understood, and special. They struggle to turn intentions into thoughtful, practical plans that account for preferences, budgets, timelines, vendors, and last-minute changes. Generic idea generators suggest activities, but a useful planner must also help users make decisions, manage dependencies, prepare deliverables, and adapt when circumstances change.

### The solution
An AI-assisted celebration planning companion that helps an organizer understand what matters to the recipient, create a personalized plan, manage its practical details, and turn approved ideas into shareable deliverables. It should feel like a thoughtful companion, not a corporate event-management dashboard.

### Core promise
**Turn the intention to make someone feel special into a thoughtful, personal, and achievable celebration plan, even when things change.**

The product must never claim to know exactly how someone feels or guarantee an emotional outcome.

## 3. Target Users

- **Primary: the organizer.** Plans a birthday, anniversary, proposal, graduation, family gathering, or other meaningful occasion. May have a complete idea, a vague intention, limited time, a strict budget, or little experience.
- **Secondary: a trusted collaborator.** A friend or family member invited to contribute ideas or help coordinate. Can only access information explicitly shared with them.
- **Optional: the recipient.** May voluntarily share preferences or post-event feedback. If the celebration is a surprise, recipient participation must not reveal it before the organizer approves disclosure.

## 4. Product Principles

1. **Meaning before logistics:** understand the intention behind the celebration, not just its event type.
2. **Personalization with evidence:** base suggestions on supplied preferences and label assumptions.
3. **Practical execution:** connect creative ideas to budgets, timelines, dependencies, vendors, and deliverables.
4. **Change resilience:** adapt affected parts of a plan when circumstances change without forcing a restart.
5. **Human control:** the organizer reviews and approves significant plan changes and external actions.
6. **Transparent uncertainty:** distinguish known facts, estimates, suggestions, and details needing confirmation.
7. **Privacy by design:** keep private planning information separate from collaborator-facing and recipient-facing information.
8. **Honest AI:** never invent verified prices, availability, completed bookings, or recipient preferences.
9. **Budget respect:** work within the stated budget without pressuring users to spend more.
10. **Graceful failure:** preserve user work and explain failures clearly.

## 5. Primary User Journey

1. **Describe the intention:** occasion, recipient, desired emotional outcome.
2. **Provide essential context:** a small number of relevant questions about preferences, budget, timing, constraints.
3. **Generate ideas:** a small set of personalized concepts with explanations.
4. **Choose a direction:** edit, approve, reject, or regenerate.
5. **Build the plan:** activities, tasks, dependencies, costs, vendors, deliverables.
6. **Prepare for the event:** timeline, urgency, countdown, calendar.
7. **Handle changes:** update constraints, review affected items, compare alternatives, approve a revised plan.
8. **Protect the surprise:** review the recipient-facing view without exposing private organizer notes.
9. **Create and share deliverables:** preview and export approved materials.
10. **Optionally reflect:** record outcomes or compare organizer guesses with recipient-provided answers when implemented.

The primary journey must work for one organizer without requiring a collaborator or recipient account.

## 6. Functional Requirements

### 6.1 Celebration intake (P0)
Collect the minimum information necessary for a useful plan. Initial intake asks about 3 to 5 questions, with optional follow-ups only when answers could materially change the plan.

**[Clarified] Three entry paths** lead into the same intake and planning system, with different initial prompts and urgency defaults:
- **"I have an idea"**: the organizer states the concept; the system fills gaps and builds the plan.
- **"Help me discover one"**: gentle discovery questions, then three ideas.
- **"I need something now"**: skips the long questionnaire, defaults to `tonight` urgency, asks only essentials.

Potential inputs: occasion and relationship; recipient name or nickname (optional); what the organizer wants the recipient to feel, remember, or experience; known interests, preferences, dislikes, constraints; budget and currency; event date, preparation time, location; guest count and format; accessibility, dietary, and other practical requirements; whether it must remain a surprise.

Requirements: support text input; preserve input when validation or AI generation fails; allow skipping nonessential questions; separate user-provided information from AI assumptions; require no unnecessary sensitive information.

**Voice input** is optional for the MVP. If implemented, disclose that browser speech recognition may process audio through its provider. The application must not retain raw audio; only the transcript goes to the AI backend. Do not claim no third party processes the audio.

### 6.2 Personalized idea generation (P0)
Generate a small, curated set of relevant concepts. Each includes: title and description; why it may fit the intention and known preferences; activities, materials, or preparation steps; estimated cost or range when reasonably supportable; required time and dependencies; assumptions and items needing confirmation; at least one alternative where appropriate.

The organizer can approve, edit, reject, request alternatives, and refine when constraints change. The AI must not invent preferences, prices, vendor confirmations, or other facts.

### 6.3 Plan management and intent tags (P0)
An approved plan contains editable items (activities, tasks, purchases, vendor requirements, deliverables). Each meaningful item supports: stable identifier; description and category; status; date or relative deadline; dependencies; estimated and confirmed cost; an **intent tag** (the feeling, message, or purpose it serves, e.g. nostalgia, thoughtfulness, quality time, surprise, celebration); assumptions or confirmation requirements.

Intent tags connect the emotional goal to the practical plan. If an item becomes unavailable or too expensive, alternatives should preserve its intent where reasonably possible. The user edits the plan without restarting.

### 6.4 Budget management (P0)
- Record estimated, confirmed, and unknown costs distinctly.
- Calculate totals, remaining budget, and changes in deterministic application code.
- Update affected totals when items, guest count, or other constraints change.
- Distinguish user-provided quotes from independently verified prices.
- Identify when a proposed change exceeds the budget.
- Never silently increase the budget or remove an approved item.

The AI may suggest cost-saving alternatives; application code performs calculations.

### 6.5 Timeline, dependencies, urgency, and calendar (P0)
Three urgency modes: **Tonight** (immediate essentials, critical dependencies), **This week** (deadline, effort, dependency), **Weeks away** (milestones, scheduled preparation).

Requirements: deadlines or meaningful relative timing; track dependencies and do not present dependent tasks as ready before prerequisites are complete; highlight urgent, overdue, blocked, completed; in-app calendar; countdown to the main event; downloadable `.ics` where appropriate; consistent timezone and date handling; recalculate deadlines and urgency when the date moves; identify infeasible or conflicting timelines instead of pretending every task remains achievable.

### 6.6 Change handling (P0, core differentiator)
A first-class workflow, not a regeneration button. Triggers: budget up or down; event date earlier or later; guest count change; vendor unavailable, over budget, or unable to meet a requirement; item or activity unavailable; changed preference or constraint.

Workflow:
1. Capture the changed input.
2. Identify affected items and dependencies using application logic.
3. Recalculate deterministic values (costs, deadlines, remaining budget).
4. Ask the AI to propose **2 to 3 trade-offs** where enough viable alternatives exist.
5. Explain what each option changes, preserves, and assumes.
6. Preserve intent tags and prioritize original purpose for replacements.
7. Let the organizer choose, edit, or reject.
8. Apply the approved change and persist it.
9. Show a concise change summary (added, removed, modified, unaffected).
10. Preserve the previous version so the organizer can undo.

The AI must not autonomously replace approved items or make external commitments. If fewer than two feasible alternatives exist, show what is available and explain the limitation rather than inventing choices.

### 6.7 Version history and undo (P0)
- Store versions in `plan_versions` with identifier, plan, creation time, and enough state to restore.
- Preserve the version before an approved change is applied.
- Simple history view; one-click restore with confirmation.
- Restoration is a new change that preserves the version being replaced.
- Recalculate or validate derived values after restoration.
- Same authorization and privacy rules as ordinary plan access.

### 6.8 Vendor checklist and quote comparison (P0, simple)
A vendor entry supports: category and name (if known); requirement served; questions to ask; budget or quote; notes and status; a fallback option.

Status ladder: **Suggested** (to investigate) → **Verified** (checked against a source or confirmed by the organizer) → **Contacted** (organizer contacted the vendor) → **Confirmed** (organizer confirmed the arrangement). Status never advances automatically from AI-generated text.

Pasted-quote comparison extracts comparable fields where possible: price and currency; included services; date or availability statements; additional fees; cancellation or payment terms; missing information and questions.

Requirements: keep quoted information distinct from verified facts; identify missing or incomparable fields; do not infer availability or booking from a quoted date; do not send vendor messages or make bookings autonomously; treat pasted text as untrusted data, never instructions; provide a fallback list for important vendor-dependent items. Live vendor search, booking, and payment are out of scope.

### 6.9 Plan B and fallback options (P0)
Important items get a practical fallback where possible, describing: the original item that triggered it; the intent tag it preserves; the replacement; estimated cost and timing where supportable; dependencies and trade-offs; facts needing confirmation. The user approves the replacement. If none is reasonable, explain and offer the next useful action.

### 6.10 Creative deliverables (P0)
At least one complete workflow end to end; the initial target is a personalized invitation or celebration mini-site. Optional: personal letters, PNG or SVG assets, checklist or schedule, `.ics`.

Requirements: preview before export; editable before finalization; generated from approved plan information; validate and sanitize generated HTML and SVG; never execute model-generated scripts; exclude organizer-only information from recipient-facing output; show only information approved for the intended audience. Extra formats must not delay the core workflow.

### 6.11 Surprise Shield (P0)
- Keep private organizer notes and surprise details separate from recipient-visible content.
- Enforce access restrictions on the server.
- Recipient-facing endpoints return only explicitly approved recipient-visible fields; never send hidden details and rely on the UI to hide them.
- Avoid exposing sensitive details through notifications, link previews, exports, or error messages.
- Let the organizer preview the recipient-facing experience.
- Safe sharing defaults and revocable access where supported.

It reduces accidental disclosure; it cannot guarantee secrecy if an account, device, or link is compromised.

### 6.12 Our Blend (P1)
**Pre-event Vibe Match:** organizer answers questions about the recipient's preferences or the planned experience; may manually enter answers from a trusted friend participating with permission; compare compatible answers with deterministic scoring; show matches, differences, missing answers; explain how differences could inform planning. **Cut line:** manual collaborator answers before invitation links.

**Post-event Guess vs. Truth:** organizer records guesses; recipient may optionally answer after the event; compare only compatible answers available from both. **If time is short:** drop Guess vs. Truth first, then collaborator invitation links.

Scoring: computed in code; exclude unanswered or incomparable questions; display the number compared; explain what the score represents and its limits; never a measure of love, relationship quality, or predicted happiness; never require recipient participation before a surprise.

### 6.13 Collaboration and sharing (P1)
Optional; must not block the single-organizer journey. Explicit invitation and controlled access; server-side authorization; revocable where supported; no private notes unless authorized; pasted collaborator answers cannot change permissions or trigger actions; review and approval before email or other external actions. If secure collaboration cannot be completed in time, defer it.

### 6.14 AI interaction and deterministic controls (P0)
AI interprets intentions, generates concepts, explains trade-offs, proposes adaptations. Application code owns: authentication and authorization; permission checks; state transitions and approvals; budget calculations; dependency and deadline calculations; version persistence and restoration; Our Blend scoring; input validation; export safety; external-action authorization.

The AI must not autonomously purchase, book, send messages, or disclose private information. User content, vendor quotes, collaborator answers, and model outputs are untrusted; embedded instructions must not override system rules, alter permissions, or authorize tools.

## 7. Non-Functional Requirements

### 7.1 Security and privacy
- Server-side authorization for protected operations; Supabase RLS and least privilege.
- Keep API credentials server-side; never expose the Gemini key in client code.
- **[Clarified] Rate limiting** on all AI endpoints (per user and per IP), with request validation, input length caps, and generation limits (max output tokens, bounded retries).
- Validate structured inputs with Zod.
- **[Clarified] Authentication:** Supabase anonymous auth for the MVP, email sign-in optional. Server-side authorization requirements still apply in full.
- Treat user text, quotes, and AI outputs as untrusted; prevent prompt injection from authorizing tools, changing state, or bypassing permissions.
- Minimize retained personal data; obtain consent before saving reusable preferences; provide correction and deletion paths.
- Avoid unnecessary logging of private plans and surprise details.
- Safe sharing defaults; protect version history and exports with the same controls as the plan.

### 7.2 Reliability
Preserve input across recoverable errors; handle invalid AI responses and service failures; avoid duplicate state changes on retries; use transaction boundaries for plan changes and version creation; confirm success before showing a completed state; never silently discard approved decisions.

### 7.3 Accessibility and usability
Responsive mobile and desktop; semantic HTML, labeled forms, keyboard navigation; visible focus; WCAG 2.2 AA text contrast where applicable; status labels not reliant on color alone; clear loading, empty, success, error states; welcoming to nontechnical users; clear trade-offs and change summaries.

### 7.4 Maintainability
TypeScript throughout; Zod at boundaries; shared design tokens and reusable components; deterministic logic separate from AI prompts; documented setup, environment variables, migrations, deployment; automated tests for business logic, change handling, authorization, and privacy boundaries.

## 8. Design Direction
**Blush & Botanical.** Warm, personal, elegant, lightly scrapbook-inspired; not corporate, cluttered, or childish. Warm paper background, white cards, blush surfaces, rose accents; cocoa-plum text; serif display headings, clean sans UI text, limited handwritten accents; restrained botanical illustration, soft shadows, rounded cards; clear distinction between organizer-only, collaborator-visible, and recipient-visible experiences; consistent tokens. Palette and tokens: `design.md`.

## 9. Technical Constraints
Locked unless a concrete blocker is found: Next.js App Router + TypeScript; Tailwind, shadcn/ui, Framer Motion; Supabase PostgreSQL, Auth, Storage, RLS; Groq (`openai/gpt-oss-20b`) via Vercel AI SDK (`GROQ_API_KEY`, `AI_MODEL=openai/gpt-oss-20b`; server-side credentials with optional Gemini fallback via `@ai-sdk/google`); Zod and React Hook Form; typed TypeScript business modules; Vitest and Playwright; Vercel; Google Antigravity. No microservices, separate Python backend, or multiple autonomous agents without a demonstrated need.

## 10. Scope and Priorities

### P0: required for the MVP
1. Responsive shell and design system.
2. Intake with limited, relevant questions and three entry paths.
3. Personalized ideas with transparent assumptions.
4. Edit, approve, reject, regenerate.
5. Editable plan with intent tags.
6. Deterministic budget calculations.
7. Timeline, dependencies, urgency modes, in-app calendar, countdown.
8. Change handling with 2 to 3 trade-offs and a change summary.
9. Version history and restoration.
10. Vendor checklist, quote comparison, fallback options.
11. Plan B that considers the original item's intent.
12. At least one complete creative deliverable workflow.
13. Server-enforced privacy and Surprise Shield.
14. Safe AI integration, validation, rate limiting, error handling.
15. Authentication and authorization (anonymous auth acceptable).
16. Critical business-logic and security tests.
17. Deployed application and reproducible demo.
18. Repository hygiene and submission preparation.

### P1: after P0 is stable
Our Blend with manual trusted-friend answers; secure collaborator links; post-event Guess vs. Truth; extra export formats; voice input; expanded sharing and reflection.

### **[Clarified] P0 build order**
Intake → ideas → plan and budget → change handling and undo → Surprise Shield and recipient-facing preview → vendor checklist → calendar and countdown.

### **[Clarified] Scope cut line**
If behind schedule, simplify the vendor quote comparison and the in-app calendar first. Never compromise privacy, authorization, change handling, version history, or undo.

### Out of scope
Autonomous purchasing, bookings, payments; unverified real-time vendor availability; public social feeds; unnecessary multi-agent orchestration; permanent relationship profiles without consent; unnecessary infrastructure.

## 11. Acceptance Criteria
Each criterion must be verified; code existing is not completion.

### Core planning
- [ ] An organizer can create and persist a celebration plan.
- [ ] The application generates relevant, structured ideas.
- [ ] The organizer can edit, approve, reject, and regenerate ideas.
- [ ] Meaningful plan items support intent tags.
- [ ] Budget totals are computed deterministically.
- [ ] Tasks, dependencies, deadlines, and urgency modes work correctly.
- [ ] The in-app calendar and countdown reflect the event date and timezone.
- [ ] A creative deliverable can be previewed and exported or shared.
- [ ] All three entry paths reach a complete plan.

### Change handling
- [ ] Reducing the budget updates affected costs and offers feasible trade-offs.
- [ ] Moving the event earlier recalculates affected deadlines and urgency.
- [ ] **Combined scenario:** reduce the budget and move the date earlier; the plan updates affected items without restarting, offers trade-offs, lets the organizer choose, preserves the previous version, and shows a change summary.
- [ ] Changing guest count updates relevant costs and items.
- [ ] An unavailable vendor or item triggers practical alternatives where possible.
- [ ] Replacements preserve the original intent tag when appropriate.
- [ ] Unaffected approved decisions remain intact unless a dependency requires reconsideration.
- [ ] The application explains when a timeline or budget becomes infeasible.

### Version history
- [ ] A meaningful change creates a recoverable previous version.
- [ ] The organizer can view and restore a previous version.
- [ ] Restoration preserves the version being replaced.
- [ ] Authorization is enforced for history access and restoration.

### Vendors
- [ ] Vendor checklist entries can be created and updated.
- [ ] Statuses follow the defined ladder.
- [ ] Pasted quotes can be compared without being treated as verified facts.
- [ ] Missing details and follow-up questions are identifiable.
- [ ] Fallback options can be recorded.
- [ ] Pasted text cannot mark a vendor confirmed or authorize an external action.

### Privacy and security
- [ ] A user cannot access another user's plan by changing an identifier.
- [ ] Protected database operations enforce authorization; RLS tested for unauthorized access.
- [ ] Recipient-facing responses and exports exclude organizer-only surprise information.
- [ ] Unapproved content cannot be disclosed through the recipient-facing workflow.
- [ ] Secrets are not exposed in client-side code.
- [ ] Generated HTML and SVG are handled safely.
- [ ] Prompt-injection attempts in vendor quotes and collaborator answers cannot change permissions, bypass validation, alter protected state, or trigger tools.
- [ ] AI endpoints return 429 after the rate limit is exceeded.
- [ ] Email drafts require organizer review before sending.

### Quality and delivery
- [ ] Critical business logic has unit tests.
- [ ] The core journey has end-to-end coverage.
- [ ] Change handling, restoration, and privacy boundaries have negative tests.
- [ ] User work survives recoverable generation errors.
- [ ] Setup and environment configuration are documented.
- [ ] The deployed app completes the demonstration without manual database repair.
- [ ] Simulated behavior is explicitly disclosed.
- [ ] Hackathon deliverables are prepared and checked against the official dashboard.

## 12. Demonstration Scenario
An organizer wants a meaningful celebration within a limited budget. They describe the recipient, their intention, and a few known preferences. The application generates tailored ideas; the organizer picks one, edits it, and gets a plan with intent-tagged activities, a timeline, a budget, and vendor requirements.

Then circumstances change: the budget drops and the event moves earlier. The application identifies affected tasks and costs, proposes feasible trade-offs, preserves the intent behind important activities, and shows a change summary. The organizer picks an alternative and can restore the previous plan.

The organizer reviews the calendar, countdown, vendor checklist, and a personalized invitation or mini-site, then opens the recipient-facing preview and verifies the private surprise details remain hidden.

The demo uses implemented, verified behavior only; any simulated responses are identified honestly.

## 13. Hackathon Submission Deliverables
- [ ] GitHub repository with the application source.
- [ ] No API keys, credentials, private tokens, or secrets committed.
- [ ] Working deployed application link.
- [ ] Video walkthrough of actual behavior (voiceover optional unless official rules require it).
- [ ] LinkedIn post: tools used, prompt flow, prompt evolution, what GenAI contributed versus what the developer implemented.
- [ ] `PROMPT_LOG.md` maintained from day one.
- [ ] Official dashboard checked for format, cutoff timezone, attempt limits, extra deliverables.

Do not wait until the final day to record prompts or prepare the demo.

## 14. Risks and Mitigations
| Risk | Mitigation |
|---|---|
| Scope exceeds available time | Complete P0 first; apply the cut line |
| Generic or inaccurate suggestions | Gather context, disclose assumptions, support editing |
| Change handling damages the plan | Deterministic dependencies, required approval, preserved versions |
| Vendor information is inaccurate | Keep pasted quotes distinct from verified facts |
| Surprise details leak | Server-side data separation; test recipient responses |
| Prompt injection changes state | Treat pasted content as data; test protected operations |
| AI returns invalid output | Schema validation and controlled recovery |
| Budget estimates appear confirmed | Label estimates and preserve sources |
| API key abuse or runaway cost | Rate limits, input caps, generation limits |
| Collaboration delays delivery | Keep the single-organizer journey independent |
| Visual polish masks incomplete behavior | Verify end-to-end flows against acceptance criteria |
| Last-minute regressions | Scoped changes; rerun critical tests |

## 15. Decisions
**Resolved:** authentication uses Supabase anonymous auth with optional email; build order and cut line as in Section 10; schema additions `guest_count`, `confirmed_cost`, `is_fallback`, `fallback_for`, `quote_fields` (see `architecture.md`).

**Still to decide during implementation:** retention policy; transaction and concurrency strategy for plan changes and restoration; quote comparison confidence labels; recipient link and collaborator authorization details; whether an email provider is justified; final Our Blend questions and scoring rules; achievable export formats; monitoring beyond rate limits. None may be replaced with an insecure shortcut.

## 16. Project Files
`design.md` visual system · `architecture.md` technical design, schema, security · `rules.md` mandatory rules · `task_today.md` immediate work · `PROMPT_LOG.md` prompt record · `bugs.md` and `audit.md` created when there are real findings.

The PRD defines intended behavior. It does not prove that a requirement has been implemented or verified.

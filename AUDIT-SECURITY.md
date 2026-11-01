# Security Audit Report

## Status update (final)

This report is a snapshot from 2026-11-01 11:21 IST. Findings below marked FAIL were addressed afterwards on the `security-fixes` and `hardening` branches, both merged to main.

| Finding | Status Now | Evidence |
|---|---|---|
| **Blend Questions IDOR** (RLS bypass reading occasion facts via unauthenticated endpoint) | Fixed | Source: [`src/app/api/blend/questions/route.ts`](src/app/api/blend/questions/route.ts#L45-L88) gates access to owner session via RLS-bound client or valid unexpired share token hash. Passing test: [`tests/security/blend-questions.test.ts`](tests/security/blend-questions.test.ts). |
| **OAuth Occasion Claim** (unverified ownership transfer via `?claim=` query parameter) | Fixed | Source: [`src/app/auth/callback/route.ts`](src/app/auth/callback/route.ts#L24-L54) verifies pre-auth anonymous session and restricts update to `owner_id = anonId`. Passing test: [`tests/auth/callback.test.ts`](tests/auth/callback.test.ts). |
| **Change-Apply Idempotency Replay** (duplicate snapshot on network retry) | Fixed | Source: [`src/app/api/changes/apply/route.ts`](src/app/api/changes/apply/route.ts#L68-L85) queries existing snapshots for matching `idempotency_key` and short-circuits. Passing test: [`tests/security/change-apply-idempotency.test.ts`](tests/security/change-apply-idempotency.test.ts). |
| **Missing Security Headers** (missing global CSP, HSTS, frame-ancestors, nosniff, permissions policy) | Fixed | Source: [`next.config.ts`](next.config.ts#L18-L72) configures global CSP, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Strict-Transport-Security, Permissions-Policy, and recipient privacy overrides. Passing test: [`tests/security/headers.test.ts`](tests/security/headers.test.ts). |
| **Malformed JSON Body Handling** (SyntaxError throwing unhandled HTTP 500) | Fixed | Source: [`src/lib/security/request.ts`](src/lib/security/request.ts#L12-L25) (`parseJsonBody` helper returning HTTP 400 with code `malformed_json`) integrated across all POST/PUT/PATCH API routes. Passing test: [`tests/security/malformed-json.test.ts`](tests/security/malformed-json.test.ts). |
| **AI Prompt Delimiter Sanitization** (untrusted user input escaping prompt delimiters) | Fixed | Source: [`src/lib/ai/prompts/*.ts`](src/lib/ai/prompts/) wraps all untrusted inputs in `<user_data>` and strips `</?user_data>` tags from user inputs. Passing test: [`tests/security/prompt-delimiters.test.ts`](tests/security/prompt-delimiters.test.ts). |

Remaining limitations and architectural trade-offs are listed in [`SECURITY.md`](SECURITY.md).

---

- **Date / Time**: 2026-11-01T11:21:40+05:30
- **Starting Branch**: `main` (commit `6ccaeea`)
- **Audit Branch**: `audit`
- **Working Tree State at Start**: Clean (no uncommitted or untracked changes)
- **Target**: Local production build & source audit; deployed candidate URL (N/A / local test environment)
- **Safety Constraints**: No secrets in output, no file modifications outside `AUDIT-SECURITY.md`, append-only.

---

## 1. Secrets Audit

- **Check Status**: PASS with 1 LOW Defense-in-Depth Observation
- **Scope**: Working tree, entire Git commit history, and `.next/static` production client JS bundles.

### Summary Table

| Asset / Location | Secret Types Checked | Findings | Status | Action Required |
|---|---|---|---|---|
| Working Tree | `.env*`, `.pem`, private keys | No uncommitted live secrets tracked | PASS | None |
| Git History (`HEAD`, all branches) | `gsk_*`, `AIzaSy*`, `sk-*`, `eyJ*` (JWT), PEM keys | Only mock dummy strings found in unit test files (`tests/ai/byok-client.test.ts`, `tests/ai/router.test.ts`, `tests/engine/shield.test.ts`). No live credentials in history. | PASS | None |
| Client JS Bundles (`.next/static/**/*.js`) | `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `COMPAT_API_KEY`, `XKIRO_API_KEY` | Zero secret values leaked. Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are present. | PASS | None |
| Client JS Bundles (`.next/static/chunks/30_-e4mzjioxm.js`) | Environment Schema Metadata | Server Zod schema structure and error strings bundled into client chunk due to shared import in `src/lib/supabase/browser.ts`. | LOW | Split `src/lib/env.ts` into `env.server.ts` (with `import "server-only"`) and `env.public.ts`. |

### Detailed Findings

#### [LOW] Server Environment Zod Schema Bundled into Client Bundle
- **Severity**: LOW
- **Affected File**: `src/lib/env.ts` (imported by `src/lib/supabase/browser.ts`, chunk `.next/static/chunks/30_-e4mzjioxm.js`)
- **Verification Method**: Static inspection of `.next/static/chunks/30_-e4mzjioxm.js` searching for `SUPABASE_SERVICE_ROLE_KEY`.
- **Expected Behaviour**: Client bundles should contain only `NEXT_PUBLIC_*` variable handlers; server-side environment schemas should be tree-shaken or isolated.
- **Actual Behaviour**: The Zod schema object definitions for `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, and `COMPAT_BASE_URL` are present in client bundle chunk `30_-e4mzjioxm.js`. *No secret values or runtime credentials are exposed.*
- **Impact**: Server configuration variable names and validation constraints are exposed to public client inspection.
- **Remediation**: Separate `getPublicEnv()` into `src/lib/env-public.ts` and keep `serverSchema` in `src/lib/env-server.ts` protected by `import "server-only"`.

---

## 2. Authorization Audit

- **Check Status**: FAIL (1 HIGH Finding, 1 HIGH Vulnerability, 1 MEDIUM Finding)
- **Scope**: User A vs User B authorization, RLS enforcement on all tables, anonymous-to-registered upgrade, change-apply idempotency, version restore permissions, and service-role privilege isolation.

### Summary Table

| Control / Target | Test / Verification Method | Expected Result | Actual Result | Status |
|---|---|---|---|---|
| RLS on All Tables | Inspected `schema.sql` (lines 237-248); verified 11 tables + `rate_limits` | RLS enabled on every table | All 12 tables have `enable row level security` | PASS |
| User A vs User B Isolation | Executed `tests/db/rls.test.ts` (19 live tests) | User B blocked from SELECT, UPDATE, DELETE on User A's occasions, items, vendors, versions, letters, share links | All 19 tests passed; blocked at database layer | PASS |
| Anonymous-to-Registered Upgrade | Executed `tests/auth/upgrade.test.ts` & inspected `src/app/api/auth/upgrade/route.ts` | Upgrades same `auth.uid()`, preserves all user plans | Single user upgraded in place, uid preserved | PASS |
| Non-Owner Version Restore | Inspected `src/app/api/versions/restore/route.ts` (line 22 uses user-bound client) | User B cannot view or restore User A's version | Blocked by RLS on `plan_versions` (returns 404) | PASS |
| Change-Apply Idempotency Replay | Inspected `src/app/api/changes/apply/route.ts:49-108` | Replayed request with identical `idempotencyKey` short-circuits | Replayed request creates duplicate version snapshot and re-runs mutations | FAIL (MEDIUM) |
| IDOR in AI Questions Generator | Inspected `src/app/api/blend/questions/route.ts:45-66` | Only owner or valid token holder can generate questions from occasion data | Unauthenticated caller reads occasion & facts via service-role admin | FAIL (HIGH) |
| Unchecked Occasion Claim on OAuth | Inspected `src/app/auth/callback/route.ts:24-38` | Only unowned/anonymous occasions can be claimed by session owner | Any occasion ID in `?claim=` is transferred to authenticated user via service-role | FAIL (HIGH) |
| Service Role Isolation | Grep search for `createAdminClient` across codebase | Service-role restricted to auth, token lookups, and rate limits | Used in `blend/questions` and `auth/callback` without ownership/token gates | FAIL (HIGH) |

### Detailed Findings

#### [HIGH] IDOR and RLS Bypass in Blend Questions Route
- **Severity**: HIGH
- **Affected Route**: `GET /api/blend/questions` (`src/app/api/blend/questions/route.ts:45-66`)
- **Description**: Insecure Direct Object Reference via service-role fallback. When `GET /api/blend/questions?occasionId=<uuid>` is called by an unauthenticated user or an unauthorized User B, lines 45-66 fall back to `createAdminClient()` (service-role) to read `occasions` (`title`, `occasion_type`, `recipient_name`, `intent_summary`, `guest_count`) and `recipient_facts` (`fact_key`, `fact_value`) without validating a share token or owner session.
- **Verification Method**: Code inspection of `src/app/api/blend/questions/route.ts`. Line 47 instantiates `createAdminClient()` unconditionally when user session does not match occasion owner.
- **Impact**: Any unauthenticated actor knowing an occasion UUID can access private recipient metadata and facts, and trigger unauthorized AI model execution against victim occasions.
- **Remediation**: Require either an authenticated owner session (`user.id === occasion.owner_id`) or a valid `share_links` token with `contribute` or `view` role before reading occasion data via admin client.

#### [HIGH] Unchecked Occasion Takeover via OAuth Callback Claim Parameter
- **Severity**: HIGH
- **Affected Route**: `GET /auth/callback` (`src/app/auth/callback/route.ts:24-38`)
- **Description**: Unchecked occasion transfer. When `claim` query parameter is supplied to `/auth/callback?code=...&claim=<occasion_id>`, lines 31-35 execute `admin.from("occasions").update({ owner_id: data.user.id }).eq("id", claimOccasionId)` without verifying if the target occasion currently belongs to an anonymous user or whether the caller owned the session that created it.
- **Verification Method**: Code inspection of `src/app/auth/callback/route.ts:24-38`. The update query has no `where owner_id = anon_session_id` or anonymous check.
- **Impact**: An attacker who knows a victim's `occasionId` could initiate Google OAuth with `?claim=<victim_occasion_id>` and take over ownership of the victim's occasion.
- **Remediation**: In `src/app/auth/callback/route.ts`, before reassigning ownership, verify that the current `owner_id` belongs to an anonymous user (`auth.users.is_anonymous = true`) and that the claim is cryptographically tied to a temporary session cookie.

#### [MEDIUM] Missing Replay Check for Change-Apply Idempotency Key
- **Severity**: MEDIUM
- **Affected Route**: `POST /api/changes/apply` (`src/app/api/changes/apply/route.ts:24-108`)
- **Description**: Replay vulnerability on change application. Although the route schema accepts `idempotencyKey` and embeds it in the snapshot JSONB, it never queries previous versions to detect whether the key was already processed.
- **Verification Method**: Code inspection of `src/app/api/changes/apply/route.ts:40-85`. No lookup of `snapshot->>'idempotency_key'` is performed prior to executing mutations.
- **Impact**: Network retries or rapid duplicate submissions will create multiple version snapshots and re-apply mutations.
- **Remediation**: Query `plan_versions` where `occasion_id = occasionId` and `snapshot->>'idempotency_key' = idempotencyKey`. If found, return the existing version response immediately without reapplying changes.

---

## 3. Surprise Shield Audit

- **Check Status**: PASS
- **Scope**: Payload allowlist enforcement, server-side pre-reveal masking, view vs contribute token separation, byte-identical 404 timing/leakage defense, cryptographic token hashing, recipient metadata privacy, and HTTP caching/referrer policy headers.

### Summary Table

| Requirement / Threat Vector | Verification Method | Expected Result | Actual Result | Status |
|---|---|---|---|---|
| Allowlist-Only Payload | `tests/engine/shield.test.ts` (lines 25-68) & `buildRecipientPayload` inspection | No budget, currency, plan items, vendors, organizer notes, or recipient facts in response | Strictly allowlisted: only headline, message, reveal_at, show_countdown, approved letters | PASS |
| Server-Side Pre-Reveal Defense | `buildRecipientPayload` in `src/lib/engine/shield.ts:100-116` | Before `reveal_at`, server returns neutral cover state without headline/message | Pre-reveal payload suppresses real headline/message server-side | PASS |
| View vs Contribute Token Separation | `src/app/api/recipient/[token]/route.ts:178` | Contribute token rejected on view endpoint | Requires `role = 'recipient'` AND `kind = 'view'`; contribute tokens fail with 404 | PASS |
| Byte-Identical 404s (Body + Headers) | `tests/security/shield-api.test.ts` (lines 10-45) | Malformed, expired, revoked, unpublished, or non-existent tokens return identical status 404, identical JSON body, and identical headers | Identical `{ error: "Not found" }` with `Cache-Control: no-store` and `Referrer-Policy: no-referrer` | PASS |
| Token Hashing (Zero Raw Tokens in DB) | `src/lib/engine/shield.ts:133-146` & `schema.sql:143` | Raw 32-byte tokens hashed with SHA-256; only hashes stored and queried | Stored in `token_hash` unique column; raw tokens never stored | PASS |
| Neutral Metadata (No Product / Plan Leak) | `src/app/r/[token]/layout.tsx` | No product brand ("Closer"), recipient name, or plan details in OpenGraph / HTML metadata | Title: "Something special is being prepared", robots: `noindex, nofollow` | PASS |
| Privacy Response Headers | `RECIPIENT_RESPONSE_HEADERS` in `src/app/api/recipient/[token]/route.ts:17-20` | `Cache-Control: no-store`, `Referrer-Policy: no-referrer` | Headers set on all success and error responses | PASS |

---


## 4. Injection & AI Guardrails Audit

- **Check Status**: PASS with 1 MEDIUM Finding (AI Prompt Delimiter Sanitization)
- **Scope**: User input encapsulation in prompt templates, prompt injection defense, canary payload handling, deterministic schema enforcement, model parameter override immunity (status, budget, dates, permissions), and plain-text output rendering.

### Summary Table

| Requirement / Threat Vector | Verification Method | Expected Result | Actual Result | Status |
|---|---|---|---|---|
| Delimiter Bounding in Prompts | Code inspection of `src/lib/ai/prompts/*.ts` | All untrusted input wrapped in `<user_data>` and nested tags stripped | `parse-quote.ts` strips tags; `propose-ideas.ts` and `invitation.ts` wrap without tag stripping; `blend-questions.ts` lacks wrapper tags | FAIL (MEDIUM) |
| Model Text Status / Permission Override | Inspection of `src/app/api/changes/apply/route.ts` & `src/lib/ai/orchestrator.ts:627` | Model text cannot change item status to 'booked'/'paid' or alter user permissions | Status for added items forced to `todo` and cost to `estimate`; update columns strictly allowlisted | PASS |
| Deterministic Budget Ceiling Enforcement | `src/lib/ai/orchestrator.ts:648-652` | AI tradeoff options exceeding target budget are discarded | `isOverBudget(targetBudget, simulatedPlan)` discards non-compliant options deterministically | PASS |
| Deterministic Graph & Timeline Validation | `src/lib/ai/orchestrator.ts:654-657` | AI tradeoff options introducing cycles or invalid dependencies are discarded | `validateDependencyGraph(simulatedPlan)` validates timeline acyclicity before acceptance | PASS |
| Plain-Text Rendering (Zero Prompt Echo) | `git grep "dangerouslySetInnerHTML"` across `src/` | No direct innerHTML rendering of AI text | Zero occurrences found; React escapes all dynamic text bindings | PASS |
| Schema Boundary & Output Parsing | Inspection of `src/lib/ai/schemas.ts` and `src/lib/ai/orchestrator.ts` | All AI outputs strictly validated and constrained by Zod | Every tool (`proposeIdeas`, `proposeTradeoffs`, `parseQuote`, etc.) parses output via Zod | PASS |
| Prompt Injection & Canary Payloads | Executed `tests/ai/parse-quote.test.ts` (4/4 passed) | System injection payloads inside quoted text are treated as passive data | Injection commands ignored; deterministic price extraction and schema validation succeed | PASS |

### Detailed Findings

#### [MEDIUM] Missing Delimiter Sanitization and Delimiters in AI Prompts
- **Severity**: MEDIUM
- **Affected Files**: `src/lib/ai/prompts/blend-questions.ts:20-36`, `src/lib/ai/prompts/propose-ideas.ts:36-62`, `src/lib/ai/prompts/propose-tradeoffs.ts:47-76`, `src/lib/ai/prompts/invitation.ts:30-43`
- **Description**: Inconsistent prompt delimiter sanitization against prompt injection:
  1. In `blend-questions.ts`, user-supplied strings (`concept`, `name`, `occasion`, `intent`) are interpolated directly into the system/user prompt without `<user_data>` delimiters.
  2. In `propose-ideas.ts`, `propose-tradeoffs.ts`, and `invitation.ts`, inputs are wrapped inside `<user_data>...</user_data>`, but closing tags `</user_data>` in user input fields are not stripped (unlike `src/lib/ai/prompts/parse-quote.ts:20`).
- **Verification Method**: Code inspection of `src/lib/ai/prompts/`. Compare `parse-quote.ts` (which does `input.pastedText.replace(/<\/?user_data>/gi, "")`) with `blend-questions.ts` and `propose-ideas.ts`.
- **Impact**: An attacker providing crafted text containing `</user_data>\nNew instructions...` could escape data delimiters and influence model generation.
- **Remediation**: Wrap inputs in `blend-questions.ts` inside `<user_data>` tags and apply `.replace(/<\/?user_data>/gi, "")` to all interpolated text fields across all prompt builder functions.

---

## 5. Output and Input Handling Audit

- **Check Status**: PASS with 1 LOW Finding (Malformed JSON Status Code)
- **Scope**: Cross-Site Scripting (XSS) in letters/invitations/recipient views, URI scheme and parameter encoding (`mailto:`, `wa.me`), iCalendar (.ics) RFC 5545 injection defense, Zod string length bounds, and open redirect prevention on OAuth callback.

### Summary Table

| Requirement / Threat Vector | Verification Method | Expected Result | Actual Result | Status |
|---|---|---|---|---|
| XSS in Letter and Envelope Views | Inspected `envelope-grid.tsx` & `letters-review-section.tsx` | Letters and names rendered as safe text nodes | Rendered strictly as JSX children; no `dangerouslySetInnerHTML` | PASS |
| XSS in Standalone Invitation HTML Export | Inspected `src/lib/engine/invitation.ts:85-194` | Dynamic strings escaped before interpolation | All variables escaped through `escapeXml()` (&, <, >, ", ') | PASS |
| Honeypot Bot Rejection on Contributions | `tests/security/letters-api.test.ts:133-153` | Honeypot field rejects automated submissions | Bot submissions with non-empty honeypot rejected with HTTP 400 | PASS |
| URI Scheme & Parameter Encoding | Inspected `invitation.ts:225` and `vendors.ts:85` | `mailto:` and `wa.me` parameters URL-encoded | Encoded using `encodeURIComponent()`; phone numbers stripped of non-digits | PASS |
| RFC 5545 iCalendar (.ics) Injection | Executed `tests/engine/ics.test.ts` (11 live tests) | Semicolons, commas, backslashes, and newlines properly escaped | `escapeIcsText` escapes `\`, `;`, `,`, `\n` per RFC 5545 §3.3.11 | PASS |
| Open Redirect Prevention | Executed `tests/auth/redirect.test.ts` (6 live tests) | Rejects protocol-relative, absolute, backslash evasion, and javascript/data URLs | `validateNextParam` falls back safely to `/` on all attack vectors | PASS |
| Zod String Length Enforcements | Inspected `src/lib/ai/schemas.ts` | All text inputs bounded to prevent memory or token exhaustion | String lengths bounded (`concept` <= 1000, `intent` <= 500, letter <= 600, etc.) | PASS |
| Malformed JSON Body Handling | Inspected API route error handlers (`/api/intake`, `/api/changes/apply`) | Malformed JSON rejected with HTTP 400 | Syntax error caught by generic catch, returning HTTP 500 | FAIL (LOW) |

### Detailed Findings

#### [LOW] Malformed JSON Bodies Return HTTP 500 Instead of HTTP 400
- **Severity**: LOW
- **Affected Routes**: `src/app/api/intake/route.ts:35`, `src/app/api/changes/apply/route.ts:39`, `src/app/api/vendors/quote/route.ts:27`
- **Description**: Syntactically malformed JSON in incoming request bodies causes `await req.json()` to throw a `SyntaxError`, which falls into the route's outer `catch (error)` block and returns `HTTP 500 Internal Server Error` instead of `HTTP 400 Bad Request`.
- **Verification Method**: Code inspection of `src/app/api/intake/route.ts` line 35. No specific catch block for `SyntaxError` on `req.json()`.
- **Impact**: Confusing error diagnostics and noise in server error monitors during client serialization glitches or fuzzing.
- **Remediation**: Wrap `await req.json()` in a try/catch block that returns `NextResponse.json({ error: "Malformed JSON body" }, { status: 400 })`.

---

## 6. Rate Limits & BYOK Security Audit

- **Check Status**: PASS
- **Scope**: PostgreSQL-backed atomic rate limiting (`rate_limit_hit`), standard HTTP 429 and `Retry-After` header enforcement, Bring-Your-Own-Key (BYOK) lifecycle and session isolation, credential leakage prevention in logs/errors/database, and silent fallback prevention.

### Summary Table

| Control / Target | Test / Verification Method | Expected Result | Actual Result | Status |
|---|---|---|---|---|
| PostgreSQL Atomic Rate Limiting | Executed `tests/security/rate-limit.test.ts` against PGlite | 10 requests allowed in 60s; 11th request blocked | 10 calls return true; 11th and 12th return false | PASS |
| RFC 6585 429 Response Format | `tests/security/rate-limit.test.ts:61-72` | Returns HTTP 429 with standard `Retry-After: <sec>` header | Status 429, `Retry-After: 60`, JSON body with `retryAfter` | PASS |
| AI Route Rate Limit Integration | Inspected `/api/intake`, `/api/changes/propose`, `/api/vendors/quote` | Rate limit checked before calling AI providers | Bucket `ai:<uid>` or `ai-ip:<ip>` evaluated; rejects with 429 on limit | PASS |
| BYOK Storage Isolation | Inspected `src/lib/ai/byok-client.ts:6-48` & tests | Key stored only in `sessionStorage`; never DB, cookies, or localStorage | Restricted strictly to `sessionStorage`; deleted on tab close | PASS |
| Zero BYOK Keys in Logs / Errors | Inspected `src/lib/ai/router.ts:201-209` (`logChainFatalError`) | Fatal errors log only tool, provider, model, status, and reason | Zero API keys, prompts, or request payloads in logs | PASS |
| BYOK Silent Fallback Prevention | Executed `tests/ai/router.test.ts` (Rule 4 test) | Failed BYOK call never silently invokes server credentials | Failed BYOK call routes directly to deterministic fallback | PASS |

---

## 7. Headers & Dependencies Audit

- **Check Status**: FAIL (2 MEDIUM Findings, 3 LOW Findings)
- **Scope**: HTTP security response headers (`Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`, `X-Content-Type-Options`, `Permissions-Policy`, `Strict-Transport-Security`), cookie security configurations, and dependency vulnerability scanning via `npm audit --omit=dev`.

### Summary Table

| Header / Control | Current Configuration | Expected Standard | Status | Severity |
|---|---|---|---|---|
| Content-Security-Policy (CSP) | Not configured in `next.config.ts` or `src/proxy.ts` | Restrictive script, object, and connect directives | FAIL | MEDIUM |
| Clickjacking Defense (`X-Frame-Options` / `frame-ancestors`) | Absent from all application routes | `DENY` or `SAMEORIGIN` / `frame-ancestors 'none'` | FAIL | MEDIUM |
| MIME-Sniffing Defense (`X-Content-Type-Options`) | Absent globally | `nosniff` on all HTML and API responses | FAIL | LOW |
| Permissions-Policy | Absent globally | Restrict `camera=(), microphone=(), geolocation=()` | FAIL | LOW |
| Strict-Transport-Security (HSTS) | Absent in app configuration | `max-age=63072000; includeSubDomains; preload` | FAIL | LOW |
| Recipient Route Privacy Headers | Present in `next.config.ts:9-23` for `/r/*` and `/api/recipient/*` | `Referrer-Policy: no-referrer` and `Cache-Control: no-store` | PASS | N/A |
| Cookie Security Flags | Set by `@supabase/ssr` (`SameSite=Lax`, `HttpOnly=true`, `Secure` in prod) | Protected against client script access and cross-site leakage | PASS | N/A |
| Production Dependencies Audit | `npm audit --omit=dev` | 0 vulnerabilities | PASS | N/A |
| Development Tooling Audit | `npm audit` (including dev tooling) | 16 moderate vulnerabilities in `minimatch` / `eslint` dev chain | INFO | INFO |

### Detailed Findings

#### [MEDIUM] Missing Content-Security-Policy (CSP) Header Globally
- **Severity**: MEDIUM
- **Affected Files**: `next.config.ts`, `src/proxy.ts`
- **Description**: The application does not define a `Content-Security-Policy` header in `next.config.ts` headers or via `src/proxy.ts`.
- **Verification Method**: Static inspection of `next.config.ts` (only `/r/:path*` and `/api/recipient/:path*` configure `Referrer-Policy` and `Cache-Control`).
- **Impact**: Without a CSP header, the application lacks defense-in-depth against client-side script injection if an XSS vector were introduced.
- **Remediation**: Add a CSP header in `next.config.ts` headers or `src/proxy.ts`, configuring `default-src 'self'`, `script-src 'self' 'unsafe-inline'`, `img-src 'self' data: https:`, `connect-src 'self' https://*.supabase.co https://api.groq.com https://generativelanguage.googleapis.com https://api.xkiro.com`.

#### [MEDIUM] Missing Clickjacking Defense (`X-Frame-Options` / `frame-ancestors`)
- **Severity**: MEDIUM
- **Affected Files**: `next.config.ts`, `src/proxy.ts`
- **Description**: Neither `X-Frame-Options: DENY` / `SAMEORIGIN` nor CSP `frame-ancestors 'none'` is configured for standard application routes (`/`, `/dashboard`, `/plan/:id`).
- **Verification Method**: Static inspection of `next.config.ts`.
- **Impact**: Application pages could be embedded inside malicious third-party `<iframe />` elements to conduct clickjacking attacks against authenticated users.
- **Remediation**: Add `X-Frame-Options: DENY` and `frame-ancestors 'none'` to global response headers in `next.config.ts`.

#### [LOW] Missing `X-Content-Type-Options: nosniff` Globally
- **Severity**: LOW
- **Affected Files**: `next.config.ts`
- **Description**: The `X-Content-Type-Options: nosniff` header is not configured globally across application routes.
- **Verification Method**: Inspection of `next.config.ts`.
- **Impact**: Legacy browsers may attempt MIME-type sniffing on served responses.
- **Remediation**: Add `{ key: "X-Content-Type-Options", value: "nosniff" }` to global headers in `next.config.ts`.

#### [LOW] Missing `Permissions-Policy` Globally
- **Severity**: LOW
- **Affected Files**: `next.config.ts`
- **Description**: No `Permissions-Policy` header is specified to restrict browser device APIs.
- **Verification Method**: Inspection of `next.config.ts`.
- **Impact**: Third-party scripts or frames could attempt to request sensitive device permissions.
- **Remediation**: Add `{ key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }` to global headers in `next.config.ts`.

#### [LOW] Missing `Strict-Transport-Security` (HSTS) in App Configuration
- **Severity**: LOW
- **Affected Files**: `next.config.ts`
- **Description**: While typically provided by edge reverse proxies (such as Vercel), HSTS is not explicitly configured in application-level response headers.
- **Verification Method**: Inspection of `next.config.ts`.
- **Impact**: Potential downgrade attacks during initial connection on non-HSTS networks if edge proxy does not inject it.
- **Remediation**: Add `{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }` in `next.config.ts`.

---

## Executive Summary & Vulnerability Counts

### Severity Counts

| Severity Level | Count | Status |
|---|---|---|
| **CRITICAL** | **0** | Clean |
| **HIGH** | **2** | Action Required |
| **MEDIUM** | **4** | Action Required |
| **LOW** | **5** | Hardening Recommended |
| **INFO** | **1** | Observation |
| **Total Findings** | **12** | |

### Full Breakdown of CRITICAL and HIGH Findings

#### 1. [HIGH] IDOR and RLS Bypass in Blend Questions Route
- **File & Line**: `src/app/api/blend/questions/route.ts:45-66`
- **Description**: Unauthenticated or unauthorized callers can supply an arbitrary `occasionId` to `GET /api/blend/questions?occasionId=<uuid>`. When the user is unauthenticated or does not own the occasion, the route falls back to `createAdminClient()` (service-role) to read occasion details (`title`, `occasion_type`, `recipient_name`, `intent_summary`, `guest_count`) and `recipient_facts` without validating ownership or a share token.
- **Reproduction**: Send `GET /api/blend/questions?occasionId=<victim_occasion_id>` with no session cookies or User B session cookies.
- **Expected**: HTTP 401 Unauthorized or HTTP 404 Not Found.
- **Actual**: HTTP 200 with generated vibe check questions derived from victim's private celebration metadata.
- **Impact**: Disclosure of recipient metadata and unauthorized triggering of backend AI model execution.
- **Remediation**: Require either an authenticated owner session (`user.id === occasion.owner_id`) or a valid `share_links` token with `contribute` or `view` role before reading occasion data via admin client.

#### 2. [HIGH] Unchecked Occasion Takeover via OAuth Callback Claim Parameter
- **File & Line**: `src/app/auth/callback/route.ts:24-38`
- **Description**: When completing Google OAuth via `/auth/callback?code=...&claim=<occasion_id>`, the callback executes `admin.from("occasions").update({ owner_id: data.user.id }).eq("id", claimOccasionId)` using the service-role client without verifying if the occasion was created by the caller's anonymous session.
- **Reproduction**: Authenticate via Google OAuth with `?claim=<victim_occasion_id>`.
- **Expected**: Occasion ownership is only reassigned if the caller previously owned the anonymous session that created it.
- **Actual**: Any occasion UUID passed in `?claim=` is immediately transferred to the authenticated user.
- **Impact**: Complete account/occasion takeover of any victim's occasion if the attacker discovers its UUID.
- **Remediation**: Before reassigning `owner_id`, verify that the target occasion currently belongs to an anonymous user (`is_anonymous = true`) and that the claim is cryptographically tied to a temporary session cookie.

---

## Final Verification & Safety Confirmation

- **Working Tree Integrity**: Only `AUDIT-SECURITY.md` was created/appended. No source files, tests, lockfiles, or configurations were modified.
- **Secret Redaction**: Zero live secrets, tokens, or PII exposed in report or logs.
- **Next Steps**: Awaiting explicit user approval before proceeding with remediation.

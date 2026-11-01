# Security Policy

## Overview

Closer is designed with an **honest-by-design** and **security-first** architecture. User celebration plans, guest data, and budgets are protected using database-enforced Row Level Security (RLS), cryptographic token verification, and strict server-side authorization boundaries.

---

## 1. Secret Handling

- **No Secrets in Source**: No secret keys, credentials, or private access tokens are ever committed to the repository. The `.gitignore` file enforces that all `.env*` files are ignored except the sanitized template `.env.example`.
- **Server-Only Isolation**: The Supabase service-role client (`createAdminClient`) and private server environment variables import `server-only`, ensuring server secrets are never included in client JavaScript bundles.
- **BYOK (Bring Your Own Key) Isolation**:
  - User-provided API keys (Groq, Google Gemini) supplied via the BYOK headers (`x-byok-provider`, `x-byok-key`, `x-byok-model`) are ephemeral and strictly in-memory for the duration of the request.
  - Keys are **never stored** in the database, cookies, local storage, or server-side logs.
  - Key validation endpoints (`/api/ai/test-key`) sanitize all responses: the API key is never echoed back, and raw provider error bodies are redacted into generic user-friendly messages.
  - BYOK failures fail closed and never fall back to server credentials.

---

## 2. Surprise Shield & Token Security

- **Cryptographic Token Hashing**: Share links (Surprise Shield for recipients and Letter contribution links for friends) use 32-byte cryptographically secure random tokens.
- **Zero Raw Tokens Stored**: Only the SHA-256 hash (`sha256(rawToken)`) is stored in the database `share_links` table. The raw token is returned once to the organizer.
- **Byte-Identical 404 Timing Defense**: All failed share token lookups (invalid format, expired, revoked, unpublished, or non-existent) return an identical HTTP 404 response body and headers (`Cache-Control: no-store`, `Referrer-Policy: no-referrer`) to prevent timing and enumeration attacks.
- **Server-Side Masking**: Before the scheduled `reveal_at` timestamp, the server suppresses all sensitive occasion details, returning only neutral countdown metadata.

---

## 3. Known Limitations

- **Content Security Policy (CSP)**:
  - The current CSP (`next.config.ts`) allows `'unsafe-inline'` for styles and Next.js hydration scripts. Nonce-based CSP for all inline scripts is a planned enhancement.
- **Row Level Security & Shared Token Routes**:
  - While all core application tables have RLS enabled with owner-scoped policies, public-facing share links (Surprise Shield `/r/[token]` and contribution links `/contribute/[token]`) operate via server-side Route Handlers that use verified token hashes rather than user sessions to retrieve strictly allowlisted fields.
- **Rate Limiting Fallback**:
  - Rate limiting is enforced via a PostgreSQL RPC function (`rate_limit_hit`). When the database connection fails, AI routes fall back to an in-memory sliding window limiter to prevent unthrottled usage, while non-AI routes fail open for availability.

---

## 4. Reporting a Vulnerability

If you discover a security vulnerability within Closer, please disclose it responsibly.

To report a security vulnerability, please open a private security advisory through this GitHub repository.

### Guidelines
- Please include detailed steps to reproduce the issue (proof-of-concept script, request payloads, and affected versions/endpoints).
- Do not exploit the vulnerability beyond what is necessary to confirm its presence.
- Do not disclose the vulnerability publicly until a fix has been released.

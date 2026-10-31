/**
 * Surprise Shield: Recipient Allowlist & Privacy Shield Engine.
 *
 * Rules:
 * - Deterministic; never imports from `lib/ai`.
 * - HARD RULE 19: "The recipient endpoint returns only the allowlisted fields from recipient_view.
 *   It never receives plan items, vendors, budget, or notes."
 * - Built by an allowlist function, NEVER by spreading database rows.
 * - Tokens: random 32-byte, stored hashed (SHA-256), expiring, revocable (Rule 21).
 * - All failures return an identical generic 404 response.
 */

import crypto from "node:crypto";

export const DEFAULT_RECIPIENT_HEADLINE = "Something special is being prepared";
export const GENERIC_NOT_FOUND_RESPONSE = { error: "Not found" } as const;

export interface RecipientViewInput {
  headline?: string | null;
  message?: string | null;
  reveal_at?: string | null;
  show_countdown?: boolean | null;
  published?: boolean | null;
  [key: string]: unknown;
}

export interface RecipientLetterItem {
  id?: string;
  contributor_name?: string | null;
  body: string;
  status?: string;
  occasion_id?: string;
}

export interface RecipientLetter {
  from: string;
  body: string;
}

export interface RecipientPayload {
  headline: string;
  message: string | null;
  reveal_at: string | null;
  show_countdown: boolean;
  is_revealed: boolean;
  letters?: RecipientLetter[];
}

export interface BuildRecipientPayloadOptions {
  isPreview?: boolean;
  nowMs?: number;
  letters?: RecipientLetterItem[];
  occasionId?: string;
}

function filterApprovedLetters(
  letters?: RecipientLetterItem[],
  expectedOccasionId?: string,
): RecipientLetter[] {
  if (!letters || !Array.isArray(letters)) return [];
  return letters
    .filter((l) => {
      if (!l || typeof l.body !== "string" || !l.body.trim()) return false;
      if (l.status !== "approved") return false;
      if (expectedOccasionId && l.occasion_id && l.occasion_id !== expectedOccasionId) return false;
      return true;
    })
    .map((l) => ({
      from: l.contributor_name?.trim() || "Someone who loves you",
      body: l.body.trim(),
    }));
}

/**
 * Builds the strictly allowlisted public recipient payload.
 * HARD RULE: Never spreads DB rows or exposes forbidden fields
 * (budget, vendors, plan items, notes, venue, gift, owner_id, occasion title).
 *
 * Server-side reveal enforcement (prd.md 6.11):
 * - Before `reveal_at`: returns only { show_countdown, reveal_at } plus neutral cover state
 *   (DEFAULT_RECIPIENT_HEADLINE), message is null, is_revealed is false.
 * - After `reveal_at`: returns full allowlisted payload with is_revealed = true.
 * - Preview mode: always returns revealed state for organizer curation.
 */
export function buildRecipientPayload(
  row: RecipientViewInput,
  options: BuildRecipientPayloadOptions = {},
): RecipientPayload {
  const nowMs = options.nowMs ?? Date.now();
  const revealAt =
    typeof row.reveal_at === "string" && row.reveal_at.trim().length > 0 ? row.reveal_at.trim() : null;
  const showCountdown = typeof row.show_countdown === "boolean" ? row.show_countdown : true;

  if (options.isPreview) {
    const payload: RecipientPayload = {
      headline:
        typeof row.headline === "string" && row.headline.trim().length > 0
          ? row.headline.trim()
          : DEFAULT_RECIPIENT_HEADLINE,
      message: typeof row.message === "string" && row.message.trim().length > 0 ? row.message : null,
      reveal_at: revealAt,
      show_countdown: showCountdown,
      is_revealed: true,
    };
    if (options.letters !== undefined) {
      payload.letters = filterApprovedLetters(options.letters, options.occasionId);
    }
    return payload;
  }

  // Server-side reveal check
  const isRevealed = revealAt ? nowMs >= new Date(revealAt).getTime() : true;

  if (!isRevealed) {
    const payload: RecipientPayload = {
      headline: DEFAULT_RECIPIENT_HEADLINE,
      message: null,
      reveal_at: revealAt,
      show_countdown: showCountdown,
      is_revealed: false,
    };
    if (options.letters !== undefined) {
      payload.letters = [];
    }
    return payload;
  }

  const payload: RecipientPayload = {
    headline:
      typeof row.headline === "string" && row.headline.trim().length > 0
        ? row.headline.trim()
        : DEFAULT_RECIPIENT_HEADLINE,
    message: typeof row.message === "string" && row.message.trim().length > 0 ? row.message : null,
    reveal_at: revealAt,
    show_countdown: showCountdown,
    is_revealed: true,
  };
  if (options.letters !== undefined) {
    payload.letters = filterApprovedLetters(options.letters, options.occasionId);
  }
  return payload;
}

/**
 * Generates a high-entropy 32-byte random cryptographic token (64 hex characters).
 */
export function generateRawShareToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Hashes a raw token using SHA-256.
 * The raw token is returned only once to the organizer and NEVER stored in the database.
 */
export function hashShareToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Validates the format of a token.
 * Rejects malformed strings before database lookups.
 */
export function isValidTokenFormat(token: unknown): token is string {
  if (typeof token !== "string") return false;
  const trimmed = token.trim();
  // Valid token is 64 hex characters (32 bytes) or "preview"
  return /^[0-9a-fA-F]{64}$/.test(trimmed) || trimmed === "preview";
}

/**
 * Calculates countdown details relative to reveal_at.
 */
export interface CountdownState {
  isRevealed: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMsRemaining: number;
}

export function calculateCountdown(
  revealAt: string | null | undefined,
  nowMs: number = Date.now(),
): CountdownState | null {
  if (!revealAt) return null;
  const targetMs = new Date(revealAt).getTime();
  if (Number.isNaN(targetMs)) return null;

  const diffMs = targetMs - nowMs;
  if (diffMs <= 0) {
    return {
      isRevealed: true,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      totalMsRemaining: 0,
    };
  }

  const seconds = Math.floor((diffMs / 1000) % 60);
  const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
  const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return {
    isRevealed: false,
    days,
    hours,
    minutes,
    seconds,
    totalMsRemaining: diffMs,
  };
}


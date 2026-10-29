import { describe, it, expect } from "vitest";
import {
  buildRecipientPayload,
  generateRawShareToken,
  hashShareToken,
  isValidTokenFormat,
  calculateCountdown,
  DEFAULT_RECIPIENT_HEADLINE,
  GENERIC_NOT_FOUND_RESPONSE,
} from "../../src/lib/engine/shield";

describe("engine/shield: Surprise Shield & Privacy Engine", () => {
  it("HARD RULE 19: buildRecipientPayload strictly allowlists fields and discards forbidden properties", () => {
    const rawDbRow = {
      occasion_id: "occ-1234",
      owner_id: "user-organizer-secret",
      occasion_title: "Surprise 30th Birthday Milestone",
      headline: "A Wonderful Surprise is Underway!",
      message: "Please keep this evening clear on your calendar.",
      reveal_at: "2026-11-20T18:00:00Z",
      show_countdown: true,
      published: true,
      created_at: "2026-10-01T10:00:00Z",
      // Sensitive fields that MUST NEVER leak to recipient:
      budget_total: 800000,
      currency: "INR",
      plan_items: [{ title: "Secret Diamond Ring", cost: 50000 }],
      vendors: [{ name: "Grand Venue", contact: "+91 9876543210" }],
      notes: "Do not let him know we invited his high school friends!",
      venue: "Sunset Terrace Rooftop",
      gift: "Vintage Guitar",
    };

    const payload = buildRecipientPayload(rawDbRow);

    // Strict allowlist: ONLY headline, message, reveal_at, show_countdown exist
    expect(Object.keys(payload).sort()).toEqual([
      "headline",
      "message",
      "reveal_at",
      "show_countdown",
    ]);

    expect(payload.headline).toBe("A Wonderful Surprise is Underway!");
    expect(payload.message).toBe("Please keep this evening clear on your calendar.");
    expect(payload.reveal_at).toBe("2026-11-20T18:00:00Z");
    expect(payload.show_countdown).toBe(true);

    // Negative assertions: confirm complete absence of sensitive fields
    const payloadObj = payload as unknown as Record<string, unknown>;
    expect(payloadObj.budget_total).toBeUndefined();
    expect(payloadObj.currency).toBeUndefined();
    expect(payloadObj.plan_items).toBeUndefined();
    expect(payloadObj.vendors).toBeUndefined();
    expect(payloadObj.notes).toBeUndefined();
    expect(payloadObj.venue).toBeUndefined();
    expect(payloadObj.gift).toBeUndefined();
    expect(payloadObj.owner_id).toBeUndefined();
    expect(payloadObj.occasion_id).toBeUndefined();
    expect(payloadObj.occasion_title).toBeUndefined();
  });

  it("applies default headline if headline is empty or null", () => {
    const payloadEmpty = buildRecipientPayload({ headline: "" });
    expect(payloadEmpty.headline).toBe(DEFAULT_RECIPIENT_HEADLINE);

    const payloadNull = buildRecipientPayload({ headline: null });
    expect(payloadNull.headline).toBe(DEFAULT_RECIPIENT_HEADLINE);
  });

  it("token generation and hashing: generates 32-byte raw token and sha256 hash", () => {
    const rawToken = generateRawShareToken();
    expect(typeof rawToken).toBe("string");
    // 32 bytes = 64 hex characters
    expect(rawToken).toMatch(/^[0-9a-f]{64}$/);

    const secondToken = generateRawShareToken();
    expect(rawToken).not.toBe(secondToken);

    const hash = hashShareToken(rawToken);
    expect(typeof hash).toBe("string");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    // Hard rule: raw token is NEVER the same as its hash
    expect(hash).not.toBe(rawToken);

    // Deterministic hashing
    const hashRepeat = hashShareToken(rawToken);
    expect(hashRepeat).toBe(hash);
  });

  it("token format validation", () => {
    const validRaw = generateRawShareToken();
    expect(isValidTokenFormat(validRaw)).toBe(true);
    expect(isValidTokenFormat("preview")).toBe(true);

    // Invalid tokens
    expect(isValidTokenFormat("")).toBe(false);
    expect(isValidTokenFormat("short-token")).toBe(false);
    expect(isValidTokenFormat("gsk_invalid_prefix_token_12345678901234567890")).toBe(false);
    expect(isValidTokenFormat(null)).toBe(false);
    expect(isValidTokenFormat(undefined)).toBe(false);
    expect(isValidTokenFormat(12345)).toBe(false);
  });

  it("generic 404 response contract", () => {
    expect(GENERIC_NOT_FOUND_RESPONSE).toEqual({ error: "Not found" });
  });

  it("calculateCountdown returns time breakdown and marks revealed state", () => {
    const now = new Date("2026-10-29T12:00:00Z").getTime();

    // 2 days, 3 hours, 15 minutes, 30 seconds ahead
    const futureDate = new Date("2026-10-31T15:15:30Z").toISOString();
    const countdownFuture = calculateCountdown(futureDate, now);

    expect(countdownFuture).not.toBeNull();
    expect(countdownFuture?.isRevealed).toBe(false);
    expect(countdownFuture?.days).toBe(2);
    expect(countdownFuture?.hours).toBe(3);
    expect(countdownFuture?.minutes).toBe(15);
    expect(countdownFuture?.seconds).toBe(30);

    // Past date (already revealed)
    const pastDate = new Date("2026-10-28T12:00:00Z").toISOString();
    const countdownPast = calculateCountdown(pastDate, now);
    expect(countdownPast?.isRevealed).toBe(true);
    expect(countdownPast?.totalMsRemaining).toBe(0);

    // Invalid date returns null
    expect(calculateCountdown("invalid-date-string", now)).toBeNull();
    expect(calculateCountdown(null, now)).toBeNull();
  });
});

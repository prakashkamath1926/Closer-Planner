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

    // Test revealed state (after reveal_at)
    const payload = buildRecipientPayload(rawDbRow, {
      nowMs: new Date("2026-11-20T19:00:00Z").getTime(),
    });

    // Strict allowlist: ONLY headline, is_revealed, message, reveal_at, show_countdown exist
    expect(Object.keys(payload).sort()).toEqual([
      "headline",
      "is_revealed",
      "message",
      "reveal_at",
      "show_countdown",
    ]);

    expect(payload.headline).toBe("A Wonderful Surprise is Underway!");
    expect(payload.message).toBe("Please keep this evening clear on your calendar.");
    expect(payload.reveal_at).toBe("2026-11-20T18:00:00Z");
    expect(payload.show_countdown).toBe(true);
    expect(payload.is_revealed).toBe(true);

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

  it("server-side reveal enforcement: before reveal_at returns only neutral cover and countdown", () => {
    const rawDbRow = {
      headline: "Secret Anniversary Gala",
      message: "Secret location at St. Regis",
      reveal_at: "2026-11-20T18:00:00Z",
      show_countdown: true,
    };

    // 1 hour BEFORE reveal_at
    const beforePayload = buildRecipientPayload(rawDbRow, {
      nowMs: new Date("2026-11-20T17:00:00Z").getTime(),
    });

    expect(beforePayload.headline).toBe(DEFAULT_RECIPIENT_HEADLINE);
    expect(beforePayload.message).toBeNull();
    expect(beforePayload.reveal_at).toBe("2026-11-20T18:00:00Z");
    expect(beforePayload.show_countdown).toBe(true);
    expect(beforePayload.is_revealed).toBe(false);

    // 1 hour AFTER reveal_at
    const afterPayload = buildRecipientPayload(rawDbRow, {
      nowMs: new Date("2026-11-20T19:00:00Z").getTime(),
    });

    expect(afterPayload.headline).toBe("Secret Anniversary Gala");
    expect(afterPayload.message).toBe("Secret location at St. Regis");
    expect(afterPayload.is_revealed).toBe(true);

    // Preview mode: always shows revealed state
    const previewPayload = buildRecipientPayload(rawDbRow, {
      isPreview: true,
      nowMs: new Date("2026-11-20T17:00:00Z").getTime(),
    });

    expect(previewPayload.headline).toBe("Secret Anniversary Gala");
    expect(previewPayload.message).toBe("Secret location at St. Regis");
    expect(previewPayload.is_revealed).toBe(true);
  });

  it("applies default headline if headline is empty or null", () => {
    const payloadEmpty = buildRecipientPayload({ headline: "" });
    expect(payloadEmpty.headline).toBe(DEFAULT_RECIPIENT_HEADLINE);

    const payloadNull = buildRecipientPayload({ headline: null });
    expect(payloadNull.headline).toBe(DEFAULT_RECIPIENT_HEADLINE);
  });

  it("generates 32-byte (64 hex char) cryptographic tokens and matching sha256 hashes", () => {
    const token = generateRawShareToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    const hash = hashShareToken(token);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(token);

    // Hashing same token produces identical hash
    expect(hashShareToken(token)).toBe(hash);
  });

  it("validates token format and rejects invalid or malformed tokens", () => {
    expect(isValidTokenFormat(generateRawShareToken())).toBe(true);
    expect(isValidTokenFormat("preview")).toBe(true);

    expect(isValidTokenFormat("")).toBe(false);
    expect(isValidTokenFormat("short")).toBe(false);
    expect(isValidTokenFormat("12345")).toBe(false);
    expect(isValidTokenFormat(null)).toBe(false);
    expect(isValidTokenFormat(undefined)).toBe(false);
    expect(isValidTokenFormat("gsk_invalid_prefix_token_12345678901234567890")).toBe(false);
    expect(isValidTokenFormat("zzzz".repeat(16))).toBe(false); // Non-hex characters
  });

  it("calculates live countdown time remaining and tracks reveal state", () => {
    const revealTime = new Date("2026-11-20T18:00:00Z").getTime();

    // 2 days, 3 hours, 4 minutes, 5 seconds before reveal
    const nowBefore = revealTime - (2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000;
    const countdown = calculateCountdown("2026-11-20T18:00:00Z", nowBefore);

    expect(countdown).not.toBeNull();
    expect(countdown?.isRevealed).toBe(false);
    expect(countdown?.days).toBe(2);
    expect(countdown?.hours).toBe(3);
    expect(countdown?.minutes).toBe(4);
    expect(countdown?.seconds).toBe(5);

    // After reveal time has passed
    const nowAfter = revealTime + 10000;
    const revealedCountdown = calculateCountdown("2026-11-20T18:00:00Z", nowAfter);

    expect(revealedCountdown).not.toBeNull();
    expect(revealedCountdown?.isRevealed).toBe(true);
    expect(revealedCountdown?.days).toBe(0);
    expect(revealedCountdown?.hours).toBe(0);
    expect(revealedCountdown?.seconds).toBe(0);
  });

  it("provides immutable generic not found response shape", () => {
    expect(GENERIC_NOT_FOUND_RESPONSE).toEqual({ error: "Not found" });
  });

  describe("Letters from loved ones in buildRecipientPayload", () => {
    const rawDbRow = {
      headline: "Surprise Celebration",
      message: "Here is your plan",
      reveal_at: "2026-11-20T18:00:00Z",
      show_countdown: true,
      published: true,
    };

    const sampleLetters = [
      {
        id: "let-1",
        occasion_id: "occ-1",
        contributor_name: "Grandma Rose",
        body: "So proud of you darling!",
        status: "approved",
      },
      {
        id: "let-2",
        occasion_id: "occ-1",
        contributor_name: "Uncle Bob",
        body: "Have a blast!",
        status: "pending", // MUST NOT LEAK
      },
      {
        id: "let-3",
        occasion_id: "occ-1",
        contributor_name: "Spam Bot",
        body: "Buy crypto now",
        status: "rejected", // MUST NOT LEAK
      },
      {
        id: "let-4",
        occasion_id: "occ-DIFFERENT",
        contributor_name: "Stranger",
        body: "Wrong occasion note",
        status: "approved", // OTHER OCCASION MUST NOT LEAK
      },
    ];

    it("does NOT leak any letters before reveal_at", () => {
      const beforeReveal = new Date("2026-11-20T17:00:00Z").getTime();
      const payload = buildRecipientPayload(rawDbRow, {
        nowMs: beforeReveal,
        letters: sampleLetters,
        occasionId: "occ-1",
      });

      expect(payload.is_revealed).toBe(false);
      expect(payload.letters).toEqual([]);
    });

    it("reveals ONLY approved letters for the matching occasion after reveal_at", () => {
      const afterReveal = new Date("2026-11-20T19:00:00Z").getTime();
      const payload = buildRecipientPayload(rawDbRow, {
        nowMs: afterReveal,
        letters: sampleLetters,
        occasionId: "occ-1",
      });

      expect(payload.is_revealed).toBe(true);
      expect(payload.letters).toHaveLength(1);
      expect(payload.letters).toEqual([
        {
          from: "Grandma Rose",
          body: "So proud of you darling!",
        },
      ]);
    });

    it("falls back to 'Someone who loves you' when contributor_name is null", () => {
      const afterReveal = new Date("2026-11-20T19:00:00Z").getTime();
      const anonymousLetter = [
        {
          id: "let-anon",
          occasion_id: "occ-1",
          contributor_name: null,
          body: "A quiet wish from an anonymous friend",
          status: "approved",
        },
      ];

      const payload = buildRecipientPayload(rawDbRow, {
        nowMs: afterReveal,
        letters: anonymousLetter,
        occasionId: "occ-1",
      });

      expect(payload.letters).toEqual([
        {
          from: "Someone who loves you",
          body: "A quiet wish from an anonymous friend",
        },
      ]);
    });
  });
});

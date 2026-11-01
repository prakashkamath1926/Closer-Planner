import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";

describe("Rate Limiter RPC Failure Fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("AI routes must NOT allow unlimited traffic on RPC error: falls back to in-memory limiter and blocks after limit", async () => {
    // Mock Supabase admin RPC throwing an error
    (createAdminClient as any).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "database connection terminated unexpectedly" },
      }),
    });

    const aiBucket = `ai:test-user-${Date.now()}`;
    const windowSeconds = 60;
    const maxHits = 5;

    // First hits within maxHits should be allowed by in-memory fallback
    for (let i = 0; i < maxHits; i++) {
      const res = await checkRateLimit(aiBucket, windowSeconds, maxHits);
      expect(res.allowed).toBe(true);
    }

    // Subsequent hit beyond limit MUST return allowed: false (fails closed / conservative, NOT open)
    const blockedRes = await checkRateLimit(aiBucket, windowSeconds, maxHits);
    expect(blockedRes.allowed).toBe(false);
    expect(blockedRes.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("Non-AI routes fail open on RPC error (traffic allowed)", async () => {
    (createAdminClient as any).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "database connection terminated unexpectedly" },
      }),
    });

    const nonAiBucket = `recipient-ip:127.0.0.1-${Date.now()}`;
    const windowSeconds = 60;
    const maxHits = 2;

    // Non-AI routes fail open even after exceeding maxHits on DB failure
    for (let i = 0; i < 5; i++) {
      const res = await checkRateLimit(nonAiBucket, windowSeconds, maxHits);
      expect(res.allowed).toBe(true);
    }
  });
});

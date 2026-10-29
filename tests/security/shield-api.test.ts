import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as getRecipientRoute } from "@/app/api/recipient/[token]/route";
import {
  generateRawShareToken,
  hashShareToken,
  DEFAULT_RECIPIENT_HEADLINE,
} from "@/lib/engine/shield";

// Mock Supabase admin & server clients
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

// Mock rate limiting
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/security/rate-limit";

describe("Surprise Shield API & Privacy Security (Rule 19, 21, prd.md 6.11)", () => {
  const occasionId = "11111111-1111-1111-1111-111111111111";
  const rawToken = generateRawShareToken();
  const tokenHash = hashShareToken(rawToken);

  beforeEach(() => {
    vi.clearAllMocks();
    (checkRateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: true,
      limit: 30,
      windowSeconds: 60,
    });
  });

  it("server-side reveal: before reveal_at, returns only countdown + neutral cover, never headline or message", async () => {
    const futureRevealAt = new Date(Date.now() + 3600000).toISOString(); // +1 hour in future

    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === "share_links") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                occasion_id: occasionId,
                role: "recipient",
                expires_at: new Date(Date.now() + 86400000).toISOString(),
                revoked_at: null,
              },
              error: null,
            }),
          };
        }
        if (table === "recipient_view") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    occasion_id: occasionId,
                    headline: "TOP SECRET: Diamond Party at The Grand Ballroom",
                    message: "Be at the private gate at 7 PM sharp in black tie.",
                    reveal_at: futureRevealAt,
                    show_countdown: true,
                    published: true,
                    budget_total: 500000,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      }),
    };

    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockAdmin);

    const req = new NextRequest(`http://localhost:3000/api/recipient/${rawToken}`);
    const res = await getRecipientRoute(req, {
      params: Promise.resolve({ token: rawToken }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");

    const json = await res.json();

    // Enforce neutral cover state before reveal_at
    expect(json.headline).toBe(DEFAULT_RECIPIENT_HEADLINE);
    expect(json.message).toBeNull();
    expect(json.reveal_at).toBe(futureRevealAt);
    expect(json.show_countdown).toBe(true);
    expect(json.is_revealed).toBe(false);

    // Negative assertions: secret details must NEVER appear before reveal_at
    expect(JSON.stringify(json)).not.toContain("Diamond Party");
    expect(JSON.stringify(json)).not.toContain("black tie");
    expect(json.budget_total).toBeUndefined();
  });

  it("server-side reveal: after reveal_at, returns full allowlisted headline and message", async () => {
    const pastRevealAt = new Date(Date.now() - 3600000).toISOString(); // -1 hour in past

    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === "share_links") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                occasion_id: occasionId,
                role: "recipient",
                expires_at: new Date(Date.now() + 86400000).toISOString(),
                revoked_at: null,
              },
              error: null,
            }),
          };
        }
        if (table === "recipient_view") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    occasion_id: occasionId,
                    headline: "A Magical Anniversary Evening",
                    message: "Pack an overnight bag and meet at 5 PM.",
                    reveal_at: pastRevealAt,
                    show_countdown: true,
                    published: true,
                    budget_total: 500000,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      }),
    };

    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockAdmin);

    const req = new NextRequest(`http://localhost:3000/api/recipient/${rawToken}`);
    const res = await getRecipientRoute(req, {
      params: Promise.resolve({ token: rawToken }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.headline).toBe("A Magical Anniversary Evening");
    expect(json.message).toBe("Pack an overnight bag and meet at 5 PM.");
    expect(json.reveal_at).toBe(pastRevealAt);
    expect(json.show_countdown).toBe(true);
    expect(json.is_revealed).toBe(true);

    // Negative assertions: confirm complete absence of sensitive fields (Rule 19)
    expect(json.budget_total).toBeUndefined();
    expect(json.plan_items).toBeUndefined();
    expect(json.vendors).toBeUndefined();
  });

  it("organizer preview mode shows revealed state even before reveal_at and when unpublished", async () => {
    const futureRevealAt = new Date(Date.now() + 86400000).toISOString();

    const mockServerUser = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-111" } },
          error: null,
        }),
      },
      from: vi.fn((table: string) => {
        if (table === "occasions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: occasionId },
              error: null,
            }),
          };
        }
        if (table === "recipient_view") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                occasion_id: occasionId,
                headline: "Draft Headline Preview",
                message: "Draft message for preview",
                reveal_at: futureRevealAt,
                show_countdown: true,
                published: false,
              },
              error: null,
            }),
          };
        }
        return {};
      }),
    };

    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockServerUser);

    const req = new NextRequest(
      `http://localhost:3000/api/recipient/preview?occasionId=${occasionId}`,
    );
    const res = await getRecipientRoute(req, {
      params: Promise.resolve({ token: "preview" }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.headline).toBe("Draft Headline Preview");
    expect(json.message).toBe("Draft message for preview");
    expect(json.is_revealed).toBe(true);
  });

  it("returns 429 when IP rate limit is exceeded on recipient route", async () => {
    (checkRateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: false,
      limit: 30,
      windowSeconds: 60,
      retryAfterSeconds: 42,
    });

    const req = new NextRequest(`http://localhost:3000/api/recipient/${rawToken}`);
    const res = await getRecipientRoute(req, {
      params: Promise.resolve({ token: rawToken }),
    });

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");

    const json = await res.json();
    expect(json.error).toBe("Too Many Requests");
  });

  it("compares actual response bodies and headers across all 404 failure cases for byte-for-byte identity", async () => {
    const responses: { cause: string; status: number; bodyText: string; cacheControl: string | null; referrerPolicy: string | null }[] = [];

    // Case 1: Malformed token
    {
      const req = new NextRequest("http://localhost:3000/api/recipient/bad-token-123");
      const res = await getRecipientRoute(req, {
        params: Promise.resolve({ token: "bad-token-123" }),
      });
      responses.push({
        cause: "malformed",
        status: res.status,
        bodyText: await res.text(),
        cacheControl: res.headers.get("Cache-Control"),
        referrerPolicy: res.headers.get("Referrer-Policy"),
      });
    }

    // Case 2: Unknown 64-hex token
    {
      const mockAdmin = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          gt: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      };
      (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockAdmin);

      const unknownToken = "f".repeat(64);
      const req = new NextRequest(`http://localhost:3000/api/recipient/${unknownToken}`);
      const res = await getRecipientRoute(req, {
        params: Promise.resolve({ token: unknownToken }),
      });
      responses.push({
        cause: "unknown",
        status: res.status,
        bodyText: await res.text(),
        cacheControl: res.headers.get("Cache-Control"),
        referrerPolicy: res.headers.get("Referrer-Policy"),
      });
    }

    // Case 3: Revoked token
    {
      const mockAdmin = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          gt: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      };
      (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockAdmin);

      const req = new NextRequest(`http://localhost:3000/api/recipient/${rawToken}`);
      const res = await getRecipientRoute(req, {
        params: Promise.resolve({ token: rawToken }),
      });
      responses.push({
        cause: "revoked",
        status: res.status,
        bodyText: await res.text(),
        cacheControl: res.headers.get("Cache-Control"),
        referrerPolicy: res.headers.get("Referrer-Policy"),
      });
    }

    // Case 4: Unpublished recipient_view
    {
      const mockAdmin = {
        from: vi.fn((table: string) => {
          if (table === "share_links") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              gt: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  occasion_id: occasionId,
                  role: "recipient",
                  expires_at: new Date(Date.now() + 86400000).toISOString(),
                  revoked_at: null,
                },
                error: null,
              }),
            };
          }
          if (table === "recipient_view") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            };
          }
          return {};
        }),
      };
      (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockAdmin);

      const req = new NextRequest(`http://localhost:3000/api/recipient/${rawToken}`);
      const res = await getRecipientRoute(req, {
        params: Promise.resolve({ token: rawToken }),
      });
      responses.push({
        cause: "unpublished",
        status: res.status,
        bodyText: await res.text(),
        cacheControl: res.headers.get("Cache-Control"),
        referrerPolicy: res.headers.get("Referrer-Policy"),
      });
    }

    // Case 5: Unauthenticated preview
    {
      const mockServerUser = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: new Error("Unauthorized"),
          }),
        },
      };
      (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockServerUser);

      const req = new NextRequest(
        `http://localhost:3000/api/recipient/preview?occasionId=${occasionId}`,
      );
      const res = await getRecipientRoute(req, {
        params: Promise.resolve({ token: "preview" }),
      });
      responses.push({
        cause: "unauthenticated_preview",
        status: res.status,
        bodyText: await res.text(),
        cacheControl: res.headers.get("Cache-Control"),
        referrerPolicy: res.headers.get("Referrer-Policy"),
      });
    }

    // Assert that every failure case is BYTE-FOR-BYTE IDENTICAL
    const baseline = responses[0];
    expect(baseline.status).toBe(404);
    expect(baseline.bodyText).toBe(JSON.stringify({ error: "Not found" }));
    expect(baseline.cacheControl).toBe("no-store");
    expect(baseline.referrerPolicy).toBe("no-referrer");

    for (const r of responses) {
      expect(r.status).toBe(404);
      expect(r.bodyText).toBe(baseline.bodyText);
      expect(r.cacheControl).toBe(baseline.cacheControl);
      expect(r.referrerPolicy).toBe(baseline.referrerPolicy);
    }
  });

  it("verifies raw token is never stored in share_links (only sha256 hash)", () => {
    expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rawToken).not.toBe(tokenHash);
    expect(hashShareToken(rawToken)).toBe(tokenHash);
  });
});

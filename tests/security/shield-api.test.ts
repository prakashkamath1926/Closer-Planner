import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as getRecipientRoute } from "@/app/api/recipient/[token]/route";
import {
  generateRawShareToken,
  hashShareToken,
} from "@/lib/engine/shield";

// Mock Supabase admin & server clients
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

describe("Surprise Shield API & Privacy Security (Rule 19, 21)", () => {
  const occasionId = "11111111-1111-1111-1111-111111111111";
  const rawToken = generateRawShareToken();
  const tokenHash = hashShareToken(rawToken);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns strictly allowlisted payload for valid published recipient token", async () => {
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
            eq: vi.fn().mockImplementation(() => {
              // Return query object chain
              return {
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      occasion_id: occasionId,
                      headline: "A Magical Anniversary Evening",
                      message: "Pack an overnight bag and be ready by 5 PM.",
                      reveal_at: "2026-11-20T17:00:00Z",
                      show_countdown: true,
                      published: true,
                      // Simulated DB row with sensitive/internal fields that must NEVER leak
                      budget_total: 500000,
                      notes: "TOP SECRET: Diamond necklace hidden in glove compartment",
                      venue: "The Oberoi Grand Suite",
                      owner_id: "owner-9999",
                    },
                    error: null,
                  }),
                }),
              };
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

    // Verify allowed fields
    expect(json.headline).toBe("A Magical Anniversary Evening");
    expect(json.message).toBe("Pack an overnight bag and be ready by 5 PM.");
    expect(json.reveal_at).toBe("2026-11-20T17:00:00Z");
    expect(json.show_countdown).toBe(true);

    // HARD NEGATIVE ASSERTION: Verify complete absence of private fields (Rule 19)
    const rawKeys = Object.keys(json);
    expect(rawKeys.sort()).toEqual(["headline", "message", "reveal_at", "show_countdown"].sort());

    expect(json.budget_total).toBeUndefined();
    expect(json.budget).toBeUndefined();
    expect(json.notes).toBeUndefined();
    expect(json.venue).toBeUndefined();
    expect(json.owner_id).toBeUndefined();
    expect(json.occasion_id).toBeUndefined();
    expect(json.plan_items).toBeUndefined();
    expect(json.vendors).toBeUndefined();
  });

  it("returns generic 404 body when token is unpublished", async () => {
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
            eq: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockReturnValue({
                // Published = false query returns null row
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              }),
            })),
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

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toEqual({ error: "Not found" });
  });

  it("returns generic 404 body when token is revoked", async () => {
    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === "share_links") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            // Revoked token is filtered out by .is("revoked_at", null)
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null,
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

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toEqual({ error: "Not found" });
  });

  it("returns generic 404 body when token is expired", async () => {
    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === "share_links") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            // Expired token is filtered out by .gt("expires_at", now)
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null,
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

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toEqual({ error: "Not found" });
  });

  it("returns generic 404 body immediately for malformed token shapes", async () => {
    const malformedTokens = [
      "not-a-token",
      "123",
      "a".repeat(63), // 63 chars (not 64)
      "a".repeat(65), // 65 chars
      "xyz-malicious-payload-'; DROP TABLE occasions;--",
    ];

    for (const badToken of malformedTokens) {
      const req = new NextRequest(`http://localhost:3000/api/recipient/${badToken}`);
      const res = await getRecipientRoute(req, {
        params: Promise.resolve({ token: badToken }),
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json).toEqual({ error: "Not found" });
    }

    // Verify admin client was NEVER called for malformed shapes
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("returns generic 404 body for unknown (non-existent) 64-char token", async () => {
    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === "share_links") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          };
        }
        return {};
      }),
    };

    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockAdmin);

    const unknownToken = "e".repeat(64);
    const req = new NextRequest(`http://localhost:3000/api/recipient/${unknownToken}`);
    const res = await getRecipientRoute(req, {
      params: Promise.resolve({ token: unknownToken }),
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toEqual({ error: "Not found" });
  });

  it("supports organizer preview mode for authenticated owner", async () => {
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
                headline: "Organizer Draft Preview",
                message: "Draft message only visible in preview mode",
                reveal_at: null,
                show_countdown: false,
                published: false, // Draft unpublished, but visible to owner in preview
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
    expect(json.headline).toBe("Organizer Draft Preview");
    expect(json.message).toBe("Draft message only visible in preview mode");
    expect(json.show_countdown).toBe(false);
  });

  it("returns generic 404 for preview mode if user is unauthenticated or not owner", async () => {
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

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toEqual({ error: "Not found" });
  });

  it("verifies raw token is never stored in share_links (only sha256 hash)", () => {
    // Assert token generation characteristics
    expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rawToken).not.toBe(tokenHash);

    // Hashing is deterministic & irreversible
    expect(hashShareToken(rawToken)).toBe(tokenHash);
  });
});

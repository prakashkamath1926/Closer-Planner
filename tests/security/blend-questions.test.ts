/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { generateRawShareToken, hashShareToken } from "@/lib/engine/shield";

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return {
    ...mod,
    connection: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock dependencies
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, limit: 10, windowSeconds: 60 }),
  createRateLimitResponse: vi.fn().mockReturnValue(
    new Response(JSON.stringify({ error: "Too Many Requests" }), { status: 429 })
  ),
}));

vi.mock("@/lib/ai/orchestrator", () => ({
  generateBlendQuestions: vi.fn().mockResolvedValue([
    {
      key: "q1",
      category: "vibe",
      title: "Atmosphere",
      subtitle: "Choose style",
      optionA: { value: "cozy", label: "Cozy", description: "Quiet gathering" },
      optionB: { value: "lively", label: "Lively", description: "High energy" },
    },
  ]),
}));

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GET } from "@/app/api/blend/questions/route";

describe("GET /api/blend/questions Authorization & Token Gate", () => {
  const occasionId = "11111111-1111-1111-1111-111111111111";
  const otherOccasionId = "22222222-2222-2222-2222-222222222222";
  const ownerUserId = "user-owner-uuid";
  const userBUserId = "user-b-uuid";

  const rawFriendToken = generateRawShareToken();
  const friendTokenHash = hashShareToken(rawFriendToken);

  const rawRevokedToken = generateRawShareToken();
  const revokedTokenHash = hashShareToken(rawRevokedToken);

  const rawExpiredToken = generateRawShareToken();
  const expiredTokenHash = hashShareToken(rawExpiredToken);

  const occasionData = {
    id: occasionId,
    title: "Surprise Milestone",
    occasion_type: "Birthday",
    recipient_name: "Aarav",
    intent_summary: "Warm and nostalgic",
    guest_count: 15,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default admin mock
    (createAdminClient as any).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "share_links") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn((col: string, val: string) => {
              if (col === "token_hash") {
                if (val === friendTokenHash) {
                  return {
                    is: vi.fn().mockReturnThis(),
                    gt: vi.fn().mockReturnThis(),
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: {
                        occasion_id: occasionId,
                        role: "friend",
                        kind: "view",
                        expires_at: new Date(Date.now() + 86400000).toISOString(),
                        revoked_at: null,
                      },
                      error: null,
                    }),
                  };
                }
                if (val === revokedTokenHash) {
                  return {
                    is: vi.fn().mockReturnThis(),
                    gt: vi.fn().mockReturnThis(),
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: null, // Revoked link filtered out
                      error: null,
                    }),
                  };
                }
                if (val === expiredTokenHash) {
                  return {
                    is: vi.fn().mockReturnThis(),
                    gt: vi.fn().mockReturnThis(),
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: null, // Expired link filtered out
                      error: null,
                    }),
                  };
                }
              }
              return {
                is: vi.fn().mockReturnThis(),
                gt: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              };
            }),
          };
        }
        if (table === "occasions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn((col: string, val: string) => ({
              single: vi.fn().mockResolvedValue({
                data: val === occasionId ? occasionData : null,
                error: val === occasionId ? null : { message: "Not found" },
              }),
            })),
          };
        }
        if (table === "recipient_facts") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        return {};
      }),
    });
  });

  it("no session -> 404 (service-role fallback blocked)", async () => {
    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: "No session" } }),
      }),
    });

    const req = new NextRequest(`http://localhost:3000/api/blend/questions?occasionId=${occasionId}`);
    const res = await GET(req);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not found");
  });

  it("user B -> 404 (non-owner blocked)", async () => {
    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: userBUserId } }, error: null }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: "RLS blocked" } }),
      }),
    });

    const req = new NextRequest(`http://localhost:3000/api/blend/questions?occasionId=${occasionId}`);
    const res = await GET(req);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not found");
  });

  it("owner -> 200", async () => {
    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: ownerUserId } }, error: null }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: occasionData, error: null }),
      }),
    });

    const req = new NextRequest(`http://localhost:3000/api/blend/questions?occasionId=${occasionId}`);
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.questions).toBeDefined();
    expect(body.questions.length).toBeGreaterThan(0);
  });

  it("valid friend token -> 200", async () => {
    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: "No session" } }),
      }),
    });

    const req = new NextRequest(
      `http://localhost:3000/api/blend/questions?occasionId=${occasionId}&token=${rawFriendToken}`
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.questions).toBeDefined();
  });

  it("token for a different occasion -> 404", async () => {
    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: "No session" } }),
      }),
    });

    // Requesting otherOccasionId while token belongs to occasionId
    const req = new NextRequest(
      `http://localhost:3000/api/blend/questions?occasionId=${otherOccasionId}&token=${rawFriendToken}`
    );
    const res = await GET(req);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not found");
  });

  it("revoked or expired token -> 404", async () => {
    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: "No session" } }),
      }),
    });

    const reqRevoked = new NextRequest(
      `http://localhost:3000/api/blend/questions?occasionId=${occasionId}&token=${rawRevokedToken}`
    );
    const resRevoked = await GET(reqRevoked);
    expect(resRevoked.status).toBe(404);

    const reqExpired = new NextRequest(
      `http://localhost:3000/api/blend/questions?occasionId=${occasionId}&token=${rawExpiredToken}`
    );
    const resExpired = await GET(reqExpired);
    expect(resExpired.status).toBe(404);
  });
});

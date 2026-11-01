/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock Supabase modules
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GET } from "@/app/auth/callback/route";

describe("GET /auth/callback - OAuth Claim Takeover Protection", () => {
  const victimOccasionId = "11111111-1111-1111-1111-111111111111";
  const myOccasionId = "22222222-2222-2222-2222-222222222222";
  const anonUserId = "aaaa1111-0000-0000-0000-000000000000";
  const attackerUserId = "66666666-0000-0000-0000-000000000000";
  const googleAuthenticatedUserId = "99999999-0000-0000-0000-000000000000";

  let adminUpdateMock: any;
  let adminEqMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    const mockQuery: any = {
      eq: vi.fn(),
      select: vi.fn().mockResolvedValue({ data: [{ id: myOccasionId }], error: null }),
    };
    mockQuery.eq.mockReturnValue(mockQuery);

    adminEqMock = mockQuery.eq;
    adminUpdateMock = vi.fn().mockReturnValue(mockQuery);

    (createAdminClient as any).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "occasions") {
          return {
            update: adminUpdateMock,
          };
        }
        return {};
      }),
    });
  });

  it("claim with no anon session is ignored: admin update is never called", async () => {
    const mockSupabase = {
      auth: {
        // Pre-exchange session check returns no user
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
        exchangeCodeForSession: vi.fn().mockResolvedValue({
          data: { user: { id: googleAuthenticatedUserId } },
          error: null,
        }),
      },
    };
    (createClient as any).mockResolvedValue(mockSupabase);

    const req = new NextRequest(`http://localhost:3000/auth/callback?code=valid-code&claim=${victimOccasionId}`);
    const res = await GET(req);

    expect(res.status).toBe(307); // Redirect to destination
    // Admin update MUST NOT be called because there was no anonymous session to claim from
    expect(adminUpdateMock).not.toHaveBeenCalled();
  });

  it("attacker session claims a victim occasion id -> query enforces .eq('owner_id', anonId)", async () => {
    const mockSupabase = {
      auth: {
        // Pre-exchange session belongs to attacker anon
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: attackerUserId, is_anonymous: true } },
          error: null,
        }),
        exchangeCodeForSession: vi.fn().mockResolvedValue({
          data: { user: { id: googleAuthenticatedUserId } },
          error: null,
        }),
      },
    };
    (createClient as any).mockResolvedValue(mockSupabase);

    const req = new NextRequest(`http://localhost:3000/auth/callback?code=valid-code&claim=${victimOccasionId}`);
    await GET(req);

    // Must update owner_id to new google user
    expect(adminUpdateMock).toHaveBeenCalledWith({ owner_id: googleAuthenticatedUserId });
    // Must constrain BOTH id = victimOccasionId AND owner_id = attackerUserId
    expect(adminEqMock).toHaveBeenCalledWith("id", victimOccasionId);
    expect(adminEqMock).toHaveBeenCalledWith("owner_id", attackerUserId);
  });

  it("legitimate anon->Google claim of the anon user's own occasion works with owner check", async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: anonUserId, is_anonymous: true } },
          error: null,
        }),
        exchangeCodeForSession: vi.fn().mockResolvedValue({
          data: { user: { id: googleAuthenticatedUserId } },
          error: null,
        }),
      },
    };
    (createClient as any).mockResolvedValue(mockSupabase);

    const req = new NextRequest(`http://localhost:3000/auth/callback?code=valid-code&claim=${myOccasionId}`);
    await GET(req);

    expect(adminUpdateMock).toHaveBeenCalledWith({ owner_id: googleAuthenticatedUserId });
    expect(adminEqMock).toHaveBeenCalledWith("id", myOccasionId);
    expect(adminEqMock).toHaveBeenCalledWith("owner_id", anonUserId);
  });

  it("claim with 0 rows updated redirects with notice=claim_failed and keeps user signed in", async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: anonUserId, is_anonymous: true } },
          error: null,
        }),
        exchangeCodeForSession: vi.fn().mockResolvedValue({
          data: { user: { id: googleAuthenticatedUserId } },
          error: null,
        }),
      },
    };
    (createClient as any).mockResolvedValue(mockSupabase);

    // Mock 0 rows updated
    (createAdminClient as any).mockReturnValue({
      from: vi.fn(() => ({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      })),
    });

    const req = new NextRequest(
      `http://localhost:3000/auth/callback?code=valid-code&claim=${myOccasionId}&next=/plan/${myOccasionId}`
    );
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/plan/");
    expect(location).toContain("notice=claim_failed");
  });
});

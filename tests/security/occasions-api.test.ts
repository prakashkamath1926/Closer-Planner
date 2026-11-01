import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { PATCH as occasionsPatchRoute } from "@/app/api/occasions/[id]/route";

describe("PATCH /api/occasions/[id] Security & Reliability Hardening", () => {
  const userId = "owner-user-uuid-1234";
  const occasionId = "occ-uuid-5678";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns HTTP 400 on malformed JSON body", async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
      },
    });

    const req = new NextRequest(`http://localhost:3000/api/occasions/${occasionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{ not_valid_json",
    });

    const res = await occasionsPatchRoute(req, {
      params: Promise.resolve({ id: occasionId }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("malformed_json");
  });

  it("validates that eventAt is a valid ISO date string (returns HTTP 400 on invalid format)", async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
      },
    });

    const req = new NextRequest(`http://localhost:3000/api/occasions/${occasionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventAt: "not-a-valid-date" }),
    });

    const res = await occasionsPatchRoute(req, {
      params: Promise.resolve({ id: occasionId }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid parameters");
  });

  it("updates occasion with owner_id check and inserts snapshot only after update succeeds", async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null });
    const mockUpdateOccasion = {
      id: occasionId,
      owner_id: userId,
      title: "Updated Title",
      event_at: "2026-11-20T19:00:00.000Z",
    };

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
      },
      from: vi.fn((table: string) => {
        if (table === "occasions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: occasionId, owner_id: userId, title: "Old Title" },
                    error: null,
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: mockUpdateOccasion,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "plan_items" || table === "vendors") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        if (table === "plan_versions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [{ version_no: 1 }], error: null }),
                }),
              }),
            }),
            insert: mockInsert,
          };
        }
        return {};
      }),
    };

    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockSupabase);

    const req = new NextRequest(`http://localhost:3000/api/occasions/${occasionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventAt: "2026-11-20T19:00:00.000Z", title: "Updated Title" }),
    });

    const res = await occasionsPatchRoute(req, {
      params: Promise.resolve({ id: occasionId }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.newVersionNo).toBe(2);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("does not insert snapshot into plan_versions if occasion update fails", async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null });

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
      },
      from: vi.fn((table: string) => {
        if (table === "occasions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: occasionId, owner_id: userId, title: "Old Title" },
                    error: null,
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: null,
                      error: { message: "Database update error" },
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "plan_items" || table === "vendors") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        if (table === "plan_versions") {
          return {
            insert: mockInsert,
          };
        }
        return {};
      }),
    };

    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockSupabase);

    const req = new NextRequest(`http://localhost:3000/api/occasions/${occasionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated Title" }),
    });

    const res = await occasionsPatchRoute(req, {
      params: Promise.resolve({ id: occasionId }),
    });

    expect(res.status).toBe(500);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

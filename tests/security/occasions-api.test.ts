import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { PATCH as occasionsPatchRoute } from "@/app/api/occasions/[id]/route";
import { POST as restoreRoute } from "@/app/api/versions/restore/route";

describe("PATCH /api/occasions/[id] Security & Reliability Hardening", () => {
  const userId = "550e8400-e29b-41d4-a716-446655440001";
  const occasionId = "550e8400-e29b-41d4-a716-446655440000";

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

  it("stores OLD state (Dec 10) in plan_versions snapshot when date is updated to Dec 20, and restore reverts to Dec 10", async () => {
    const originalDate = "2026-12-10T19:00:00.000Z";
    const updatedDate = "2026-12-20T19:00:00.000Z";

    // In-memory mock database state
    let occasionState = {
      id: occasionId,
      owner_id: userId,
      title: "Anniversary Celebration",
      event_at: originalDate,
      budget_total: "1000.00",
      guest_count: 20,
      urgency_mode: "weeks_away",
      status: "planning",
    };

    const versionsStore: Array<{
      occasion_id: string;
      version_no: number;
      snapshot: Record<string, unknown>;
      change_summary: string;
    }> = [];

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
      },
      from: vi.fn((table: string) => {
        if (table === "occasions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation(() => ({
                eq: vi.fn().mockImplementation(() => ({
                  single: vi.fn().mockImplementation(async () => ({
                    data: { ...occasionState },
                    error: null,
                  })),
                })),
                single: vi.fn().mockImplementation(async () => ({
                  data: { ...occasionState },
                  error: null,
                })),
              })),
            }),
            update: vi.fn().mockImplementation((updates: Record<string, unknown>) => {
              occasionState = { ...occasionState, ...updates } as typeof occasionState;
              return {
                eq: vi.fn().mockImplementation(() => ({
                  eq: vi.fn().mockImplementation(() => ({
                    select: vi.fn().mockReturnValue({
                      single: vi.fn().mockResolvedValue({
                        data: { ...occasionState },
                        error: null,
                      }),
                    }),
                  })),
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { ...occasionState },
                      error: null,
                    }),
                  }),
                })),
              };
            }),
          };
        }
        if (table === "plan_items" || table === "vendors") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === "plan_versions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((col: string) => {
                if (col === "occasion_id") {
                  return {
                    eq: vi.fn().mockImplementation((subCol: string, subVal: unknown) => {
                      if (subCol === "version_no") {
                        const row = versionsStore.find((v) => v.version_no === subVal);
                        return {
                          single: vi.fn().mockResolvedValue({
                            data: row || null,
                            error: row ? null : { message: "Version not found" },
                          }),
                        };
                      }
                      return {};
                    }),
                    order: vi.fn().mockReturnValue({
                      limit: vi.fn().mockImplementation(async () => {
                        const sorted = [...versionsStore].sort((a, b) => b.version_no - a.version_no);
                        return { data: sorted.slice(0, 1), error: null };
                      }),
                    }),
                  };
                }
                return {};
              }),
            }),
            insert: vi.fn().mockImplementation(async (row: {
              occasion_id: string;
              version_no: number;
              snapshot: Record<string, unknown>;
              change_summary: string;
            }) => {
              versionsStore.push(row);
              return { error: null };
            }),
          };
        }
        return {};
      }),
    };

    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockSupabase);

    // 1. Initial occasion starts dated Dec 10
    expect(occasionState.event_at).toBe(originalDate);

    // 2. PATCH occasion to Dec 20
    const patchReq = new NextRequest(`http://localhost:3000/api/occasions/${occasionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventAt: updatedDate }),
    });

    const patchRes = await occasionsPatchRoute(patchReq, {
      params: Promise.resolve({ id: occasionId }),
    });

    expect(patchRes.status).toBe(200);
    const patchBody = await patchRes.json();
    expect(patchBody.success).toBe(true);
    // Live occasion is now updated to Dec 20
    expect(occasionState.event_at).toBe(updatedDate);
    expect(patchBody.occasion.event_at).toBe(updatedDate);

    // 3. Confirm that the snapshot saved to plan_versions contains the OLD state (Dec 10)
    expect(versionsStore).toHaveLength(1);
    const snapshotOccasion = (versionsStore[0].snapshot as { occasion: { event_at: string } }).occasion;
    expect(snapshotOccasion.event_at).toBe(originalDate);
    expect(snapshotOccasion.event_at).not.toBe(updatedDate);

    // 4. Restore version 1 (which holds the Dec 10 snapshot)
    const restoreReq = new NextRequest("http://localhost:3000/api/versions/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ occasionId, targetVersionNo: 1 }),
    });

    const restoreRes = await restoreRoute(restoreReq);
    expect(restoreRes.status).toBe(200);
    const restoreBody = await restoreRes.json();
    expect(restoreBody.success).toBe(true);

    // 5. Verify the date in the live occasion is back to Dec 10
    expect(occasionState.event_at).toBe(originalDate);
  });
});

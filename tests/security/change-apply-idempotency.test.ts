/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock Supabase server
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { POST } from "@/app/api/changes/apply/route";

describe("POST /api/changes/apply Idempotency Key Replay Protection", () => {
  const occasionId = "e1111111-1111-4111-a111-111111111111";
  const idempotencyKey = "idem-test-key-12345";
  const userId = "u1111111-1111-4111-a111-111111111111";

  const sampleTradeoff = {
    id: "tradeoff-1",
    title: "Streamline Decorations",
    description: "Save budget by focusing on floral centerpiece",
    whyItWorks: "Honors aesthetic without excessive spend",
    preservedIntentTags: ["beauty"],
    modifiedItems: [],
    addedItems: [],
    removedItemIds: [],
  };

  let versionsStore: Array<{
    occasion_id: string;
    version_no: number;
    snapshot: any;
    change_summary: string;
  }> = [];

  let insertCount = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    versionsStore = [];
    insertCount = 0;

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: userId } },
          error: null,
        }),
      },
      from: vi.fn((table: string) => {
        if (table === "occasions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: occasionId,
                title: "Anniversary",
                owner_id: userId,
                budget_total: "50000.00",
                event_at: "2026-12-01T18:00:00Z",
                guest_count: 20,
              },
              error: null,
            }),
            update: vi.fn().mockReturnThis(),
          };
        }
        if (table === "plan_items") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            update: vi.fn().mockReturnThis(),
            delete: vi.fn().mockReturnThis(),
            insert: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (table === "vendors") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (table === "plan_versions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((col: string, val: string) => {
                const filtered = versionsStore.filter((v) => v.occasion_id === val);
                return {
                  order: vi.fn(() => ({
                    limit: vi.fn((limitNum: number) =>
                      Promise.resolve({
                        data: filtered.slice(0, limitNum),
                        error: null,
                      }),
                    ),
                  })),
                  // If queried directly for snapshot idempotency lookup
                  filter: vi.fn((path: string, op: string, filterVal: string) => ({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: filtered.find((v) => v.snapshot?.idempotency_key === filterVal) || null,
                      error: null,
                    }),
                  })),
                  then: (resolve: any) => resolve({ data: filtered, error: null }),
                };
              }),
            })),
            insert: vi.fn((row: any) => {
              insertCount++;
              versionsStore.push(row);
              return Promise.resolve({ error: null });
            }),
          };
        }
        return {};
      }),
    };

    (createClient as any).mockResolvedValue(mockSupabase);
  });

  it("the same request sent twice creates only one version and returns existing result", async () => {
    const payload = {
      occasionId,
      chosenOption: sampleTradeoff,
      idempotencyKey,
    };

    // First request
    const req1 = new NextRequest("http://localhost:3000/api/changes/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const res1 = await POST(req1);
    const body1 = await res1.json();
    if (res1.status !== 200) {
      console.log("res1 error:", JSON.stringify(body1));
    }
    expect(res1.status).toBe(200);
    expect(body1.success).toBe(true);
    expect(body1.newVersionNo).toBe(1);
    expect(insertCount).toBe(1);
    expect(versionsStore.length).toBe(1);

    // Second request with identical payload and idempotency key (network replay)
    const req2 = new NextRequest("http://localhost:3000/api/changes/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const res2 = await POST(req2);
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.success).toBe(true);
    expect(body2.newVersionNo).toBe(1);

    // CRITICAL: Second call must NOT insert a second version!
    expect(insertCount).toBe(1);
    expect(versionsStore.length).toBe(1);
  });

  it("rejects request if idempotencyKey is missing (required)", async () => {
    const reqWithoutKey = new NextRequest("http://localhost:3000/api/changes/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        occasionId,
        chosenOption: sampleTradeoff,
      }),
    });
    const res = await POST(reqWithoutKey);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid apply payload");
  });
});

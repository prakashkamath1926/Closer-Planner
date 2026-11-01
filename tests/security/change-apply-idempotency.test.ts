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
            update: vi.fn((updates: any) => ({
              eq: vi.fn((col1: string, val1: any) => ({
                eq: vi.fn((col2: string, val2: any) => {
                  const found = versionsStore.find((v) => (v as any)[col1] === val1 && (v as any)[col2] === val2);
                  if (found) {
                    Object.assign(found, updates);
                  }
                  return Promise.resolve({ error: null });
                }),
              })),
            })),
          };
        }
        return {};
      }),
    };

    (createClient as any).mockResolvedValue(mockSupabase);
  });

  it("successful replay: the same request sent twice creates only one version and returns existing result", async () => {
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
    expect(versionsStore[0].snapshot.apply_status).toBe("completed");

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

  it("partial failure retry: when a step fails midway, retry with same idempotency key returns 409 error instead of success", async () => {
    const tradeoffWithInsert = {
      ...sampleTradeoff,
      addedItems: [{ title: "New Item", estimatedCost: 100, category: "decor" }],
    };

    // Override plan_items insert to simulate partial failure after version snapshot was created
    const customSupabase = {
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
              data: { id: occasionId, owner_id: userId, title: "Anniversary" },
              error: null,
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === "plan_items") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }),
            delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: null }) }) }),
            insert: vi.fn().mockResolvedValue({ error: { message: "Database connection failed during items_insert" } }),
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
                const filtered = versionsStore.filter((v) => (v as any)[col] === val);
                return {
                  order: vi.fn(() => ({
                    limit: vi.fn((limitNum: number) =>
                      Promise.resolve({
                        data: filtered.slice(0, limitNum),
                        error: null,
                      }),
                    ),
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
            update: vi.fn((updates: any) => ({
              eq: vi.fn((col1: string, val1: any) => ({
                eq: vi.fn((col2: string, val2: any) => {
                  const found = versionsStore.find((v) => (v as any)[col1] === val1 && (v as any)[col2] === val2);
                  if (found) {
                    Object.assign(found, updates);
                  }
                  return Promise.resolve({ error: null });
                }),
              })),
            })),
          };
        }
        return {};
      }),
    };

    (createClient as any).mockResolvedValue(customSupabase);

    const failKey = "fail-key-999";
    const payload = {
      occasionId,
      chosenOption: tradeoffWithInsert,
      idempotencyKey: failKey,
    };

    // First attempt: should fail at items_insert with HTTP 500
    const req1 = new NextRequest("http://localhost:3000/api/changes/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const res1 = await POST(req1);
    expect(res1.status).toBe(500);
    const body1 = await res1.json();
    expect(body1.stage).toBe("items_insert");
    expect(body1.success).toBeUndefined();

    // Verify version record was recorded as failed (NOT left as completed)
    expect(versionsStore.length).toBe(1);
    expect(versionsStore[0].snapshot.apply_status).toBe("failed");
    expect(versionsStore[0].snapshot.failure_stage).toBe("items_insert");

    // Second attempt (retry with same key): MUST NOT return 200 success!
    const req2 = new NextRequest("http://localhost:3000/api/changes/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const res2 = await POST(req2);
    expect(res2.status).toBe(409);
    const body2 = await res2.json();
    expect(body2.success).toBeUndefined();
    expect(body2.code).toBe("idempotency_partial_failure");
    expect(body2.stage).toBe("items_insert");
    expect(body2.error).toContain("partially failed");

    // CRITICAL: Retry must not have inserted duplicate versions
    expect(insertCount).toBe(1);
    expect(versionsStore.length).toBe(1);
  });

  it("overlapping requests with the same key: rejects concurrent request while an operation is in progress", async () => {
    // Seed an in-progress record into versionsStore
    versionsStore.push({
      occasion_id: occasionId,
      version_no: 1,
      change_summary: "Applying change",
      snapshot: {
        idempotency_key: "concurrent-key-1",
        apply_status: "in_progress",
        started_at: new Date().toISOString(),
      },
    });

    const req = new NextRequest("http://localhost:3000/api/changes/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        occasionId,
        chosenOption: sampleTradeoff,
        idempotencyKey: "concurrent-key-1",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("idempotency_in_progress");
    expect(body.error).toContain("in progress");
  });

  it("mutation failure followed by failure to record the failed status: returns explicit 500 error and preserves recovery details", async () => {
    const brokenSupabase = {
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
              data: { id: occasionId, owner_id: userId, title: "Anniversary" },
              error: null,
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === "plan_items") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }),
            delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: null }) }) }),
            insert: vi.fn().mockResolvedValue({ error: { message: "Database connection failed during items_insert" } }),
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
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
                })),
                then: (resolve: any) => resolve({ data: [], error: null }),
              })),
            })),
            insert: vi.fn().mockResolvedValue({ error: null }),
            // Failure when attempting to record the failed status
            update: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({
                  error: { message: "Network timeout while updating plan_versions snapshot" },
                }),
              })),
            })),
          };
        }
        return {};
      }),
    };

    (createClient as any).mockResolvedValue(brokenSupabase);

    const req = new NextRequest("http://localhost:3000/api/changes/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        occasionId,
        chosenOption: {
          ...sampleTradeoff,
          addedItems: [{ title: "New Item", estimatedCost: 100, category: "decor" }],
        },
        idempotencyKey: "double-fault-key",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBeUndefined();
    expect(body.code).toBe("mutation_and_record_failure");
    expect(body.stage).toBe("items_insert");
    expect(body.mutationError).toContain("items_insert");
    expect(body.recordError).toContain("Network timeout");
    expect(body.idempotencyKey).toBe("double-fault-key");
    expect(body.versionNo).toBe(1);
  });

  it("stale in-progress retry: returns 409 stale error and never marks completed", async () => {
    // Seed an in-progress record started 120 seconds ago
    versionsStore.push({
      occasion_id: occasionId,
      version_no: 1,
      change_summary: "Old attempt",
      snapshot: {
        idempotency_key: "stale-key-1",
        apply_status: "in_progress",
        started_at: new Date(Date.now() - 120_000).toISOString(),
      },
    });

    const req = new NextRequest("http://localhost:3000/api/changes/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        occasionId,
        chosenOption: sampleTradeoff,
        idempotencyKey: "stale-key-1",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.success).toBeUndefined();
    expect(body.code).toBe("idempotency_stale_in_progress");
    expect(body.error).toContain("incomplete (in_progress) state");
    expect(body.staleVersionNo).toBe(1);

    // Verify snapshot was NEVER automatically marked completed
    expect(versionsStore[0].snapshot.apply_status).toBe("in_progress");
  });

  it("handles concurrent database insert collision (unique_violation 23505) with 409 concurrent modification", async () => {
    const raceSupabase = {
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
              data: { id: occasionId, owner_id: userId, title: "Anniversary" },
              error: null,
            }),
          };
        }
        if (table === "plan_items" || table === "vendors") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
                then: (resolve: any) => resolve({ data: [], error: null }),
              }),
            }),
          };
        }
        if (table === "plan_versions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
                })),
                then: (resolve: any) => resolve({ data: [], error: null }),
              })),
            })),
            insert: vi.fn().mockResolvedValue({
              error: { code: "23505", message: "duplicate key value violates unique constraint" },
            }),
          };
        }
        return {};
      }),
    };

    (createClient as any).mockResolvedValue(raceSupabase);

    const req = new NextRequest("http://localhost:3000/api/changes/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        occasionId,
        chosenOption: sampleTradeoff,
        idempotencyKey: "race-key-1",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("concurrent_modification");
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

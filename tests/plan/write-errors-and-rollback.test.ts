/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { POST as applyChangeRoute } from "@/app/api/changes/apply/route";
import { POST as restoreVersionRoute } from "@/app/api/versions/restore/route";

describe("Database Write-Error Handling & Snapshot Integrity", () => {
  const occasionId = "b1111111-1111-4111-a111-111111111111";
  const userId = "u1111111-1111-4111-a111-111111111111";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/changes/apply Database Write Failures", () => {
    const baseTradeoff = {
      id: "tradeoff-1",
      title: "Venue Adjustment",
      description: "Shift to outdoor pavilion",
      whyItWorks: "Matches budget constraints",
      preservedIntentTags: ["nature"],
      modifiedItems: [{ id: "item-1", title: "Outdoor Setup", estimatedCost: 500 }],
      addedItems: [{ title: "Canopy", estimatedCost: 200, category: "decor" }],
      removedItemIds: ["item-2"],
    };

    function setupMockSupabase(overrides: {
      occasionUpdateError?: any;
      itemDeleteError?: any;
      itemUpdateError?: any;
      itemInsertError?: any;
    } = {}) {
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
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: occasionId, owner_id: userId, title: "Celebration", budget_total: "1000.00" },
                    error: null,
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  error: overrides.occasionUpdateError || null,
                }),
              }),
            };
          }
          if (table === "plan_items") {
            const itemsData = [
              { id: "item-1", occasion_id: occasionId, title: "Original Setup", sort_order: 1 },
              { id: "item-2", occasion_id: occasionId, title: "Old Lighting", sort_order: 2 },
            ];
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: itemsData, error: null }),
                  then: (resolve: any) => resolve({ data: itemsData, error: null }),
                }),
              }),
              delete: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  in: vi.fn().mockResolvedValue({
                    error: overrides.itemDeleteError || null,
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({
                    error: overrides.itemUpdateError || null,
                  }),
                }),
              }),
              insert: vi.fn().mockResolvedValue({
                error: overrides.itemInsertError || null,
              }),
            };
          }
          if (table === "vendors") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            };
          }
          if (table === "plan_versions") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(() => Promise.resolve({ data: [{ version_no: 1 }], error: null })),
                  })),
                  filter: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  })),
                  then: (resolve: any) => resolve({ data: [], error: null }),
                })),
              })),
              insert: vi.fn().mockResolvedValue({ error: null }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ error: null }),
                }),
              }),
            };
          }
          return {};
        }),
      };

      (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockSupabase);
      return mockSupabase;
    }

    it("returns HTTP 500 when occasion update fails, without returning success: true", async () => {
      setupMockSupabase({ occasionUpdateError: { message: "DB lock timeout on occasions table" } });

      const req = new NextRequest("http://localhost:3000/api/changes/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occasionId,
          chosenOption: baseTradeoff,
          newBudgetTotal: 800,
          idempotencyKey: "test-idem-1",
        }),
      });

      const res = await applyChangeRoute(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.success).toBeUndefined();
      expect(json.stage).toBe("occasion_update");
    });

    it("returns HTTP 500 when plan_items delete fails", async () => {
      setupMockSupabase({ itemDeleteError: { message: "Foreign key constraint on plan_items" } });

      const req = new NextRequest("http://localhost:3000/api/changes/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occasionId,
          chosenOption: baseTradeoff,
          idempotencyKey: "test-idem-2",
        }),
      });

      const res = await applyChangeRoute(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.success).toBeUndefined();
      expect(json.stage).toBe("items_delete");
    });

    it("returns HTTP 500 when plan_items update fails", async () => {
      setupMockSupabase({ itemUpdateError: { message: "Invalid status value in plan_items" } });

      const req = new NextRequest("http://localhost:3000/api/changes/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occasionId,
          chosenOption: baseTradeoff,
          idempotencyKey: "test-idem-3",
        }),
      });

      const res = await applyChangeRoute(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.success).toBeUndefined();
      expect(json.stage).toBe("items_update");
    });

    it("returns HTTP 500 when plan_items insert fails", async () => {
      setupMockSupabase({ itemInsertError: { message: "Unique violation on plan_items insert" } });

      const req = new NextRequest("http://localhost:3000/api/changes/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occasionId,
          chosenOption: baseTradeoff,
          idempotencyKey: "test-idem-4",
        }),
      });

      const res = await applyChangeRoute(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.success).toBeUndefined();
      expect(json.stage).toBe("items_insert");
    });
  });

  describe("POST /api/versions/restore Error Handling & Snapshot Validation", () => {
    function setupRestoreMock(options: {
      snapshot?: any;
      occasionFetchError?: any;
      occasionUpdateError?: any;
      itemDeleteError?: any;
      itemInsertError?: any;
      vendorDeleteError?: any;
      vendorInsertError?: any;
    } = {}) {
      const validSnapshot = {
        occasion: { id: occasionId, title: "Birthday Party" },
        plan_items: [
          {
            id: "item-10",
            title: "Music",
            occasion_id: occasionId,
            plan_b: "Spotify playlist",
            is_non_negotiable: true,
          },
        ],
        vendors: [
          {
            id: "v-1",
            name: "DJ Live",
            occasion_id: occasionId,
            category: "music",
            quote_amount: "500.00",
            status: "confirmed",
          },
        ],
        captured_at: new Date().toISOString(),
      };

      let insertedItems: any[] = [];
      let insertedVendors: any[] = [];

      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: userId } },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === "plan_versions") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: {
                        version_no: 1,
                        snapshot: options.snapshot !== undefined ? options.snapshot : validSnapshot,
                      },
                      error: null,
                    }),
                  }),
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: [{ version_no: 2 }],
                      error: null,
                    }),
                  }),
                }),
              }),
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          if (table === "occasions") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: options.occasionFetchError ? null : { id: occasionId, title: "Current" },
                    error: options.occasionFetchError || null,
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  error: options.occasionUpdateError || null,
                }),
              }),
            };
          }
          if (table === "plan_items") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [{ id: "curr-1", occasion_id: occasionId, title: "Live item" }],
                  error: null,
                }),
              }),
              delete: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  error: options.itemDeleteError || null,
                }),
              }),
              insert: vi.fn((rows: any) => {
                insertedItems = rows;
                return Promise.resolve({
                  error: options.itemInsertError || null,
                });
              }),
            };
          }
          if (table === "vendors") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
              delete: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  error: options.vendorDeleteError || null,
                }),
              }),
              insert: vi.fn((rows: any) => {
                insertedVendors = rows;
                return Promise.resolve({
                  error: options.vendorInsertError || null,
                });
              }),
            };
          }
          return {};
        }),
        _getInsertedItems: () => insertedItems,
        _getInsertedVendors: () => insertedVendors,
      };

      (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockSupabase);
      return mockSupabase;
    }

    it("rejects malformed snapshots with HTTP 400 before attempting restore", async () => {
      setupRestoreMock({ snapshot: { corrupted: true } });

      const req = new NextRequest("http://localhost:3000/api/versions/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ occasionId, targetVersionNo: 1 }),
      });

      const res = await restoreVersionRoute(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("malformed");
    });

    it("returns HTTP 404 if current occasion cannot be fetched, preventing corrupt dummy snapshot", async () => {
      setupRestoreMock({ occasionFetchError: { message: "Occasion row missing" } });

      const req = new NextRequest("http://localhost:3000/api/versions/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ occasionId, targetVersionNo: 1 }),
      });

      const res = await restoreVersionRoute(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toContain("Occasion not found");
    });

    it("returns HTTP 500 when occasions update fails during restore", async () => {
      setupRestoreMock({ occasionUpdateError: { message: "Constraint failed" } });

      const req = new NextRequest("http://localhost:3000/api/versions/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ occasionId, targetVersionNo: 1 }),
      });

      const res = await restoreVersionRoute(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.stage).toBe("occasion_restore");
    });

    it("returns HTTP 500 when plan_items delete fails during restore", async () => {
      setupRestoreMock({ itemDeleteError: { message: "Delete timeout" } });

      const req = new NextRequest("http://localhost:3000/api/versions/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ occasionId, targetVersionNo: 1 }),
      });

      const res = await restoreVersionRoute(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.stage).toBe("items_clear");
    });

    it("returns HTTP 500 when plan_items insert fails during restore", async () => {
      setupRestoreMock({ itemInsertError: { message: "Insert constraint violation" } });

      const req = new NextRequest("http://localhost:3000/api/versions/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ occasionId, targetVersionNo: 1 }),
      });

      const res = await restoreVersionRoute(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.stage).toBe("items_insert");
    });

    it("restores vendors, plan_b, and is_non_negotiable from snapshot", async () => {
      const mock = setupRestoreMock();

      const req = new NextRequest("http://localhost:3000/api/versions/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ occasionId, targetVersionNo: 1 }),
      });

      const res = await restoreVersionRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Verify plan items received plan_b and is_non_negotiable
      const items = mock._getInsertedItems();
      expect(items.length).toBe(1);
      expect(items[0].title).toBe("Music");
      expect(items[0].plan_b).toBe("Spotify playlist");
      expect(items[0].is_non_negotiable).toBe(true);

      // Verify vendors were recreated
      const vendors = mock._getInsertedVendors();
      expect(vendors.length).toBe(1);
      expect(vendors[0].name).toBe("DJ Live");
      expect(vendors[0].category).toBe("music");
      expect(vendors[0].quote_amount).toBe("500.00");
    });

    it("returns HTTP 500 when vendors delete fails during restore", async () => {
      setupRestoreMock({ vendorDeleteError: { message: "Lock timeout on vendors" } });

      const req = new NextRequest("http://localhost:3000/api/versions/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ occasionId, targetVersionNo: 1 }),
      });

      const res = await restoreVersionRoute(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.stage).toBe("vendors_clear");
    });

    it("returns HTTP 500 when vendors insert fails during restore", async () => {
      setupRestoreMock({ vendorInsertError: { message: "Unique constraint violation on vendors" } });

      const req = new NextRequest("http://localhost:3000/api/versions/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ occasionId, targetVersionNo: 1 }),
      });

      const res = await restoreVersionRoute(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.stage).toBe("vendors_insert");
    });
  });

  describe("Optimistic Status Update & Single-Item Rollback Logic", () => {
    type Status = "todo" | "doing" | "done" | "skipped";
    interface Item {
      id: string;
      title: string;
      status: Status;
    }

    async function executeStatusUpdate(
      initialItems: Item[],
      itemId: string,
      newStatus: Status,
      fetchMock: () => Promise<{ ok: boolean; status: number }>,
      concurrentMutation?: (current: Item[]) => Item[],
    ) {
      let state = [...initialItems];
      const setItems = (updater: (prev: Item[]) => Item[]) => {
        state = updater(state);
      };

      const currentItem = state.find((i) => i.id === itemId);
      const previousStatus = currentItem?.status;
      if (!previousStatus || previousStatus === newStatus) return state;

      // 1. Optimistic update
      setItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, status: newStatus } : i)),
      );

      // Simulate concurrent state modification while in flight
      if (concurrentMutation) {
        state = concurrentMutation(state);
      }

      try {
        const res = await fetchMock();
        if (!res.ok) {
          // Rollback single item
          setItems((prev) =>
            prev.map((i) => (i.id === itemId ? { ...i, status: previousStatus } : i)),
          );
        }
      } catch {
        // Rollback on network exception
        setItems((prev) =>
          prev.map((i) => (i.id === itemId ? { ...i, status: previousStatus } : i)),
        );
      }

      return state;
    }

    const items: Item[] = [
      { id: "item-1", title: "Venue", status: "todo" },
      { id: "item-2", title: "Cake", status: "todo" },
    ];

    it("keeps optimistic status on successful HTTP 200 response", async () => {
      const finalState = await executeStatusUpdate(
        items,
        "item-1",
        "done",
        async () => ({ ok: true, status: 200 }),
      );
      expect(finalState.find((i) => i.id === "item-1")?.status).toBe("done");
    });

    it("rolls back status when server returns HTTP 500 error", async () => {
      const finalState = await executeStatusUpdate(
        items,
        "item-1",
        "done",
        async () => ({ ok: false, status: 500 }),
      );
      expect(finalState.find((i) => i.id === "item-1")?.status).toBe("todo");
    });

    it("rolls back status when server returns HTTP 401 unauthenticated", async () => {
      const finalState = await executeStatusUpdate(
        items,
        "item-1",
        "done",
        async () => ({ ok: false, status: 401 }),
      );
      expect(finalState.find((i) => i.id === "item-1")?.status).toBe("todo");
    });

    it("rolls back status on network exception", async () => {
      const finalState = await executeStatusUpdate(
        items,
        "item-1",
        "done",
        async () => {
          throw new Error("Failed to fetch");
        },
      );
      expect(finalState.find((i) => i.id === "item-1")?.status).toBe("todo");
    });

    it("preserves unrelated concurrent state changes when a failed item rolls back", async () => {
      const finalState = await executeStatusUpdate(
        items,
        "item-1",
        "done",
        async () => ({ ok: false, status: 500 }),
        (current) => {
          // Another item was marked doing concurrently
          return current.map((i) => (i.id === "item-2" ? { ...i, status: "doing" } : i));
        },
      );
      // item-1 rolled back to todo
      expect(finalState.find((i) => i.id === "item-1")?.status).toBe("todo");
      // item-2 retained its concurrent update
      expect(finalState.find((i) => i.id === "item-2")?.status).toBe("doing");
    });
  });
});

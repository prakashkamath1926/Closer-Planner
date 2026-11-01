/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { POST as createPlanRoute } from "@/app/api/plan/route";

describe("POST /api/plan Error Handling and Persistence", () => {
  const userId = "u1111111-1111-4111-a111-111111111111";
  const occasionId = "o1111111-1111-4111-a111-111111111111";

  const validIdea = {
    id: "idea-1",
    title: "Candlelight Anniversary Dinner",
    description: "Intimate private dinner with acoustic violinist",
    summary: "Intimate private dinner with acoustic violinist",
    whyItSuitsThem: "Values quiet, heartfelt moments together",
    activities: ["Private dinner", "Acoustic music performance"],
    estimatedCostMin: 400,
    estimatedCostMax: 500,
    requiredTime: "3 hours",
    currency: "INR",
    urgencyMode: "weeks_away" as const,
    source: "ai" as const,
    items: [
      {
        title: "Private Chef",
        category: "catering",
        estimatedCost: 300,
        isNonNegotiable: true,
      },
      {
        title: "Violinist",
        category: "music",
        estimatedCost: 150,
      },
    ],
    facts: [
      {
        key: "favorite_cuisine",
        value: "Italian",
        status: "known" as const,
        source: "organizer" as const,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupMockSupabase(options: {
    occasionError?: any;
    itemsError?: any;
    factsError?: any;
  } = {}) {
    let insertedItems: any[] = [];
    let insertedOccasion: any = null;

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
            insert: vi.fn((row: any) => {
              insertedOccasion = row;
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: options.occasionError ? null : { id: occasionId },
                    error: options.occasionError || null,
                  }),
                }),
              };
            }),
          };
        }
        if (table === "recipient_facts") {
          return {
            insert: vi.fn().mockResolvedValue({
              error: options.factsError || null,
            }),
          };
        }
        if (table === "plan_items") {
          return {
            insert: vi.fn((rows: any) => {
              insertedItems = rows;
              return Promise.resolve({
                error: options.itemsError || null,
              });
            }),
          };
        }
        return {};
      }),
      _getInsertedItems: () => insertedItems,
      _getInsertedOccasion: () => insertedOccasion,
    };

    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockSupabase);
    return mockSupabase;
  }

  it("successfully creates occasion and persists plan items", async () => {
    const mock = setupMockSupabase();

    const req = new NextRequest("http://localhost:3000/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idea: validIdea,
        occasionType: "anniversary",
        recipientName: "Aarti",
        budgetTotal: 500,
      }),
    });

    const res = await createPlanRoute(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.occasionId).toBe(occasionId);
    expect(body.title).toBe("Candlelight Anniversary Dinner");

    expect(mock._getInsertedItems().length).toBe(2);
    expect(mock._getInsertedItems()[0].title).toBe("Private Chef");
  });

  it("returns HTTP 500 without success: true when plan items insertion fails, honestly reporting occasionId and failure stage", async () => {
    setupMockSupabase({
      itemsError: { message: "Database connection timeout during plan_items insert" },
    });

    const req = new NextRequest("http://localhost:3000/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idea: validIdea,
        occasionType: "anniversary",
      }),
    });

    const res = await createPlanRoute(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBeUndefined();
    expect(body.stage).toBe("items_insert");
    expect(body.occasionId).toBe(occasionId);
    expect(body.error).toContain("failed to save plan items");
    expect(body.details).toContain("timeout");
  });

  it("returns HTTP 500 when occasion creation fails", async () => {
    setupMockSupabase({
      occasionError: { message: "Foreign key violation on owner_id" },
    });

    const req = new NextRequest("http://localhost:3000/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idea: validIdea,
      }),
    });

    const res = await createPlanRoute(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBeUndefined();
    expect(body.error).toBe("Failed to create occasion");
  });
});

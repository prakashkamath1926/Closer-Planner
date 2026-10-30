import { describe, it, expect } from "vitest";
import { computeNextStep } from "@/lib/engine/next-step";

describe("computeNextStep engine module", () => {
  it("prioritizes budget overage first", () => {
    const step = computeNextStep({
      occasion: { is_surprise: false, event_at: "2026-11-01T18:00:00Z" },
      items: [{ id: "1", status: "todo", category: "venue", depends_on: [], is_fallback: false }],
      blockedCount: 2,
      budgetSummary: { isOverBudget: true },
    });
    expect(step.label).toBe("Review budget overage");
    expect(step.tab).toBe("plan");
  });

  it("prioritizes blocked tasks when prerequisites are unfulfilled", () => {
    const step = computeNextStep({
      occasion: { is_surprise: false, event_at: "2026-11-01T18:00:00Z" },
      items: [{ id: "1", status: "todo", category: "venue", depends_on: ["2"], is_fallback: false }],
      blockedCount: 2,
      budgetSummary: { isOverBudget: false },
    });
    expect(step.label).toBe("Review 2 blocked tasks");
    expect(step.tab).toBe("timeline");
  });

  it("prioritizes publishing surprise when surprise shield is unpublished", () => {
    const step = computeNextStep({
      occasion: { is_surprise: true, event_at: "2026-11-01T18:00:00Z" },
      items: [{ id: "1", status: "todo", category: "venue", depends_on: [], is_fallback: false }],
      blockedCount: 0,
      isPublished: false,
    });
    expect(step.label).toBe("Publish the surprise");
    expect(step.tab).toBe("surprise");
  });

  it("suggests adding first vendor when vendor count is zero and vendor tasks exist", () => {
    const step = computeNextStep({
      occasion: { is_surprise: false, event_at: "2026-11-01T18:00:00Z" },
      items: [{ id: "1", status: "todo", category: "catering", depends_on: [], is_fallback: false }],
      blockedCount: 0,
      vendorsCount: 0,
    });
    expect(step.label).toBe("Add your first vendor");
    expect(step.tab).toBe("vendors");
  });

  it("suggests reviewing celebration tasks when items are in todo", () => {
    const step = computeNextStep({
      occasion: { is_surprise: false, event_at: "2026-11-01T18:00:00Z" },
      items: [{ id: "1", status: "todo", category: "activity", depends_on: [], is_fallback: false }],
      blockedCount: 0,
      vendorsCount: 2,
    });
    expect(step.label).toBe("Review celebration tasks");
    expect(step.tab).toBe("plan");
  });

  it("suggests calendar export when all tasks are complete or ready", () => {
    const step = computeNextStep({
      occasion: { is_surprise: false, event_at: "2026-11-01T18:00:00Z" },
      items: [{ id: "1", status: "done", category: "activity", depends_on: [], is_fallback: false }],
      blockedCount: 0,
      vendorsCount: 1,
    });
    expect(step.label).toBe("Export calendar (.ics)");
    expect(step.tab).toBe("timeline");
  });
});


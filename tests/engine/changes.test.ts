import { describe, it, expect } from "vitest";
import {
  findTransitivelyDependentItemIds,
  computePlanDiff,
  analyzeChangeImpact,
  PlanItem,
  OccasionConstraints,
} from "../../src/lib/engine/changes";

describe("engine/changes: deterministic change impact & diffing", () => {
  it("finds all transitively dependent item IDs", () => {
    // 1 -> 2 -> 3 -> 4
    // 1 -> 5
    // 6 (unrelated)
    const items: PlanItem[] = [
      { id: "1", title: "Task 1", status: "todo", depends_on: [] },
      { id: "2", title: "Task 2", status: "todo", depends_on: ["1"] },
      { id: "3", title: "Task 3", status: "todo", depends_on: ["2"] },
      { id: "4", title: "Task 4", status: "todo", depends_on: ["3"] },
      { id: "5", title: "Task 5", status: "todo", depends_on: ["1"] },
      { id: "6", title: "Task 6", status: "todo", depends_on: [] },
    ];

    // If Task 1 changes, Tasks 2, 3, 4, 5 are all transitively affected
    const affected = findTransitivelyDependentItemIds(["1"], items);

    expect(affected.sort()).toEqual(["2", "3", "4", "5"]);
    expect(affected).not.toContain("6");
    expect(affected).not.toContain("1");
  });

  it("computes accurate plan diffs (added, removed, modified, unaffected)", () => {
    const original: PlanItem[] = [
      { id: "1", title: "Venue", estimated_cost: "100000.00", status: "todo", depends_on: [] },
      { id: "2", title: "Catering", estimated_cost: "50000.00", status: "todo", depends_on: [] },
      { id: "3", title: "Decor", estimated_cost: "20000.00", status: "todo", depends_on: [] },
    ];

    const updated: PlanItem[] = [
      // 1 modified
      { id: "1", title: "Venue", estimated_cost: "120000.00", status: "doing", depends_on: [] },
      // 2 unaffected
      { id: "2", title: "Catering", estimated_cost: "50000.00", status: "todo", depends_on: [] },
      // 3 removed
      // 4 added
      { id: "4", title: "Live Band", estimated_cost: "30000.00", status: "todo", depends_on: [] },
    ];

    const diff = computePlanDiff(original, updated);

    expect(diff.added.map((i) => i.id)).toEqual(["4"]);
    expect(diff.removed.map((i) => i.id)).toEqual(["3"]);
    expect(diff.unaffected.map((i) => i.id)).toEqual(["2"]);
    expect(diff.modified.length).toBe(1);
    expect(diff.modified[0].item.id).toBe("1");
    expect(diff.modified[0].changes).toEqual([
      { field: "status", oldValue: "todo", newValue: "doing" },
      { field: "estimated_cost", oldValue: "100000.00", newValue: "120000.00" },
    ]);
  });

  it("moving the date earlier marks dependent tasks and flags infeasible deadlines", () => {
    const earlierEventDate = "2026-11-05T18:00:00Z";

    const occasion: OccasionConstraints = {
      id: "occ-1",
      title: "Silver Jubilee",
      event_at: earlierEventDate, // Date moved earlier!
      budget_total: "500000.00",
      currency: "INR",
    };

    const originalItems: PlanItem[] = [
      { id: "1", title: "Book Hall", status: "todo", due_at: "2026-11-01T12:00:00Z", depends_on: [] },
      { id: "2", title: "Catering", status: "todo", due_at: "2026-11-10T12:00:00Z", depends_on: ["1"] },
    ];

    // Due date of Catering (Nov 10) is now after the earlier celebration date (Nov 5)
    const impact = analyzeChangeImpact(occasion, originalItems, originalItems);

    expect(impact.infeasibleFlags.length).toBeGreaterThan(0);
    const deadlineFlag = impact.infeasibleFlags.find((f) => f.itemId === "2");
    expect(deadlineFlag).toBeDefined();
    expect(deadlineFlag?.reason).toBe("due_after_event");
    expect(impact.summary).toContain("deadline conflict");
  });
});


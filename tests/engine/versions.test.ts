import { describe, it, expect } from "vitest";
import {
  createSnapshot,
  prepareRestore,
  isValidSnapshot,
  PlanSnapshotData,
} from "../../src/lib/engine/versions";

describe("engine/versions: snapshotting & deterministic version restore", () => {
  const occasionV1 = { id: "occ-1", title: "Mom's 60th Birthday", budget_total: "500000.00" };
  const itemsV1 = [
    { id: "item-1", occasion_id: "occ-1", title: "Garden Venue", estimated_cost: "200000.00", status: "todo" },
    { id: "item-2", occasion_id: "occ-1", title: "Classical Trio", estimated_cost: "50000.00", status: "todo" },
  ];
  const vendorsV1 = [
    { id: "v-1", occasion_id: "occ-1", name: "Green Gardens", category: "venue", status: "confirmed" },
  ];

  it("creates a deep-cloned valid snapshot", () => {
    const snapshot = createSnapshot(occasionV1, itemsV1, vendorsV1);

    expect(isValidSnapshot(snapshot)).toBe(true);
    expect(snapshot.occasion.title).toBe("Mom's 60th Birthday");
    expect(snapshot.plan_items.length).toBe(2);
    expect(snapshot.vendors.length).toBe(1);

    // Deep clone check: modifying original does not mutate snapshot
    itemsV1[0].title = "MUTATED";
    expect(snapshot.plan_items[0].title).toBe("Garden Venue");
  });

  it("restoring a version reproduces the exact snapshot and keeps the replaced state as a new version", () => {
    // History:
    // v1: Garden Venue + Classical Trio
    const snapshotV1 = createSnapshot(
      { id: "occ-1", title: "Mom's 60th Birthday", budget_total: "500000.00" },
      [
        { id: "item-1", occasion_id: "occ-1", title: "Garden Venue", estimated_cost: "200000.00" },
        { id: "item-2", occasion_id: "occ-1", title: "Classical Trio", estimated_cost: "50000.00" },
      ],
      [{ id: "v-1", occasion_id: "occ-1", name: "Green Gardens" }],
      "2026-10-01T10:00:00.000Z",
    );

    // Current State (v2): Hall Venue + Rock Band (user changed plan)
    const currentState = {
      occasion: { id: "occ-1", title: "Mom's 60th Birthday - Revised", budget_total: "600000.00" },
      plan_items: [
        { id: "item-3", occasion_id: "occ-1", title: "Grand Hall", estimated_cost: "350000.00" },
        { id: "item-4", occasion_id: "occ-1", title: "Rock Band", estimated_cost: "100000.00" },
      ],
      vendors: [{ id: "v-2", occasion_id: "occ-1", name: "Grand Hall Inc" }],
    };

    // User requests to restore v1 when current latest version is 2
    const currentLatestVersionNo = 2;
    const restoreResult = prepareRestore(currentState, snapshotV1, currentLatestVersionNo, 1);

    // 1. New version number is incremented (v3)
    expect(restoreResult.newVersionNo).toBe(3);

    // 2. The replaced state (v2) is kept as a new snapshot version
    expect(restoreResult.replacedStateSnapshot.occasion.title).toBe("Mom's 60th Birthday - Revised");
    expect(restoreResult.replacedStateSnapshot.plan_items.map((i) => i.title)).toEqual([
      "Grand Hall",
      "Rock Band",
    ]);

    // 3. The state to restore EXACTLY matches snapshotV1
    expect(restoreResult.stateToRestore.occasion.title).toBe(snapshotV1.occasion.title);
    expect(restoreResult.stateToRestore.occasion.budget_total).toBe(snapshotV1.occasion.budget_total);
    expect(restoreResult.stateToRestore.plan_items).toEqual(snapshotV1.plan_items);
    expect(restoreResult.stateToRestore.vendors).toEqual(snapshotV1.vendors);

    // 4. Clear change summary
    expect(restoreResult.changeSummary).toContain("Restored plan from v1");
    expect(restoreResult.changeSummary).toContain("2 items");
  });

  it("rejects invalid snapshot structures during restore", () => {
    const currentState = {
      occasion: { id: "occ-1", title: "Test" },
      plan_items: [],
      vendors: [],
    };

    expect(() => {
      prepareRestore(currentState, null as unknown as PlanSnapshotData, 1);
    }).toThrow("Invalid target snapshot structure");

    expect(() => {
      prepareRestore(currentState, { invalid: true } as unknown as PlanSnapshotData, 1);
    }).toThrow("Invalid target snapshot structure");
  });
});


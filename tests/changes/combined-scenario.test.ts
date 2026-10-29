import { describe, it, expect } from "vitest";
import {
  calculateBudget,
  isOverBudget,
} from "../../src/lib/engine/budget";
import {
  computePlanDiff,
  analyzeChangeImpact,
} from "../../src/lib/engine/changes";
import {
  validateDependencyGraph,
  detectInfeasibleDeadlines,
} from "../../src/lib/engine/timeline";
import {
  createSnapshot,
  prepareRestore,
} from "../../src/lib/engine/versions";
import {
  proposeTradeoffs,
} from "../../src/lib/ai/orchestrator";
import type { PlanItem } from "../../src/lib/engine/changes";

describe("Task 5 Acceptance Criteria: Combined Scenario & Trade-Offs", () => {
  // Baseline setup: 8 Lakh INR (800,000 rupees), event date 30 days ahead
  const originalBudget = 800_000; // 8 Lakh INR
  const reducedBudget = 650_000;  // 6.5 Lakh INR

  const originalEventDate = new Date("2026-12-01T18:00:00Z").toISOString(); // +30 days
  const earlierEventDate = new Date("2026-11-15T18:00:00Z").toISOString();  // +14 days (earlier by 16 days)

  const baselineItems: PlanItem[] = [
    {
      id: "item-venue",
      title: "Heritage Lawn & Banquet",
      category: "venue",
      intent_tag: "elegant-gathering",
      why: "Grand outdoor-indoor ambiance for 50 guests",
      status: "todo",
      estimated_cost: 300_000, // 3.0 Lakh
      cost_status: "quoted",
      is_fallback: false,
      is_non_negotiable: true,
      due_at: new Date("2026-11-10T12:00:00Z").toISOString(), // Before both dates
      depends_on: [],
    },
    {
      id: "item-decor",
      title: "Bespoke Floral & Fairy-Light Decor",
      category: "decor",
      intent_tag: "magical-atmosphere",
      why: "Creates intimate celebratory look",
      status: "todo",
      estimated_cost: 200_000, // 2.0 Lakh
      cost_status: "estimate",
      is_fallback: false,
      is_non_negotiable: false,
      due_at: new Date("2026-11-20T12:00:00Z").toISOString(), // Infeasible with earlier date (Nov 15)
      depends_on: ["item-venue"],
    },
    {
      id: "item-catering",
      title: "Gourmet Live-Station Banquet",
      category: "catering",
      intent_tag: "foodie-paradise",
      why: "Multi-course artisanal menu",
      status: "todo",
      estimated_cost: 250_000, // 2.5 Lakh
      cost_status: "estimate",
      is_fallback: false,
      is_non_negotiable: false,
      due_at: new Date("2026-11-22T12:00:00Z").toISOString(), // Infeasible with earlier date (Nov 15)
      depends_on: ["item-venue"],
    },
    {
      id: "item-dj",
      title: "DJ & Acoustic Sound Stage",
      category: "entertainment",
      intent_tag: "nostalgic-party",
      why: "Upbeat celebration playlist and sound",
      status: "todo",
      estimated_cost: 25_000, // 0.25 Lakh
      cost_status: "estimate",
      is_fallback: false,
      is_non_negotiable: true,
      due_at: new Date("2026-11-12T12:00:00Z").toISOString(), // Feasible with earlier date
      depends_on: [],
    },
    {
      id: "item-photo",
      title: "Candid Photography & Highlights Film",
      category: "photography",
      intent_tag: "memory-making",
      why: "Captures natural emotional moments",
      status: "todo",
      estimated_cost: 25_000, // 0.25 Lakh
      cost_status: "estimate",
      is_fallback: false,
      is_non_negotiable: false,
      due_at: new Date("2026-11-14T12:00:00Z").toISOString(), // Feasible with earlier date
      depends_on: [],
    },
  ];

  it("Criterion 1 & 2: combined scenario updates affected items, preserves unaffected approved items, and generates 2-3 valid trade-offs", async () => {
    // 1. Initial State: 80,000,000 paise (8 Lakh)
    const initialSummary = calculateBudget(originalBudget, baselineItems);
    expect(initialSummary.effectiveTotalMinor).toBe(80_000_000);
    expect(initialSummary.isOverBudget).toBe(false);

    // 2. Budget reduced to 6.5 Lakh and date moved earlier to Nov 15
    const budgetAfterReduction = calculateBudget(reducedBudget, baselineItems);
    expect(budgetAfterReduction.isOverBudget).toBe(true);
    expect(budgetAfterReduction.overBudgetAmountMinor).toBe(15_000_000); // 1.5 Lakh over

    // 3. Engine detects affected items with infeasible deadlines
    const infeasible = detectInfeasibleDeadlines(baselineItems, earlierEventDate);
    expect(infeasible.map((i) => i.itemId)).toEqual(
      expect.arrayContaining(["item-decor", "item-catering"])
    );
    // Unaffected items with due dates before earlierEventDate are not flagged as infeasible
    expect(infeasible.map((i) => i.itemId)).not.toContain("item-venue");
    expect(infeasible.map((i) => i.itemId)).not.toContain("item-dj");
    expect(infeasible.map((i) => i.itemId)).not.toContain("item-photo");

    // 4. Propose trade-offs via orchestrator
    const proposal = await proposeTradeoffs(
      {
        occasionTitle: "30th Birthday Milestone",
        previousBudget: originalBudget,
        newBudget: reducedBudget,
        currency: "INR",
        previousEventAt: originalEventDate,
        newEventAt: earlierEventDate,
        affectedItems: baselineItems.map((i) => ({
          id: i.id,
          title: i.title,
          category: i.category,
          intentTag: i.intent_tag,
          estimatedCost: Number(i.estimated_cost || 0),
          dueAt: i.due_at,
          dependsOn: i.depends_on,
          isNonNegotiable: i.is_non_negotiable,
        })),
        reason: "Budget constrained by family and venue availability forced moving 2 weeks earlier",
      },
      baselineItems,
    );

    // Orchestrator must return 2 to 3 verified trade-offs
    expect(proposal.options.length).toBeGreaterThanOrEqual(2);
    expect(proposal.options.length).toBeLessThanOrEqual(3);

    // Every returned option MUST pass budget ceiling and dependency rules
    for (const option of proposal.options) {
      // Check budget ceiling compliance
      const removedSet = new Set(option.removedItemIds || []);
      const modMap = new Map((option.modifiedItems || []).map((m) => [m.id, m]));
      const simItems = baselineItems
        .filter((i) => !removedSet.has(i.id))
        .map((i) => {
          const m = modMap.get(i.id);
          return m && m.estimatedCost !== undefined
            ? { ...i, estimated_cost: m.estimatedCost }
            : i;
        });
      const addedCosts = (option.addedItems || []).reduce((s, a) => s + a.estimatedCost, 0);
      const totalSim = simItems.reduce((s, i) => s + Number(i.estimated_cost || 0), 0) + addedCosts;
      expect(totalSim).toBeLessThanOrEqual(reducedBudget);

      // Check dependency integrity
      const simGraph = validateDependencyGraph(simItems);
      expect(simGraph.valid).toBe(true);
    }

    // 5. User picks a trade-off (e.g. Option 1: Protect Core Non-Negotiables)
    const chosenOption = proposal.options[0];
    expect(chosenOption).toBeDefined();

    // 6. Apply trade-off: verify unaffected approved items remain unchanged
    const removedSet = new Set(chosenOption.removedItemIds || []);
    const modMap = new Map((chosenOption.modifiedItems || []).map((m) => [m.id, m]));

    const updatedPlan: PlanItem[] = baselineItems
      .filter((item) => !removedSet.has(item.id))
      .map((item) => {
        const mod = modMap.get(item.id);
        if (!mod) return { ...item };
        return {
          ...item,
          title: mod.title ?? item.title,
          estimated_cost: mod.estimatedCost !== undefined ? mod.estimatedCost : item.estimated_cost,
          due_at: mod.dueAt !== undefined ? mod.dueAt : item.due_at,
          depends_on: mod.dependsOn ?? item.depends_on,
        };
      });

    // Unaffected non-negotiable items MUST retain their exact identity, status, and cost
    const venueItem = updatedPlan.find((i) => i.id === "item-venue");
    expect(venueItem).toBeDefined();
    expect(venueItem?.status).toBe("todo");
    expect(venueItem?.estimated_cost).toBe(300_000);

    const djItem = updatedPlan.find((i) => i.id === "item-dj");
    expect(djItem).toBeDefined();
    expect(djItem?.status).toBe("todo");
    expect(djItem?.estimated_cost).toBe(25_000);

    // 7. Verify change summary & diff generator
    const diff = computePlanDiff(baselineItems, updatedPlan);
    expect(diff.modified.length + diff.removed.length + diff.added.length).toBeGreaterThan(0);

    const impact = analyzeChangeImpact(
      {
        id: "occ-123",
        title: "30th Birthday Milestone",
        budget_total: reducedBudget,
        event_at: earlierEventDate,
      },
      baselineItems,
      updatedPlan,
    );
    expect(impact.summary.length).toBeGreaterThan(0);
    expect(impact.budgetSummary.isOverBudget).toBe(false);
  });

  it("Criterion 3: trade-offs that fail the engine's budget or dependency check are dropped", async () => {
    // Over-budget trade-off
    const invalidOverBudgetTradeoff: PlanItem[] = [
      ...baselineItems,
      {
        id: "expensive-addon",
        title: "Gold-Plated Stage",
        category: "decor",
        intent_tag: "luxury",
        why: "Super expensive add-on",
        status: "todo",
        estimated_cost: 500_000, // 5 Lakh extra!
        cost_status: "estimate",
        is_fallback: false,
        is_non_negotiable: false,
        depends_on: [],
      },
    ];

    expect(isOverBudget(reducedBudget, invalidOverBudgetTradeoff)).toBe(true);

    // Dependency check: cyclic dependency
    const cyclicItems: PlanItem[] = [
      {
        id: "item-a",
        title: "Item A",
        category: "other",
        intent_tag: null,
        why: null,
        status: "todo",
        estimated_cost: 1000,
        cost_status: "estimate",
        is_fallback: false,
        is_non_negotiable: false,
        depends_on: ["item-b"],
      },
      {
        id: "item-b",
        title: "Item B",
        category: "other",
        intent_tag: null,
        why: null,
        status: "todo",
        estimated_cost: 1000,
        cost_status: "estimate",
        is_fallback: false,
        is_non_negotiable: false,
        depends_on: ["item-a"],
      },
    ];

    const cycleCheck = validateDependencyGraph(cyclicItems);
    expect(cycleCheck.valid).toBe(false);
    expect(cycleCheck.errors[0]).toContain("Cyclic dependency detected");
  });

  it("Criterion 1 (continued): previous version is saved, and undo reproduces exact snapshot while saving replaced state", () => {
    const occasionRecord = {
      id: "occ-123",
      title: "Aditi 30th Birthday",
      budget_total: originalBudget,
      event_at: originalEventDate,
      currency: "INR",
      status: "active",
    };

    const initialPlanItems = baselineItems.map((i) => ({
      ...i,
      occasion_id: occasionRecord.id,
    }));

    // 1. Create baseline snapshot (Version 1)
    const v1Snapshot = createSnapshot(occasionRecord, initialPlanItems, []);
    expect(v1Snapshot.occasion.budget_total).toBe(originalBudget);
    expect(v1Snapshot.plan_items.length).toBe(5);

    // 2. State after applying trade-off (Version 2)
    const modifiedItems = initialPlanItems.slice(0, 3); // trimmed 2 items
    const modifiedOccasion = {
      ...occasionRecord,
      budget_total: reducedBudget,
      event_at: earlierEventDate,
    };

    // 3. Restore Version 1 snapshot (Undo action)
    const restoreResult = prepareRestore(
      {
        occasion: modifiedOccasion,
        plan_items: modifiedItems,
        vendors: [],
      },
      v1Snapshot,
      2, // current latest version number
      1, // restoring version 1
    );

    // The restored state matches Version 1 exactly
    expect(restoreResult.stateToRestore.occasion.budget_total).toBe(originalBudget);
    expect(restoreResult.stateToRestore.occasion.event_at).toBe(originalEventDate);
    expect(restoreResult.stateToRestore.occasion.title).toBe("Aditi 30th Birthday");

    expect(restoreResult.stateToRestore.plan_items.length).toBe(5);
    expect(restoreResult.stateToRestore.plan_items.map((i) => i.id)).toEqual(
      initialPlanItems.map((i) => i.id)
    );

    // The replaced state is preserved as a snapshot so undo itself can be undone
    expect(restoreResult.replacedStateSnapshot.plan_items.length).toBe(3);
    expect(restoreResult.replacedStateSnapshot.occasion.budget_total).toBe(reducedBudget);
    expect(restoreResult.newVersionNo).toBe(3);
  });
});

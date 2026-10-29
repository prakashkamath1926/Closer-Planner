/**
 * Deterministic Change Handling Engine.
 *
 * Rules:
 * - Deterministic detection of affected items (direct and transitive via `depends_on`).
 * - Computation of plan diffs (added, removed, modified, unaffected).
 * - Human-readable change summary generation.
 * - Used before and after proposed AI trade-offs to ensure no silent changes occur.
 */

import { BudgetItemInput, calculateBudget } from "./budget";
import { TimelineItem, detectInfeasibleDeadlines } from "./timeline";

export interface PlanItem extends BudgetItemInput, TimelineItem {
  category?: string;
  intent_tag?: string | null;
  why?: string | null;
  plan_b?: string | null;
  fallback_for?: string | null;
  is_non_negotiable?: boolean;
}

export interface OccasionConstraints {
  id: string;
  title: string;
  event_at?: string | null;
  budget_total?: string | number | null;
  guest_count?: number | null;
  currency?: string;
}

export interface PlanDiff {
  added: PlanItem[];
  removed: PlanItem[];
  modified: Array<{
    item: PlanItem;
    changes: Array<{
      field: string;
      oldValue: unknown;
      newValue: unknown;
    }>;
  }>;
  unaffected: PlanItem[];
}

export interface ChangeImpactResult {
  /** IDs of items directly or transitively affected */
  affectedItemIds: string[];
  /** Items with new deadline or infeasibility issues */
  infeasibleFlags: ReturnType<typeof detectInfeasibleDeadlines>;
  /** Recalculated budget status */
  budgetSummary: ReturnType<typeof calculateBudget>;
  /** Plan diff */
  diff: PlanDiff;
  /** Human-readable summary of the change and impact */
  summary: string;
}

/**
 * Finds all items that directly or indirectly depend on any of the target item IDs.
 * Transitive search using BFS/DFS.
 */
export function findTransitivelyDependentItemIds(
  targetItemIds: string[],
  allItems: PlanItem[],
): string[] {
  const targetSet = new Set(targetItemIds);
  const affected = new Set<string>();

  // Build adjacency list: prerequisiteId -> itemIds that depend on it
  const dependentGraph = new Map<string, string[]>();
  for (const item of allItems) {
    for (const depId of item.depends_on || []) {
      const list = dependentGraph.get(depId) || [];
      list.push(item.id);
      dependentGraph.set(depId, list);
    }
  }

  // BFS from targets
  const queue = [...targetItemIds];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const dependents = dependentGraph.get(currentId) || [];
    for (const depId of dependents) {
      if (!targetSet.has(depId) && !affected.has(depId)) {
        affected.add(depId);
        queue.push(depId);
      }
    }
  }

  return Array.from(affected);
}

/**
 * Computes the exact diff between two plan item states.
 */
export function computePlanDiff(
  originalItems: PlanItem[],
  newItems: PlanItem[],
): PlanDiff {
  const originalMap = new Map(originalItems.map((i) => [i.id, i]));
  const newMap = new Map(newItems.map((i) => [i.id, i]));

  const added: PlanItem[] = [];
  const removed: PlanItem[] = [];
  const modified: PlanDiff["modified"] = [];
  const unaffected: PlanItem[] = [];

  for (const newItem of newItems) {
    const orig = originalMap.get(newItem.id);
    if (!orig) {
      added.push(newItem);
    } else {
      const fieldChanges: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];
      const fieldsToCheck: Array<keyof PlanItem> = [
        "title",
        "status",
        "due_at",
        "estimated_cost",
        "confirmed_cost",
        "cost_status",
        "is_fallback",
        "fallback_for",
        "intent_tag",
      ];

      for (const field of fieldsToCheck) {
        if (orig[field] !== newItem[field]) {
          fieldChanges.push({
            field,
            oldValue: orig[field],
            newValue: newItem[field],
          });
        }
      }

      // Check depends_on array
      const origDeps = (orig.depends_on || []).slice().sort();
      const newDeps = (newItem.depends_on || []).slice().sort();
      if (JSON.stringify(origDeps) !== JSON.stringify(newDeps)) {
        fieldChanges.push({
          field: "depends_on",
          oldValue: orig.depends_on,
          newValue: newItem.depends_on,
        });
      }

      if (fieldChanges.length > 0) {
        modified.push({ item: newItem, changes: fieldChanges });
      } else {
        unaffected.push(newItem);
      }
    }
  }

  for (const orig of originalItems) {
    if (!newMap.has(orig.id)) {
      removed.push(orig);
    }
  }

  return { added, removed, modified, unaffected };
}

/**
 * Analyzes the impact of a constraint or plan change.
 *
 * @param occasion The target occasion
 * @param originalItems The current baseline items
 * @param updatedItems The proposed or updated items
 */
export function analyzeChangeImpact(
  occasion: OccasionConstraints,
  originalItems: PlanItem[],
  updatedItems: PlanItem[],
): ChangeImpactResult {
  const diff = computePlanDiff(originalItems, updatedItems);

  // Directly changed item IDs
  const directChangedIds = [
    ...diff.added.map((i) => i.id),
    ...diff.removed.map((i) => i.id),
    ...diff.modified.map((m) => m.item.id),
  ];

  // Transitive dependents
  const transitiveIds = findTransitivelyDependentItemIds(directChangedIds, updatedItems);
  const affectedSet = new Set([...directChangedIds, ...transitiveIds]);

  // Recalculate timeline & budget
  const infeasibleFlags = detectInfeasibleDeadlines(updatedItems, occasion.event_at);
  const budgetSummary = calculateBudget(
    occasion.budget_total,
    updatedItems,
    occasion.currency || "INR",
  );

  // Build human-readable summary
  const summaryParts: string[] = [];

  if (diff.added.length > 0) {
    summaryParts.push(`Added ${diff.added.length} item(s): ${diff.added.map((i) => i.title).join(", ")}.`);
  }
  if (diff.removed.length > 0) {
    summaryParts.push(`Removed ${diff.removed.length} item(s): ${diff.removed.map((i) => i.title).join(", ")}.`);
  }
  if (diff.modified.length > 0) {
    summaryParts.push(`Updated ${diff.modified.length} item(s): ${diff.modified.map((m) => m.item.title).join(", ")}.`);
  }
  if (transitiveIds.length > 0) {
    summaryParts.push(`${transitiveIds.length} dependent task(s) affected by dependency order.`);
  }
  if (infeasibleFlags.length > 0) {
    summaryParts.push(`Flagged ${infeasibleFlags.length} deadline conflict(s).`);
  }
  if (budgetSummary.isOverBudget) {
    summaryParts.push(`Plan is over budget by ${budgetSummary.overBudgetAmountFormatted}.`);
  } else {
    summaryParts.push(`Budget remains on track with ${budgetSummary.remainingBudgetFormatted} available.`);
  }

  const summary = summaryParts.join(" ") || "No changes detected.";

  return {
    affectedItemIds: Array.from(affectedSet),
    infeasibleFlags,
    budgetSummary,
    diff,
    summary,
  };
}


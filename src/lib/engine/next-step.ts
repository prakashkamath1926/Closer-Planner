/**
 * Deterministic Next Step Engine
 * Computes the primary actionable next step for an organizer from the current celebration state.
 * Owned entirely by engine code, NOT by AI.
 */

import { PlanItemRecord, OccasionRecord } from "@/components/plan/plan-view";
import { BudgetSummary } from "./budget";

export type PlannerTab = "plan" | "vendors" | "timeline" | "surprise" | "blend" | "invitation";

export interface NextStepState {
  occasion: Pick<OccasionRecord, "is_surprise" | "event_at">;
  items: Array<Pick<PlanItemRecord, "id" | "status" | "category" | "depends_on" | "is_fallback">>;
  blockedCount: number;
  vendorsCount?: number;
  isPublished?: boolean;
  budgetSummary?: Pick<BudgetSummary, "isOverBudget">;
}

export interface NextStepAction {
  label: string;
  tab: PlannerTab;
  reason?: string;
}

export function computeNextStep(state: NextStepState): NextStepAction {
  const {
    occasion,
    items,
    blockedCount,
    vendorsCount = 0,
    isPublished = false,
    budgetSummary,
  } = state;

  // 1. Critical budget overage check
  if (budgetSummary?.isOverBudget) {
    return {
      label: "Review budget overage",
      tab: "plan",
      reason: "Current allocated costs exceed your target celebration budget.",
    };
  }

  // 2. Blocked tasks that have unresolved prerequisites
  if (blockedCount > 0) {
    return {
      label: `Review ${blockedCount} blocked task${blockedCount > 1 ? "s" : ""}`,
      tab: "timeline",
      reason: "Complete prerequisite items to unblock the celebration schedule.",
    };
  }

  // 3. Unpublished Surprise Shield for surprise celebrations
  if (occasion.is_surprise && !isPublished) {
    return {
      label: "Publish the surprise",
      tab: "surprise",
      reason: "Configure and lock your secret reveal settings before sharing.",
    };
  }

  // 4. No vendors added yet when vendor-relevant categories exist
  const vendorCategories = new Set(["venue", "catering", "cake", "entertainment", "photography", "decor", "vendor"]);
  const hasVendorTasks = items.some((i) => vendorCategories.has(i.category?.toLowerCase()));
  if (vendorsCount === 0 && (hasVendorTasks || items.length > 0)) {
    return {
      label: "Add your first vendor",
      tab: "vendors",
      reason: "Track quotes and compare vendor options.",
    };
  }

  // 5. Active to-do tasks remaining
  const activeTodo = items.filter((i) => !i.is_fallback && i.status === "todo");
  if (activeTodo.length > 0) {
    return {
      label: "Review celebration tasks",
      tab: "plan",
      reason: `${activeTodo.length} item${activeTodo.length > 1 ? "s" : ""} awaiting action.`,
    };
  }

  // 6. Default completed / ready state
  return {
    label: "Export calendar (.ics)",
    tab: "timeline",
    reason: "Sync schedule with your calendar.",
  };
}


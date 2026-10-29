/**
 * Deterministic Budget Calculations.
 *
 * Rules:
 * - Pure deterministic math; no LLM inputs.
 * - Arithmetic runs strictly in integer minor units via `money.ts`.
 * - Fallback items (Plan B) are alternatives, not counted in active totals
 *   until swapped in by user action.
 * - Confirmed costs take precedence over estimated costs when confirmed.
 * - Explicit over-budget flag if total exceeds the occasion budget.
 *   ("8 lakh in never yields a plan whose total exceeds 8 lakh without an explicit over-budget flag.")
 */

import {
  addMoney,
  subtractMoney,
  toMinorUnits,
  formatMoney,
} from "./money";

export interface BudgetItemInput {
  id: string;
  title: string;
  estimated_cost?: number | string | null;
  confirmed_cost?: number | string | null;
  cost_status?: "estimate" | "quoted" | "confirmed";
  is_fallback?: boolean;
}

export interface BudgetSummary {
  /** Target budget allocated in minor units */
  budgetTotalMinor: number;
  /** Formatted target budget string (e.g. "₹8,00,000") */
  budgetTotalFormatted: string;

  /** Total of active effective costs in minor units */
  effectiveTotalMinor: number;
  /** Formatted effective total string */
  effectiveTotalFormatted: string;

  /** Remaining budget in minor units (can be negative if over budget) */
  remainingBudgetMinor: number;
  /** Formatted remaining budget string */
  remainingBudgetFormatted: string;

  /** Total estimated cost across all active items */
  totalEstimatedMinor: number;
  /** Total confirmed cost across all active items */
  totalConfirmedMinor: number;

  /** True if effective total exceeds allocated budget */
  isOverBudget: boolean;
  /** Amount exceeded in minor units (0 if within budget) */
  overBudgetAmountMinor: number;
  /** Formatted over-budget amount (e.g. "₹50,000" or null) */
  overBudgetAmountFormatted: string | null;

  /** Count of active items with unestimated or zero cost */
  unestimatedItemCount: number;
  /** Currency code */
  currency: string;
}

/**
 * Returns the effective cost for a single item in integer minor units.
 * Confirmed cost is used if status is 'confirmed' and confirmed_cost is non-null.
 * Otherwise, estimated_cost is used.
 */
export function getEffectiveItemCost(item: BudgetItemInput): number {
  if (item.cost_status === "confirmed" && item.confirmed_cost !== null && item.confirmed_cost !== undefined) {
    return toMinorUnits(item.confirmed_cost);
  }
  return toMinorUnits(item.estimated_cost);
}

/**
 * Calculates the complete deterministic budget summary for an occasion.
 *
 * @param budgetTotal Total budget allocated (in major units, string, or minor units)
 * @param items List of plan items
 * @param currency ISO currency code (defaults to 'INR')
 */
export function calculateBudget(
  budgetTotal: number | string | null | undefined,
  items: BudgetItemInput[],
  currency: string = "INR",
): BudgetSummary {
  const budgetTotalMinor = toMinorUnits(budgetTotal);

  let totalEstimatedMinor = 0;
  let totalConfirmedMinor = 0;
  let effectiveTotalMinor = 0;
  let unestimatedItemCount = 0;

  for (const item of items) {
    // Fallback items (Plan B) are not active line items; they do not count towards the active budget
    if (item.is_fallback) {
      continue;
    }

    const estimatedMinor = toMinorUnits(item.estimated_cost);
    const confirmedMinor = toMinorUnits(item.confirmed_cost);
    const effectiveMinor = getEffectiveItemCost(item);

    totalEstimatedMinor = addMoney(totalEstimatedMinor, estimatedMinor);
    if (item.cost_status === "confirmed") {
      totalConfirmedMinor = addMoney(totalConfirmedMinor, confirmedMinor);
    }
    effectiveTotalMinor = addMoney(effectiveTotalMinor, effectiveMinor);

    if (effectiveMinor === 0) {
      unestimatedItemCount += 1;
    }
  }

  const remainingBudgetMinor = subtractMoney(budgetTotalMinor, effectiveTotalMinor);
  const isOverBudget = budgetTotalMinor > 0 && effectiveTotalMinor > budgetTotalMinor;
  const overBudgetAmountMinor = isOverBudget ? subtractMoney(effectiveTotalMinor, budgetTotalMinor) : 0;

  return {
    budgetTotalMinor,
    budgetTotalFormatted: formatMoney(budgetTotalMinor, currency),

    effectiveTotalMinor,
    effectiveTotalFormatted: formatMoney(effectiveTotalMinor, currency),

    remainingBudgetMinor,
    remainingBudgetFormatted: formatMoney(remainingBudgetMinor, currency),

    totalEstimatedMinor,
    totalConfirmedMinor,

    isOverBudget,
    overBudgetAmountMinor,
    overBudgetAmountFormatted: isOverBudget ? formatMoney(overBudgetAmountMinor, currency) : null,

    unestimatedItemCount,
    currency,
  };
}

/**
 * Fast check: whether a proposed set of items exceeds the budget ceiling.
 */
export function isOverBudget(
  budgetTotal: number | string | null | undefined,
  items: BudgetItemInput[],
): boolean {
  const budgetMinor = toMinorUnits(budgetTotal);
  if (budgetMinor <= 0) return false;

  let total = 0;
  for (const item of items) {
    if (!item.is_fallback) {
      total = addMoney(total, getEffectiveItemCost(item));
    }
  }

  return total > budgetMinor;
}


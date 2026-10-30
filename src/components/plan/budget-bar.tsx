"use client";

import React from "react";
import type { BudgetSummary } from "@/lib/engine/budget";

interface BudgetBarProps {
  summary: BudgetSummary;
  onOpenChangeModal: () => void;
}

export function BudgetBar({ summary, onOpenChangeModal }: BudgetBarProps) {
  const percentUsed =
    summary.budgetTotalMinor > 0
      ? Math.min(100, Math.round((summary.effectiveTotalMinor / summary.budgetTotalMinor) * 100))
      : 0;

  return (
    <div className="rounded-3xl border border-blush bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-xs font-semibold tracking-wider text-mauve uppercase">
            Celebration Budget
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-serif text-2xl font-bold text-plum sm:text-3xl">
              {summary.effectiveTotalFormatted}
            </span>
            <span className="text-xs text-mauve">of {summary.budgetTotalFormatted} target</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {summary.isOverBudget ? (
            <div className="rounded-2xl border border-rose/20 bg-rose/10 px-4 py-2 text-xs font-medium text-roseDeep">
              ⚠️ Over budget by {summary.overBudgetAmountFormatted}
            </div>
          ) : (
            <div className="rounded-2xl border border-sage/30 bg-sage/15 px-4 py-2 text-xs font-medium text-sageDeep">
              ✓ {summary.remainingBudgetFormatted} remaining
            </div>
          )}

          <button
            type="button"
            onClick={onOpenChangeModal}
            className="rounded-full border border-mauve/20 bg-paper px-4 py-2 text-xs font-semibold text-plum hover:bg-blush transition-colors"
          >
            Adjust Budget / Date
          </button>
        </div>
      </div>

      {/* Progress Track */}
      <div className="mt-4">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-blush">
          <div
            className={`h-full transition-all duration-300 ${
              summary.isOverBudget ? "bg-rose" : "bg-sageDeep"
            }`}
            style={{ width: `${Math.max(5, percentUsed)}%` }}
          />
        </div>

        <div className="mt-2 flex items-center justify-between text-[11px] text-mauve">
          <span>{percentUsed}% allocated</span>
          {summary.unestimatedItemCount > 0 && (
            <span>
              {summary.unestimatedItemCount} item{summary.unestimatedItemCount === 1 ? "" : "s"} awaiting quote
            </span>
          )}
        </div>
      </div>
    </div>
  );
}


"use client";

import React from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
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
    <section
      aria-label="Celebration Budget Overview"
      className="rounded-3xl border border-blush bg-white p-6 shadow-sm sm:p-8"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-xs font-semibold tracking-wider text-mauve uppercase">
            Celebration Budget Overview
          </span>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-2.5">
            <span className="font-serif text-3xl font-bold text-plum sm:text-4xl">
              {summary.effectiveTotalFormatted}
            </span>
            <span className="text-sm font-medium text-mauve sm:text-base">
              allocated of <span className="font-semibold text-plum">{summary.budgetTotalFormatted}</span> target
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {summary.isOverBudget ? (
            <div className="inline-flex items-center gap-1.5 rounded-2xl border border-rose/30 bg-rose/10 px-4 py-2.5 text-sm font-semibold text-roseDeep shadow-2xs">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose" aria-hidden="true" />
              <span>Over budget by {summary.overBudgetAmountFormatted}</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-2xl border border-sage/40 bg-sage/15 px-4 py-2.5 text-sm font-semibold text-sageDeep shadow-2xs">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-sageDeep" aria-hidden="true" />
              <span>{summary.remainingBudgetFormatted} remaining</span>
            </div>
          )}

          <button
            type="button"
            onClick={onOpenChangeModal}
            className="rounded-full border border-mauve/20 bg-paper px-4 py-2.5 text-sm font-semibold text-plum hover:bg-blush focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose transition-colors"
          >
            Adjust Budget / Date
          </button>
        </div>
      </div>

      {/* Progress Track */}
      <div className="mt-5">
        <div className="h-3.5 w-full overflow-hidden rounded-full bg-blush">
          <div
            className={`h-full transition-all duration-300 ${
              summary.isOverBudget ? "bg-rose" : "bg-sageDeep"
            }`}
            style={{ width: `${Math.max(5, percentUsed)}%` }}
          />
        </div>

        <div className="mt-2.5 flex items-center justify-between text-xs font-medium text-mauve sm:text-sm">
          <span>{percentUsed}% allocated</span>
          {summary.unestimatedItemCount > 0 && (
            <span>
              {summary.unestimatedItemCount} item{summary.unestimatedItemCount === 1 ? "" : "s"} awaiting quote
            </span>
          )}
        </div>
      </div>
    </section>
  );
}


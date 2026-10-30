"use client";

import React, { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import type { ProposeTradeoffsResponse } from "@/lib/ai/schemas";

interface TradeoffSelectorProps {
  isOpen: boolean;
  tradeoffs: ProposeTradeoffsResponse | null;
  occasionId: string;
  newConstraints: {
    newBudgetTotal?: number | null;
    newEventAt?: string | null;
    newGuestCount?: number | null;
  };
  onClose: () => void;
  onTradeoffApplied: (appliedSummary: string) => void;
}

export function TradeoffSelector({
  isOpen,
  tradeoffs,
  occasionId,
  newConstraints,
  onClose,
  onTradeoffApplied,
}: TradeoffSelectorProps) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !tradeoffs) return null;

  const options = tradeoffs.options || [];

  const handleApply = async () => {
    const chosenOption = options.find((o) => o.id === selectedOptionId);
    if (!chosenOption) return;

    setIsApplying(true);
    setError(null);

    try {
      const res = await fetch("/api/changes/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occasionId,
          chosenOption,
          newBudgetTotal: newConstraints.newBudgetTotal,
          newEventAt: newConstraints.newEventAt,
          newGuestCount: newConstraints.newGuestCount,
          idempotencyKey: `apply-${chosenOption.id}-${Date.now()}`,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to apply trade-off.");
      }

      const data = await res.json();
      onTradeoffApplied(data.changeSummary || chosenOption.title);
      onClose();
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to apply trade-off.");
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-plum/50 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="my-8 w-full max-w-4xl rounded-3xl border border-blush bg-paper p-6 shadow-2xl sm:p-8">
        <div className="flex items-center justify-between border-b border-blush pb-4">
          <div>
            <span className="text-xs font-semibold tracking-wider text-rose uppercase">
              Engine-Validated Trade-Offs
            </span>
            <h3 className="font-serif text-2xl font-bold text-plum">
              Choose How to Adapt Your Plan
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-mauve hover:bg-blush hover:text-plum transition-colors"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {tradeoffs.source === "fallback" && (
          <div
            role="status"
            className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-blush bg-blush/80 p-3 text-center text-xs font-semibold text-roseDeep shadow-xs"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>AI is unavailable, showing starter templates</span>
          </div>
        )}

        {tradeoffs.analysisSummary && (
          <div className="mt-4 rounded-2xl bg-lavender/30 p-4 text-xs text-plum">
            {tradeoffs.analysisSummary}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-2xl bg-rose/10 p-3 text-xs text-roseDeep">
            {error}
          </div>
        )}

        {/* Options grid */}
        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {options.map((opt) => {
            const isSelected = selectedOptionId === opt.id;

            return (
              <div
                key={opt.id}
                onClick={() => setSelectedOptionId(opt.id)}
                className={`relative flex flex-col justify-between rounded-3xl border p-5 cursor-pointer transition-all ${
                  isSelected
                    ? "border-rose bg-white shadow-md ring-2 ring-rose/20"
                    : "border-blush/80 bg-white hover:border-mauve/30"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-rose uppercase">
                      Option
                    </span>
                    <input
                      type="radio"
                      name="tradeoff-selection"
                      checked={isSelected}
                      onChange={() => setSelectedOptionId(opt.id)}
                      className="accent-rose h-4 w-4"
                    />
                  </div>

                  <h4 className="mt-2 font-serif text-lg font-bold text-plum">
                    {opt.title}
                  </h4>

                  <p className="mt-2 text-xs leading-relaxed text-mauve">
                    {opt.description}
                  </p>

                  <div className="mt-3 rounded-2xl bg-paper p-3 text-[11px] text-plum">
                    <span className="font-semibold text-roseDeep">Why it works: </span>
                    {opt.whyItWorks}
                  </div>

                  {/* Preserved Intent Tags */}
                  {opt.preservedIntentTags && opt.preservedIntentTags.length > 0 && (
                    <div className="mt-3">
                      <span className="text-[10px] font-semibold text-mauve uppercase tracking-wider">
                        Preserves intent:
                      </span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {opt.preservedIntentTags.map((tag, i) => (
                          <span
                            key={i}
                            className="rounded-full bg-peach/40 px-2 py-0.5 text-[10px] font-medium text-plum"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Impact Summary */}
                  <div className="mt-4 border-t border-blush pt-3 text-[11px] text-mauve space-y-1">
                    {(opt.removedItemIds || []).length > 0 && (
                      <p className="text-roseDeep">
                        • Drops {(opt.removedItemIds || []).length} non-essential line item(s)
                      </p>
                    )}
                    {(opt.modifiedItems || []).length > 0 && (
                      <p className="text-plum">
                        • Re-scopes {(opt.modifiedItems || []).length} item(s) to match new budget/schedule
                      </p>
                    )}
                    {(opt.addedItems || []).length > 0 && (
                      <p className="text-sageDeep">
                        • Adds {(opt.addedItems || []).length} creative lightweight alternative(s)
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Action footer */}
        <div className="mt-8 flex items-center justify-between border-t border-blush pt-4">
          <p className="text-xs text-mauve">
            Applying saves your current plan to version history so you can undo anytime.
          </p>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isApplying}
              className="rounded-full border border-mauve/20 bg-white px-5 py-2.5 text-xs font-semibold text-plum hover:bg-blush transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!selectedOptionId || isApplying}
              className="rounded-full bg-rose px-6 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-roseDeep transition-colors disabled:opacity-50"
            >
              {isApplying ? "Applying & Saving Snapshot..." : "Apply Chosen Trade-Off"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

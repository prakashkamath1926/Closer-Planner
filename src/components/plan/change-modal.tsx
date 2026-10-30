"use client";

import React, { useState } from "react";
import type { ProposeTradeoffsResponse } from "@/lib/ai/schemas";

interface ChangeModalProps {
  isOpen: boolean;
  occasionId: string;
  currentBudgetTotal: number | null;
  currentEventAt: string | null;
  currentGuestCount: number | null;
  currency: string;
  onClose: () => void;
  onTradeoffsProposed: (
    tradeoffs: ProposeTradeoffsResponse,
    newConstraints: {
      newBudgetTotal?: number | null;
      newEventAt?: string | null;
      newGuestCount?: number | null;
    },
  ) => void;
}

export function ChangeModal({
  isOpen,
  occasionId,
  currentBudgetTotal,
  currentEventAt,
  currentGuestCount,
  currency,
  onClose,
  onTradeoffsProposed,
}: ChangeModalProps) {
  const [budgetInput, setBudgetInput] = useState<string>(
    currentBudgetTotal ? String(currentBudgetTotal) : "",
  );
  const [eventAtInput, setEventAtInput] = useState<string>(
    currentEventAt ? currentEventAt.slice(0, 16) : "",
  );
  const [guestCountInput, setGuestCountInput] = useState<string>(
    currentGuestCount ? String(currentGuestCount) : "",
  );
  const [reasonInput, setReasonInput] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const newBudget = budgetInput.trim() ? Math.max(0, Number(budgetInput)) : null;
    const newDate = eventAtInput.trim() ? new Date(eventAtInput).toISOString() : null;
    const newGuests = guestCountInput.trim() ? Math.max(0, Math.floor(Number(guestCountInput))) : null;

    try {
      const res = await fetch("/api/changes/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occasionId,
          newBudgetTotal: newBudget,
          newEventAt: newDate,
          newGuestCount: newGuests,
          reason: reasonInput.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to analyze change and propose trade-offs.");
      }

      const data = await res.json();
      onTradeoffsProposed(data.tradeoffs, {
        newBudgetTotal: newBudget,
        newEventAt: newDate,
        newGuestCount: newGuests,
      });
      onClose();
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-plum/40 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-3xl border border-blush bg-paper p-6 shadow-xl sm:p-8">
        <div className="flex items-center justify-between border-b border-blush pb-4">
          <h3 className="font-serif text-xl font-bold text-plum">Change Celebration Constraints</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-mauve hover:bg-blush hover:text-plum transition-colors"
          >
            ✕
          </button>
        </div>

        <p className="mt-3 text-xs text-mauve">
          When budgets shrink or event dates move earlier, our engine identifies affected tasks, detects
          infeasibility, and generates 2 to 3 verified trade-offs.
        </p>

        {error && (
          <div className="mt-4 rounded-2xl bg-rose/10 p-3 text-xs text-roseDeep">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-plum">
              Target Budget ({currency})
            </label>
            <input
              type="number"
              min="0"
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              placeholder="e.g. 650000"
              className="mt-1 w-full rounded-2xl border border-mauve/20 bg-white px-4 py-2.5 text-sm text-plum placeholder:text-mauve/40 focus:border-rose focus:ring-1 focus:ring-rose"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-plum">
              Celebration Date & Time
            </label>
            <input
              type="datetime-local"
              value={eventAtInput}
              onChange={(e) => setEventAtInput(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-mauve/20 bg-white px-4 py-2.5 text-sm text-plum focus:border-rose focus:ring-1 focus:ring-rose"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-plum">
              Guest Count
            </label>
            <input
              type="number"
              min="0"
              value={guestCountInput}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "") {
                  setGuestCountInput("");
                } else {
                  const num = Number(val);
                  setGuestCountInput(isNaN(num) ? "" : String(Math.max(0, Math.floor(num))));
                }
              }}
              placeholder="e.g. 25"
              className="mt-1 w-full rounded-2xl border border-mauve/20 bg-white px-4 py-2.5 text-sm text-plum placeholder:text-mauve/40 focus:border-rose focus:ring-1 focus:ring-rose"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-plum">
              Reason or Context
            </label>
            <input
              type="text"
              maxLength={300}
              value={reasonInput}
              onChange={(e) => setReasonInput(e.target.value)}
              placeholder="e.g. Venue moved date 2 weeks earlier; need to trim budget"
              className="mt-1 w-full rounded-2xl border border-mauve/20 bg-white px-4 py-2.5 text-sm text-plum placeholder:text-mauve/40 focus:border-rose focus:ring-1 focus:ring-rose"
            />
          </div>

          <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-blush">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="rounded-full border border-mauve/20 bg-white px-5 py-2.5 text-xs font-semibold text-plum hover:bg-blush transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-full bg-rose px-6 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-roseDeep transition-colors disabled:opacity-50"
            >
              {isLoading ? "Analyzing Impact..." : "Find Trade-Offs"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


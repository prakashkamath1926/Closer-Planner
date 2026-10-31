"use client";

import React, { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X, Calendar, Sparkles } from "lucide-react";
import type { ProposeTradeoffsResponse } from "@/lib/ai/schemas";

const emptySubscribe = () => () => {};

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
  const [isDirectSaving, setIsDirectSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false);

  if (!isOpen || !isClient) return null;

  const handleDirectSave = async () => {
    setIsDirectSaving(true);
    setError(null);

    const newBudget = budgetInput.trim() ? Math.max(0, Number(budgetInput)) : null;
    const newDate = eventAtInput.trim() ? new Date(eventAtInput).toISOString() : null;
    const newGuests = guestCountInput.trim() ? Math.max(0, Math.floor(Number(guestCountInput))) : null;

    try {
      const res = await fetch(`/api/occasions/${occasionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventAt: newDate,
          budgetTotal: newBudget,
          guestCount: newGuests,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save celebration date.");
      }

      onClose();
      window.location.reload();
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to update date.");
    } finally {
      setIsDirectSaving(false);
    }
  };

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
      const tradeoffsData = data.tradeoffs || {
        options: data.options || [],
        source: data.source || "ai",
      };
      onTradeoffsProposed(tradeoffsData, {
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

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-plum/40 p-4 backdrop-blur-xs sm:p-6">
      <div className="flex min-h-full items-start sm:items-center justify-center p-4 py-8 sm:py-12 text-center">
        <div className="relative my-auto w-full max-w-lg rounded-3xl border border-blush bg-paper p-6 text-left shadow-xl sm:p-8">
          <div className="flex items-center justify-between border-b border-blush pb-4">
            <div className="flex items-center gap-2">
              <div className="grid size-9 place-items-center rounded-full bg-blush text-plum">
                <Calendar className="size-4" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-serif text-xl font-bold text-plum">Adjust Plan Date & Details</h3>
                <p className="text-xs text-mauve">Set your celebration schedule or adapt your budget</p>
              </div>
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

          {error && (
            <div className="mt-4 rounded-2xl bg-rose/10 p-3 text-xs text-roseDeep">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
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
              <p className="mt-1 text-[11px] text-mauve">
                Setting this activates the live countdown and schedule views.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                  className="mt-1 w-full rounded-2xl border border-mauve/20 bg-white px-4 py-2.5 text-sm text-plum placeholder:text-mauve focus:border-rose focus:ring-1 focus:ring-rose"
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
                  className="mt-1 w-full rounded-2xl border border-mauve/20 bg-white px-4 py-2.5 text-sm text-plum placeholder:text-mauve focus:border-rose focus:ring-1 focus:ring-rose"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-plum">
                Reason or Context (optional)
              </label>
              <input
                type="text"
                maxLength={300}
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                placeholder="e.g. Moved date 2 weeks earlier; need to trim budget"
                className="mt-1 w-full rounded-2xl border border-mauve/20 bg-white px-4 py-2.5 text-sm text-plum placeholder:text-mauve focus:border-rose focus:ring-1 focus:ring-rose"
              />
            </div>

            <div className="mt-6 flex flex-col-reverse sm:flex-row justify-between items-center gap-3 pt-3 border-t border-blush">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading || isDirectSaving}
                className="w-full sm:w-auto rounded-full border border-mauve/20 bg-white px-5 py-2.5 text-xs font-semibold text-plum hover:bg-blush transition-colors"
              >
                Cancel
              </button>

              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleDirectSave}
                  disabled={isLoading || isDirectSaving}
                  className="rounded-full border border-rose/30 bg-white px-5 py-2.5 text-xs font-semibold text-rose hover:bg-blush transition-colors disabled:opacity-50"
                >
                  {isDirectSaving ? "Saving Date..." : "Save Date & Details"}
                </button>

                <button
                  type="submit"
                  disabled={isLoading || isDirectSaving}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-rose px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-roseDeep transition-colors disabled:opacity-50"
                >
                  <Sparkles className="size-3.5" aria-hidden="true" />
                  <span>{isLoading ? "Analyzing..." : "Find AI Trade-Offs"}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  );
}

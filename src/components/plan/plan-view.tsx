"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { calculateBudget, type BudgetSummary } from "@/lib/engine/budget";
import {
  categorizeTaskReadiness,
  detectInfeasibleDeadlines,
  calculateUrgencyMode,
  type TimelineItem,
} from "@/lib/engine/timeline";
import { BudgetBar } from "./budget-bar";
import { ChangeModal } from "./change-modal";
import { TradeoffSelector } from "./tradeoff-selector";
import { VersionDrawer, type VersionItem } from "./version-drawer";
import { ShieldCard } from "./shield-card";
import { ClientDateTime } from "@/components/client-date-time";
import type { ProposeTradeoffsResponse } from "@/lib/ai/schemas";

export interface PlanItemRecord {
  id: string;
  occasion_id: string;
  title: string;
  category: string;
  intent_tag: string | null;
  why: string | null;
  status: "todo" | "doing" | "done" | "skipped";
  due_at: string | null;
  estimated_cost: number | null;
  confirmed_cost: number | null;
  cost_status: "estimate" | "quoted" | "confirmed";
  depends_on: string[];
  is_fallback: boolean;
  fallback_for: string | null;
  is_non_negotiable: boolean;
  sort_order: number;
}

export interface OccasionRecord {
  id: string;
  title: string;
  event_at: string | null;
  budget_total: number | null;
  guest_count: number | null;
  currency: string;
  urgency_mode: string;
  status: string;
  recipient_name?: string | null;
}

interface PlanViewProps {
  initialOccasion: OccasionRecord;
  initialItems: PlanItemRecord[];
  initialVersions: VersionItem[];
}

export function PlanView({
  initialOccasion,
  initialItems,
  initialVersions,
}: PlanViewProps) {
  const [occasion] = useState<OccasionRecord>(initialOccasion);
  const [items, setItems] = useState<PlanItemRecord[]>(initialItems);
  const [versions] = useState<VersionItem[]>(initialVersions);

  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "fallbacks" | "done">("all");
  const [isChangeModalOpen, setIsChangeModalOpen] = useState(false);
  const [isVersionDrawerOpen, setIsVersionDrawerOpen] = useState(false);

  const [proposedTradeoffs, setProposedTradeoffs] = useState<ProposeTradeoffsResponse | null>(null);
  const [newConstraints, setNewConstraints] = useState<{
    newBudgetTotal?: number | null;
    newEventAt?: string | null;
    newGuestCount?: number | null;
  }>({});
  const [isTradeoffModalOpen, setIsTradeoffModalOpen] = useState(false);

  const [lastAppliedSummary, setLastAppliedSummary] = useState<string | null>(null);

  // Derived budget calculation
  const budgetSummary: BudgetSummary = useMemo(() => {
    return calculateBudget(occasion.budget_total, items, occasion.currency || "INR");
  }, [occasion.budget_total, items, occasion.currency]);

  // Derived timeline & readiness
  const timelineItems: TimelineItem[] = useMemo(() => {
    return items.map((i) => ({
      id: i.id,
      title: i.title,
      status: i.status,
      due_at: i.due_at,
      depends_on: i.depends_on,
    }));
  }, [items]);

  const readiness = useMemo(() => {
    return categorizeTaskReadiness(timelineItems);
  }, [timelineItems]);

  const infeasibleFlags = useMemo(() => {
    return detectInfeasibleDeadlines(timelineItems, occasion.event_at);
  }, [timelineItems, occasion.event_at]);

  const blockedMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const b of readiness.blocked) {
      map.set(b.id, true);
    }
    return map;
  }, [readiness.blocked]);

  const infeasibleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const flag of infeasibleFlags) {
      map.set(flag.itemId, flag.message);
    }
    return map;
  }, [infeasibleFlags]);

  // Urgency mode
  const currentUrgency = useMemo(() => {
    return calculateUrgencyMode(occasion.event_at);
  }, [occasion.event_at]);

  // Filtered items
  const displayedItems = useMemo(() => {
    return items.filter((item) => {
      if (activeFilter === "fallbacks") return item.is_fallback;
      if (activeFilter === "done") return item.status === "done";
      if (activeFilter === "active") return !item.is_fallback && item.status !== "done";
      return true; // "all"
    });
  }, [items, activeFilter]);

  // Fallback items mapped by the original item they back up
  const fallbacksByOriginalId = useMemo(() => {
    const map = new Map<string, PlanItemRecord[]>();
    for (const item of items) {
      if (item.is_fallback && item.fallback_for) {
        const list = map.get(item.fallback_for) || [];
        list.push(item);
        map.set(item.fallback_for, list);
      }
    }
    return map;
  }, [items]);

  const handleStatusChange = async (itemId: string, newStatus: "todo" | "doing" | "done" | "skipped") => {
    // Optimistic update
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, status: newStatus } : i)),
    );

    try {
      await fetch(`/api/plan/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch {
      // Revert on failure
      setItems(items);
    }
  };

  const handleSwapPlanB = async (originalItem: PlanItemRecord, fallbackItem: PlanItemRecord) => {
    if (!confirm(`Swap in Plan B: "${fallbackItem.title}" to replace "${originalItem.title}"?`)) {
      return;
    }

    // Trade-off payload applying the swap
    const swapTradeoff = {
      id: `swap-${fallbackItem.id}`,
      title: `Plan B Swap: ${fallbackItem.title}`,
      description: `Activated alternative "${fallbackItem.title}" in place of "${originalItem.title}".`,
      whyItWorks: "Restores schedule confidence using pre-vetted Plan B.",
      preservedIntentTags: fallbackItem.intent_tag ? [fallbackItem.intent_tag] : [],
      modifiedItems: [
        {
          id: fallbackItem.id,
          // becomes active
        },
      ],
      removedItemIds: [originalItem.id],
    };

    try {
      const res = await fetch("/api/changes/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occasionId: occasion.id,
          chosenOption: swapTradeoff,
        }),
      });

      if (res.ok) {
        window.location.reload();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUndoRecent = async () => {
    if (versions.length === 0) return;
    const latestVersion = versions[0];
    try {
      const res = await fetch("/api/versions/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occasionId: occasion.id,
          targetVersionNo: latestVersion.version_no,
        }),
      });
      if (res.ok) {
        window.location.reload();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen bg-paper pb-24">
      {/* Top Navigation Strip */}
      <header className="sticky top-0 z-20 border-b border-blush bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-xs font-semibold text-mauve hover:text-plum transition-colors"
            >
              &larr; Celebration Companion
            </Link>
            <span className="text-mauve/40">/</span>
            <span className="text-xs font-medium text-plum truncate max-w-[200px]">
              {occasion.title}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsVersionDrawerOpen(true)}
              className="rounded-full border border-mauve/20 bg-white px-3.5 py-1.5 text-xs font-semibold text-plum hover:bg-blush transition-colors"
            >
              🕒 History ({versions.length})
            </button>
            <button
              type="button"
              onClick={() => setIsChangeModalOpen(true)}
              className="rounded-full bg-rose px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-roseDeep transition-colors"
            >
              Adjust Plan
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        {/* Undo Notification Banner */}
        {lastAppliedSummary && (
          <div className="mb-6 flex flex-col items-start justify-between gap-3 rounded-2xl border border-sage/40 bg-sage/10 p-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 text-xs font-medium text-sageDeep">
              <span>✓</span>
              <span>{lastAppliedSummary}</span>
            </div>
            <button
              type="button"
              onClick={handleUndoRecent}
              className="rounded-full bg-white px-3.5 py-1 text-xs font-semibold text-plum shadow-xs hover:bg-paper transition-colors"
            >
              Undo Change
            </button>
          </div>
        )}

        {/* Occasion Overview Header */}
        <div className="mb-6 flex flex-col justify-between gap-4 border-b border-blush pb-6 sm:flex-row sm:items-end">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-peach/40 px-2.5 py-0.5 text-xs font-medium text-plum capitalize">
                {currentUrgency.replace("_", " ")}
              </span>
              {occasion.recipient_name && (
                <span className="text-xs font-medium text-mauve">
                  for {occasion.recipient_name}
                </span>
              )}
            </div>

            <h1 className="mt-2 font-serif text-3xl font-bold text-plum sm:text-4xl">
              {occasion.title}
            </h1>

            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-mauve">
              {occasion.event_at ? (
                <ClientDateTime
                  date={occasion.event_at}
                  options={{
                    dateStyle: "full",
                    timeStyle: "short",
                  }}
                  prefix="📅 "
                />
              ) : (
                <span>📅 Date not set</span>
              )}

              {occasion.guest_count && (
                <span>👥 {occasion.guest_count} guests</span>
              )}
            </div>
          </div>
        </div>

        {/* Budget Bar */}
        <div className="mb-8">
          <BudgetBar
            summary={budgetSummary}
            onOpenChangeModal={() => setIsChangeModalOpen(true)}
          />
        </div>

        {/* Surprise Shield & Recipient Share */}
        <div className="mb-8">
          <ShieldCard occasionId={occasion.id} eventAt={occasion.event_at} />
        </div>

        {/* Plan Items Section Header & Filters */}
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <h2 className="font-serif text-xl font-bold text-plum">
            Celebration Activities & Tasks ({items.length})
          </h2>

          {/* Filter Pills */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { key: "all", label: "All Items" },
              { key: "active", label: "To-Do / In Progress" },
              { key: "fallbacks", label: "Plan B Alternatives" },
              { key: "done", label: "Completed" },
            ].map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setActiveFilter(f.key as typeof activeFilter)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  activeFilter === f.key
                    ? "bg-rose text-white"
                    : "bg-white text-mauve hover:bg-blush border border-mauve/20"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Items List */}
        <div className="space-y-4">
          {displayedItems.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-mauve/20 bg-white p-8 text-center text-xs text-mauve">
              No items matching this filter.
            </div>
          ) : (
            displayedItems.map((item) => {
              const isBlocked = blockedMap.get(item.id);
              const infeasibleReason = infeasibleMap.get(item.id);
              const fallbacks = fallbacksByOriginalId.get(item.id) || [];

              return (
                <div
                  key={item.id}
                  className={`rounded-3xl border bg-white p-5 shadow-xs transition-all ${
                    infeasibleReason
                      ? "border-rose/60 ring-1 ring-rose/20"
                      : isBlocked
                      ? "border-peach/80 bg-paper/40"
                      : "border-blush hover:border-mauve/30"
                  }`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1.5 flex-1">
                      {/* Intent & Category Badges */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-blush px-2.5 py-0.5 text-[11px] font-semibold text-plum uppercase tracking-wider">
                          {item.category}
                        </span>

                        {item.intent_tag && (
                          <span className="rounded-full bg-lavender/40 px-2.5 py-0.5 text-[11px] font-medium text-plum">
                            #{item.intent_tag}
                          </span>
                        )}

                        {item.is_non_negotiable && (
                          <span className="rounded-full bg-butter/60 px-2.5 py-0.5 text-[10px] font-semibold text-plum">
                            🔒 Non-negotiable
                          </span>
                        )}

                        {item.is_fallback && (
                          <span className="rounded-full bg-sage/30 px-2.5 py-0.5 text-[10px] font-semibold text-sageDeep">
                            Plan B Alternative
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h3 className="font-serif text-lg font-bold text-plum">
                        {item.title}
                      </h3>

                      {/* Why it suits them */}
                      {item.why && (
                        <p className="text-xs text-mauve leading-relaxed">
                          {item.why}
                        </p>
                      )}

                      {/* Warnings: Infeasible or Blocked */}
                      {infeasibleReason && (
                        <div className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-rose/10 px-3 py-1 text-xs font-medium text-roseDeep">
                          <span>⚠️</span>
                          <span>{infeasibleReason}</span>
                        </div>
                      )}

                      {isBlocked && (
                        <div className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-peach/40 px-3 py-1 text-xs font-medium text-plum">
                          <span>⏳ Blocked by prerequisite tasks</span>
                        </div>
                      )}

                      {/* Due date */}
                      {item.due_at && (
                        <div className="text-[11px] text-mauve">
                          <ClientDateTime
                            date={item.due_at}
                            options={{
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            }}
                            prefix="Due: "
                          />
                        </div>
                      )}
                    </div>

                    {/* Right column: Cost & Status */}
                    <div className="flex sm:flex-col items-center sm:items-end justify-between gap-3 pt-3 sm:pt-0 border-t sm:border-t-0 border-blush">
                      <div>
                        <div className="text-right font-serif text-lg font-bold text-plum" suppressHydrationWarning>
                          {occasion.currency} {Number(item.confirmed_cost || item.estimated_cost || 0).toLocaleString()}
                        </div>
                        <div className="text-right">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                              item.cost_status === "confirmed"
                                ? "bg-sage/30 text-sageDeep"
                                : item.cost_status === "quoted"
                                ? "bg-butter/50 text-plum"
                                : "bg-blush text-mauve"
                            }`}
                          >
                            {item.cost_status}
                          </span>
                        </div>
                      </div>

                      {/* Status Selector */}
                      <select
                        value={item.status}
                        onChange={(e) =>
                          handleStatusChange(
                            item.id,
                            e.target.value as "todo" | "doing" | "done" | "skipped",
                          )
                        }
                        className="rounded-full border border-mauve/20 bg-white px-3 py-1.5 text-xs font-medium text-plum focus:border-rose focus:ring-1 focus:ring-rose"
                      >
                        <option value="todo">To-Do</option>
                        <option value="doing">In Progress</option>
                        <option value="done">Completed</option>
                        <option value="skipped">Skipped</option>
                      </select>
                    </div>
                  </div>

                  {/* Plan B Alternative Row */}
                  {fallbacks.length > 0 && (
                    <div className="mt-4 rounded-2xl border border-blush bg-paper/60 p-3 sm:p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-mauve uppercase tracking-wider">
                          Ready Plan B Alternative:
                        </span>
                      </div>
                      {fallbacks.map((fb) => (
                        <div
                          key={fb.id}
                          className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                        >
                          <div>
                            <span className="font-serif text-sm font-semibold text-plum">
                              {fb.title}
                            </span>
                            {fb.why && (
                              <p className="text-xs text-mauve">{fb.why}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSwapPlanB(item, fb)}
                            className="rounded-full border border-sageDeep/40 bg-white px-3 py-1 text-xs font-semibold text-sageDeep hover:bg-sage/15 transition-colors"
                          >
                            Swap in Plan B
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* Change Constraints Modal */}
      <ChangeModal
        isOpen={isChangeModalOpen}
        occasionId={occasion.id}
        currentBudgetTotal={occasion.budget_total}
        currentEventAt={occasion.event_at}
        currentGuestCount={occasion.guest_count}
        currency={occasion.currency || "INR"}
        onClose={() => setIsChangeModalOpen(false)}
        onTradeoffsProposed={(tradeoffs, newCons) => {
          setProposedTradeoffs(tradeoffs);
          setNewConstraints(newCons);
          setIsTradeoffModalOpen(true);
        }}
      />

      {/* Trade-off Comparison Drawer */}
      <TradeoffSelector
        isOpen={isTradeoffModalOpen}
        tradeoffs={proposedTradeoffs}
        occasionId={occasion.id}
        newConstraints={newConstraints}
        onClose={() => setIsTradeoffModalOpen(false)}
        onTradeoffApplied={(summary) => {
          setLastAppliedSummary(summary);
          // Refresh window to load new database state
          window.location.reload();
        }}
      />

      {/* Version History Drawer */}
      <VersionDrawer
        isOpen={isVersionDrawerOpen}
        versions={versions}
        currentVersionNo={versions.length > 0 ? versions[0].version_no : 1}
        occasionId={occasion.id}
        onClose={() => setIsVersionDrawerOpen(false)}
        onVersionRestored={() => {
          window.location.reload();
        }}
      />
    </div>
  );
}

"use client";

/**
 * Ideas Screen: Presents 3 AI-curated celebration directions.
 *
 * Rules:
 * - Shows known/possible/needs_confirmation tags clearly.
 * - Highlights "why this suits them" note on each idea.
 * - Confirms that all costs are estimates (never confirmed).
 * - Actions: Approve (saves to DB), Edit, Reject, Regenerate.
 */

import { useState } from "react";
import { CelebrationIdea, EntryPath } from "@/lib/ai/schemas";
import { formatMoney, toMinorUnits } from "@/lib/engine/money";

interface IdeasScreenProps {
  ideas: CelebrationIdea[];
  generalWhy?: string;
  source?: "ai" | "fallback";
  entryPath: EntryPath;
  occasionType: string;
  recipientName?: string;
  intentSummary?: string;
  budgetTotal?: number;
  currency: string;
  onApprove: (idea: CelebrationIdea) => Promise<void>;
  onRegenerate: () => Promise<void>;
  onBackToIntake: () => void;
  isSaving?: boolean;
}

export function IdeasScreen({
  ideas,
  generalWhy,
  source = "ai",
  currency,
  onApprove,
  onRegenerate,
  onBackToIntake,
  isSaving = false,
}: IdeasScreenProps) {
  const [selectedIdeaId, setSelectedIdeaId] = useState<string>(ideas[0]?.id || "");
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());
  const [editingIdeaId, setEditingIdeaId] = useState<string | null>(null);
  const [editedTitles, setEditedTitles] = useState<Record<string, string>>({});

  const activeIdeas = ideas.filter((idea) => !rejectedIds.has(idea.id));
  const selectedIdea = ideas.find((i) => i.id === selectedIdeaId) || activeIdeas[0];

  const handleReject = (id: string) => {
    setRejectedIds((prev) => new Set([...prev, id]));
    if (selectedIdeaId === id) {
      const nextRemaining = activeIdeas.find((i) => i.id !== id);
      if (nextRemaining) {
        setSelectedIdeaId(nextRemaining.id);
      }
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 text-center">
        {source === "fallback" && (
          <div
            role="status"
            className="mb-4 inline-flex items-center gap-2 rounded-full border border-blush bg-blush/80 px-4 py-1.5 text-xs font-semibold text-roseDeep shadow-xs"
          >
            <span>⚠️</span>
            <span>AI is unavailable, showing starter templates</span>
          </div>
        )}
        <div>
          <span className="inline-flex items-center rounded-full bg-blush px-3 py-1 text-xs font-semibold tracking-wide text-roseDeep uppercase">
            Curated Directions
          </span>
        </div>
        <h1 className="mt-3 font-serif text-3xl font-bold text-plum sm:text-4xl">
          Three ways to celebrate
        </h1>
        {generalWhy && (
          <p className="mx-auto mt-2 max-w-2xl text-sm text-mauve sm:text-base">
            {generalWhy}
          </p>
        )}
      </div>

      {activeIdeas.length === 0 ? (
        <div className="rounded-3xl border border-peach/50 bg-paper p-8 text-center shadow-sm">
          <h3 className="font-serif text-xl font-semibold text-plum">
            All directions dismissed
          </h3>
          <p className="mt-2 text-sm text-mauve">
            Want to try something different? You can regenerate new ideas or adjust your answers.
          </p>
          <div className="mt-6 flex justify-center gap-4">
            <button
              onClick={onRegenerate}
              className="rounded-full bg-rose px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-roseDeep transition-colors"
            >
              Regenerate ideas
            </button>
            <button
              onClick={onBackToIntake}
              className="rounded-full border border-mauve/30 bg-white px-6 py-2.5 text-sm font-semibold text-plum hover:bg-blush/40 transition-colors"
            >
              Adjust answers
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {ideas.map((idea, index) => {
            const isRejected = rejectedIds.has(idea.id);
            const isSelected = selectedIdea?.id === idea.id;
            const currentTitle = editedTitles[idea.id] || idea.title;

            if (isRejected) {
              return (
                <div
                  key={idea.id}
                  className="rounded-3xl border border-dashed border-mauve/30 bg-paper/50 p-6 text-center opacity-60"
                >
                  <p className="text-xs text-mauve">Option {index + 1} dismissed</p>
                  <p className="mt-1 font-serif text-sm font-medium text-plum line-through">
                    {idea.title}
                  </p>
                  <button
                    onClick={() => {
                      setRejectedIds((prev) => {
                        const copy = new Set(prev);
                        copy.delete(idea.id);
                        return copy;
                      });
                      setSelectedIdeaId(idea.id);
                    }}
                    className="mt-3 text-xs font-semibold text-rose hover:underline"
                  >
                    Restore
                  </button>
                </div>
              );
            }

            return (
              <div
                key={idea.id}
                onClick={() => setSelectedIdeaId(idea.id)}
                className={`relative flex flex-col justify-between rounded-3xl border p-6 transition-all cursor-pointer ${
                  isSelected
                    ? "border-rose bg-white shadow-md ring-2 ring-rose/20"
                    : "border-blush/80 bg-paper hover:bg-white hover:shadow-sm"
                }`}
              >
                <div>
                  {/* Card Header & Urgency Badge */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold tracking-wider text-mauve uppercase">
                      Option {index + 1}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-peach/40 px-2.5 py-0.5 text-xs font-medium text-plum">
                      {idea.urgencyMode.replace("_", " ")}
                    </span>
                  </div>

                  {/* Title (editable) */}
                  <div className="mt-3">
                    {editingIdeaId === idea.id ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={currentTitle}
                          onChange={(e) =>
                            setEditedTitles((prev) => ({
                              ...prev,
                              [idea.id]: e.target.value,
                            }))
                          }
                          className="w-full rounded-xl border border-rose px-3 py-1.5 text-base font-serif font-bold text-plum focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingIdeaId(null);
                          }}
                          className="text-xs font-semibold text-rose hover:underline"
                        >
                          Done editing
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="font-serif text-xl font-bold text-plum">
                          {currentTitle}
                        </h2>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingIdeaId(idea.id);
                          }}
                          className="text-xs text-mauve hover:text-plum"
                          title="Edit title"
                        >
                          ✎
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Description */}
                  <p className="mt-2 text-sm leading-relaxed text-mauve">
                    {idea.description}
                  </p>

                  {/* "Why This Suits Them" callout */}
                  <div className="mt-4 rounded-2xl bg-blush/60 p-3.5 border border-blush">
                    <p className="text-xs font-semibold text-roseDeep">
                      Why this suits them:
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-plum">
                      {idea.whyItSuitsThem}
                    </p>
                  </div>

                  {/* Estimated Cost Range */}
                  <div className="mt-4 flex items-center justify-between text-xs text-mauve">
                    <span>Estimated budget:</span>
                    <span className="font-semibold text-plum">
                      {formatMoney(toMinorUnits(idea.estimatedCostMin), currency)} &ndash;{" "}
                      {formatMoney(toMinorUnits(idea.estimatedCostMax), currency)}
                    </span>
                  </div>
                  <p className="text-[10px] text-right text-mauve/70 italic">
                    (Estimated range &ndash; never assumed confirmed)
                  </p>

                  {/* Key Activities */}
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-plum uppercase tracking-wider">
                      Key Highlights:
                    </p>
                    <ul className="mt-1.5 space-y-1 text-xs text-mauve">
                      {idea.activities.map((act, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-rose">•</span>
                          <span>{act}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Facts with Status Badges */}
                  {idea.facts && idea.facts.length > 0 && (
                    <div className="mt-4 border-t border-blush pt-3">
                      <p className="text-[11px] font-semibold text-mauve uppercase tracking-wider">
                        Assumptions & Facts:
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {idea.facts.map((fact, i) => {
                          let badgeBg = "bg-sage/30 text-sageDeep";
                          let label = "known";

                          if (fact.status === "needs_confirmation") {
                            badgeBg = "bg-rose/15 text-roseDeep";
                            label = "needs confirmation";
                          } else if (fact.status === "possible") {
                            badgeBg = "bg-butter/50 text-plum";
                            label = "possible";
                          }

                          return (
                            <span
                              key={i}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeBg}`}
                            >
                              <span>{fact.key}: {fact.value}</span>
                              <span className="opacity-70 text-[9px]">({label})</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="mt-6 pt-4 border-t border-blush flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={(e) => {
                      e.stopPropagation();
                      const modifiedIdea = {
                        ...idea,
                        title: currentTitle,
                      };
                      onApprove(modifiedIdea);
                    }}
                    className="flex-1 rounded-full bg-rose py-2.5 px-4 text-center text-xs font-semibold text-white shadow-sm hover:bg-roseDeep transition-colors disabled:opacity-50"
                  >
                    {isSaving ? "Saving plan..." : "Approve this plan"}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReject(idea.id);
                    }}
                    className="rounded-full border border-mauve/20 py-2.5 px-3 text-xs text-mauve hover:text-plum hover:bg-blush/40 transition-colors"
                    title="Dismiss this idea"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer controls: Regenerate / Start over */}
      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-blush pt-6">
        <button
          type="button"
          onClick={onBackToIntake}
          className="text-xs font-medium text-mauve hover:text-plum"
        >
          &larr; Adjust intake responses
        </button>

        <button
          type="button"
          onClick={onRegenerate}
          disabled={isSaving}
          className="rounded-full border border-mauve/30 bg-white px-5 py-2 text-xs font-semibold text-plum hover:bg-blush/40 transition-colors shadow-sm disabled:opacity-50"
        >
          ↻ Regenerate 3 new directions
        </button>
      </div>
    </div>
  );
}


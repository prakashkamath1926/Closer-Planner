"use client";

/**
 * Three Entry Paths Celebration Intake Flow (Task 4).
 *
 * Rules:
 * - Three entry paths: "have_idea", "discover", "need_now".
 * - Asks 3 to 5 questions maximum.
 * - Transitions seamlessly into the IdeasScreen upon generation.
 * - Approving an idea persists it into Supabase via /api/plan.
 */

import { useState } from "react";
import Link from "next/link";
import { EntryPath, CelebrationIdea, IntakeRequest, UrgencyMode } from "@/lib/ai/schemas";
import { IdeasScreen } from "./ideas-screen";

export function IntakeFlow() {
  const [entryPath, setEntryPath] = useState<EntryPath>("discover");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<CelebrationIdea[] | null>(null);
  const [generalWhy, setGeneralWhy] = useState<string | undefined>(undefined);
  const [source, setSource] = useState<"ai" | "fallback">("ai");
  const [savedOccasionId, setSavedOccasionId] = useState<string | null>(null);

  // Form State
  const [occasionType, setOccasionType] = useState("Birthday");
  const [recipientName, setRecipientName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [concept, setConcept] = useState("");
  const [intentSummary, setIntentSummary] = useState("");
  const [budgetTotal, setBudgetTotal] = useState<number | undefined>(50000);
  const [currency] = useState("INR");
  const [guestCount, setGuestCount] = useState<number | undefined>(undefined);
  const [eventAt, setEventAt] = useState("");
  const [urgencyMode, setUrgencyMode] = useState<UrgencyMode>("weeks_away");
  const [isSurprise, setIsSurprise] = useState(false);
  const [avoidNotes, setAvoidNotes] = useState("");
  const [knownInterests, setKnownInterests] = useState("");

  const handleEntryPathChange = (path: EntryPath) => {
    setEntryPath(path);
    setErrorMessage(null);
    if (path === "need_now") {
      setUrgencyMode("tonight");
    } else if (urgencyMode === "tonight") {
      setUrgencyMode("weeks_away");
    }
  };

  const buildPayload = (): IntakeRequest => {
    return {
      entryPath,
      occasionType,
      recipientName: recipientName.trim() || undefined,
      relationship: relationship.trim() || undefined,
      intentSummary: intentSummary.trim() || undefined,
      concept: concept.trim() || undefined,
      budgetTotal: budgetTotal && budgetTotal > 0 ? budgetTotal : undefined,
      currency,
      guestCount: guestCount && guestCount > 0 ? guestCount : undefined,
      eventAt: eventAt ? eventAt : undefined,
      urgencyMode,
      isSurprise,
      avoidNotes: avoidNotes.trim() || undefined,
      knownInterests: knownInterests
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
  };

  const handleGenerate = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload = buildPayload();
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        if (res.status === 429) {
          const data = await res.json();
          setErrorMessage(
            data.message || "Rate limit reached. Please wait a minute before requesting more ideas.",
          );
          setIsSubmitting(false);
          return;
        }
        throw new Error(`Generation request failed (HTTP ${res.status})`);
      }

      const data = await res.json();
      if (data.ideas && Array.isArray(data.ideas)) {
        setIdeas(data.ideas);
        setGeneralWhy(data.generalWhy);
        setSource(data.source === "fallback" ? "fallback" : "ai");
      } else {
        throw new Error("Invalid ideas response format");
      }
    } catch (err: unknown) {
      console.error(err);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while generating celebration ideas.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async (idea: CelebrationIdea) => {
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const payload = {
        idea,
        entryPath,
        occasionType,
        recipientName: recipientName.trim() || undefined,
        intentSummary: intentSummary.trim() || undefined,
        eventAt: eventAt ? eventAt : undefined,
        budgetTotal: budgetTotal !== undefined ? Math.max(0, budgetTotal) : undefined,
        currency,
        guestCount: guestCount !== undefined ? Math.max(0, Math.floor(guestCount)) : undefined,
        isSurprise,
        avoidNotes: avoidNotes.trim() || undefined,
      };

      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const detailMsg = errorData.details
          ? typeof errorData.details === "string"
            ? errorData.details
            : JSON.stringify(errorData.details)
          : "";
        throw new Error(
          [errorData.error, detailMsg].filter(Boolean).join(": ") ||
            "Failed to save the approved plan.",
        );
      }

      const data = await res.json();
      setSavedOccasionId(data.occasionId);
    } catch (err: unknown) {
      console.error(err);
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to persist the celebration plan.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  // If saved successfully
  if (savedOccasionId) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-sage/30 text-2xl text-sageDeep">
          ✓
        </div>
        <h2 className="mt-6 font-serif text-3xl font-bold text-plum">
          Celebration plan approved & saved!
        </h2>
        <p className="mt-3 text-sm text-mauve">
          Your celebration direction and initial tasks have been saved. You can now customize activities, track vendors, and adapt when plans change.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            href={`/plan/${savedOccasionId}`}
            className="rounded-full bg-rose px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-roseDeep transition-colors"
          >
            Open Celebration Plan & Dashboard &rarr;
          </Link>
          <button
            onClick={() => {
              setSavedOccasionId(null);
              setIdeas(null);
            }}
            className="rounded-full border border-mauve/20 bg-white px-6 py-2.5 text-sm font-semibold text-plum hover:bg-blush transition-colors"
          >
            Plan another celebration
          </button>
        </div>
      </div>
    );
  }

  // If viewing ideas screen
  if (ideas && ideas.length > 0) {
    return (
      <IdeasScreen
        ideas={ideas}
        generalWhy={generalWhy}
        source={source}
        entryPath={entryPath}
        occasionType={occasionType}
        recipientName={recipientName}
        intentSummary={intentSummary}
        budgetTotal={budgetTotal}
        currency={currency}
        onApprove={handleApprove}
        onRegenerate={handleGenerate}
        onBackToIntake={() => setIdeas(null)}
        isSaving={isSaving}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="font-serif text-3xl font-bold tracking-tight text-plum sm:text-4xl">
          Start your celebration
        </h1>
        <p className="mt-2 text-sm text-mauve sm:text-base">
          Choose how you’d like to begin &ndash; from a rough concept, open discovery, or immediate planning.
        </p>
      </div>

      {/* Entry Path Selector Tabs */}
      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => handleEntryPathChange("have_idea")}
          className={`flex flex-col items-start rounded-2xl border p-4 text-left transition-all ${
            entryPath === "have_idea"
              ? "border-rose bg-white shadow-md ring-2 ring-rose/20"
              : "border-blush bg-paper hover:bg-white"
          }`}
        >
          <span className="font-serif font-bold text-plum text-base">
            I have an idea
          </span>
          <span className="mt-1 text-xs text-mauve leading-snug">
            You have a specific concept; we’ll map tasks, costs, and timings.
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleEntryPathChange("discover")}
          className={`flex flex-col items-start rounded-2xl border p-4 text-left transition-all ${
            entryPath === "discover"
              ? "border-rose bg-white shadow-md ring-2 ring-rose/20"
              : "border-blush bg-paper hover:bg-white"
          }`}
        >
          <span className="font-serif font-bold text-plum text-base">
            Help me discover
          </span>
          <span className="mt-1 text-xs text-mauve leading-snug">
            Answer a few gentle questions and explore 3 curated directions.
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleEntryPathChange("need_now")}
          className={`flex flex-col items-start rounded-2xl border p-4 text-left transition-all ${
            entryPath === "need_now"
              ? "border-rose bg-white shadow-md ring-2 ring-rose/20"
              : "border-blush bg-paper hover:bg-white"
          }`}
        >
          <div className="flex items-center gap-1.5">
            <span className="font-serif font-bold text-plum text-base">
              I need it now
            </span>
            <span className="rounded-full bg-peach/40 px-2 py-0.5 text-[10px] font-semibold text-plum">
              Fast
            </span>
          </div>
          <span className="mt-1 text-xs text-mauve leading-snug">
            Short on time. Skips long questions and defaults to tonight.
          </span>
        </button>
      </div>

      {/* Error alert */}
      {errorMessage && (
        <div className="mt-6 rounded-2xl bg-rose/10 p-4 border border-rose/30 text-xs text-roseDeep">
          {errorMessage}
        </div>
      )}

      {/* Dynamic 3-5 Question Form based on selected entry path */}
      <div className="mt-8 rounded-3xl border border-blush bg-white p-6 sm:p-8 shadow-sm space-y-6">
        {/* Question 1: Who & Occasion */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-mauve">
              What is the occasion?
            </label>
            <input
              type="text"
              value={occasionType}
              onChange={(e) => setOccasionType(e.target.value)}
              placeholder="e.g. 30th Birthday, Anniversary"
              className="mt-1.5 w-full rounded-2xl border border-mauve/20 bg-paper px-4 py-2.5 text-sm text-plum focus:border-rose focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-mauve">
              Who is it for? (Name)
            </label>
            <input
              type="text"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="e.g. Priya, Mom, Arjun"
              className="mt-1.5 w-full rounded-2xl border border-mauve/20 bg-paper px-4 py-2.5 text-sm text-plum focus:border-rose focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-mauve">
              Relationship
            </label>
            <input
              type="text"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              placeholder="e.g. Partner, Parent, Friend"
              className="mt-1.5 w-full rounded-2xl border border-mauve/20 bg-paper px-4 py-2.5 text-sm text-plum focus:border-rose focus:outline-none"
            />
          </div>
        </div>

        {/* Question 2: Concept (have_idea) OR Interests (discover) OR Essentials (need_now) */}
        {entryPath === "have_idea" && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-mauve">
              What is your idea or concept?
            </label>
            <textarea
              rows={3}
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="Describe your vision (e.g. Rooftop pottery evening with Italian antipasti and jazz music)"
              className="mt-1.5 w-full rounded-2xl border border-mauve/20 bg-paper px-4 py-2.5 text-sm text-plum focus:border-rose focus:outline-none"
            />
          </div>
        )}

        {entryPath === "discover" && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-mauve">
              What are 2&ndash;3 things they love or enjoy?
            </label>
            <input
              type="text"
              value={knownInterests}
              onChange={(e) => setKnownInterests(e.target.value)}
              placeholder="e.g. Vinyl records, filter coffee, board games, stargazing"
              className="mt-1.5 w-full rounded-2xl border border-mauve/20 bg-paper px-4 py-2.5 text-sm text-plum focus:border-rose focus:outline-none"
            />
          </div>
        )}

        {entryPath === "need_now" && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-mauve">
              Quick prompt: What’s one favorite dish, hobby, or place?
            </label>
            <input
              type="text"
              value={knownInterests}
              onChange={(e) => setKnownInterests(e.target.value)}
              placeholder="e.g. Sourdough pizza, quiet dessert parlor, indie acoustic"
              className="mt-1.5 w-full rounded-2xl border border-mauve/20 bg-paper px-4 py-2.5 text-sm text-plum focus:border-rose focus:outline-none"
            />
          </div>
        )}

        {/* Question 3: Desired feeling / Intent */}
        {entryPath !== "need_now" && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-mauve">
              What feeling do you hope they experience?
            </label>
            <input
              type="text"
              value={intentSummary}
              onChange={(e) => setIntentSummary(e.target.value)}
              placeholder="e.g. Deeply appreciated, playful nostalgia, peaceful unwinding"
              className="mt-1.5 w-full rounded-2xl border border-mauve/20 bg-paper px-4 py-2.5 text-sm text-plum focus:border-rose focus:outline-none"
            />
          </div>
        )}

        {/* Question 4: Budget & Timing */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-mauve">
              Target Budget (INR)
            </label>
            <input
              type="number"
              min="0"
              value={budgetTotal ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  setBudgetTotal(undefined);
                } else {
                  const num = Number(raw);
                  setBudgetTotal(isNaN(num) ? undefined : Math.max(0, num));
                }
              }}
              placeholder="50000"
              className="mt-1.5 w-full rounded-2xl border border-mauve/20 bg-paper px-4 py-2.5 text-sm text-plum focus:border-rose focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-mauve">
              Guest Count
            </label>
            <input
              type="number"
              min="0"
              value={guestCount ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  setGuestCount(undefined);
                } else {
                  const num = Number(raw);
                  setGuestCount(isNaN(num) ? undefined : Math.max(0, Math.floor(num)));
                }
              }}
              placeholder="e.g. 15"
              className="mt-1.5 w-full rounded-2xl border border-mauve/20 bg-paper px-4 py-2.5 text-sm text-plum focus:border-rose focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-mauve">
              Target Date
            </label>
            <input
              type="date"
              value={eventAt}
              onChange={(e) => setEventAt(e.target.value)}
              className="mt-1.5 w-full rounded-2xl border border-mauve/20 bg-paper px-4 py-2.5 text-sm text-plum focus:border-rose focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-mauve">
              Urgency Timing
            </label>
            <select
              value={urgencyMode}
              onChange={(e) => setUrgencyMode(e.target.value as UrgencyMode)}
              className="mt-1.5 w-full rounded-2xl border border-mauve/20 bg-paper px-4 py-2.5 text-sm text-plum focus:border-rose focus:outline-none"
            >
              <option value="tonight">Tonight (Immediate)</option>
              <option value="this_week">This Week (1&ndash;7 days)</option>
              <option value="weeks_away">Weeks Away (Milestones)</option>
            </select>
          </div>
        </div>

        {/* Question 5: Constraints / Avoid notes */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-mauve">
              Anything to avoid? (Dislikes, allergies)
            </label>
            <input
              type="text"
              value={avoidNotes}
              onChange={(e) => setAvoidNotes(e.target.value)}
              placeholder="e.g. No loud music, vegetarian only"
              className="mt-1.5 w-full rounded-2xl border border-mauve/20 bg-paper px-4 py-2.5 text-sm text-plum focus:border-rose focus:outline-none"
            />
          </div>

          <div className="flex items-center pt-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isSurprise}
                onChange={(e) => setIsSurprise(e.target.checked)}
                className="h-4 w-4 rounded border-mauve/40 text-rose focus:ring-rose"
              />
              <span className="text-sm font-medium text-plum">
                Keep as a Surprise (activates Surprise Shield)
              </span>
            </label>
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-4">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleGenerate}
            className="w-full rounded-full bg-rose py-3 text-center text-sm font-semibold text-white shadow-sm hover:bg-roseDeep transition-colors disabled:opacity-50"
          >
            {isSubmitting ? "Generating 3 curated celebration directions..." : "Generate Celebration Ideas"}
          </button>
        </div>
      </div>
    </div>
  );
}

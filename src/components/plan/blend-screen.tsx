"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Users, HeartHandshake, CheckCircle2, Info, Sparkles, Save, Share2, Check } from "lucide-react";
import { BlendQuestion, calculateBlendScore, AnswerEntry, BlendScoreResult } from "@/lib/engine/blend";
import { OccasionRecord } from "./plan-view";

interface BlendScreenProps {
  occasion: OccasionRecord;
}

export function BlendScreen({ occasion }: BlendScreenProps) {
  const [activeStep, setActiveStep] = useState<"organizer" | "friend" | "results">("organizer");

  // Answers state
  const [organizerAnswers, setOrganizerAnswers] = useState<Record<string, string>>({});
  const [friendAnswers, setFriendAnswers] = useState<Record<string, string>>({});
  const [friendName, setFriendName] = useState("Friend");
  const [copiedLink, setCopiedLink] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // Dynamic AI tailored questions generated specifically for this occasion
  const [questions, setQuestions] = useState<BlendQuestion[]>(() => {
    const name = occasion.recipient_name || "the guest of honor";
    const occasionTitle = occasion.title || "Celebration";
    return [
      {
        key: "celebration_setting",
        category: "Setting & Energy",
        title: `Atmosphere & Setting for ${name}`,
        subtitle: `What kind of atmosphere will feel most special for ${name}'s ${occasionTitle}?`,
        options: [
          {
            value: "intimate_warm",
            label: "Cozy & Intimate",
            description: "A warm, quiet setting with low sensory stress and deep conversation",
          },
          {
            value: "celebratory_social",
            label: "Lively & Celebratory",
            description: "A vibrant, celebratory ambiance with music, social energy, and shared laughter",
          },
        ],
      },
      {
        key: "celebration_focus",
        category: "Activity vs Keepsake",
        title: `Core Focus for ${name}`,
        subtitle: `What focus will create the most meaningful memory for ${name}?`,
        options: [
          {
            value: "immersive_activity",
            label: "Shared Hands-On Experience",
            description: `Doing something memorable together centered on ${occasionTitle}`,
          },
          {
            value: "thoughtful_keepsake",
            label: "Personal Keepsake or Shared Tribute",
            description: "A heartfelt tangible keepsake or shared messages they can treasure forever",
          },
        ],
      },
      {
        key: "culinary_style",
        category: "Dining & Hospitality",
        title: "Food & Dining Style",
        subtitle: `What dining style suits ${name} and this ${occasionTitle} best?`,
        options: [
          {
            value: "relaxed_grazing",
            label: "Casual Sharing & Favorite Comfort Foods",
            description: "Laid-back grazing platters, familiar comfort dishes, and free-flowing refreshments",
          },
          {
            value: "curated_specialty",
            label: "Curated Specialty or Tasting Menu",
            description: "A standout dining experience with intentional courses or private specialty cooking",
          },
        ],
      },
      {
        key: "surprise_comfort",
        category: "Surprises & Flow",
        title: `Surprise vs Predictability for ${name}`,
        subtitle: `How does ${name} genuinely feel about unexpected surprises and reveals?`,
        options: [
          {
            value: "playful_reveal",
            label: "Playful Clues & Dramatic Reveal",
            description: "Keep elements secret until the moment to maximize anticipation and wonder",
          },
          {
            value: "gentle_anticipation",
            label: "Clear Schedule & Advance Awareness",
            description: "Let them know what to expect in advance so they feel calm, comfortable, and prepared",
          },
        ],
      },
    ];
  });
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Load AI questions tailored to the occasion prompt
  useEffect(() => {
    let ignore = false;
    async function loadAiQuestions() {
      try {
        setIsAiLoading(true);
        let res = await fetch(`/api/blend/questions?occasionId=${occasion.id}`);
        let data = res.ok ? await res.json() : null;

        if (!data?.questions || !Array.isArray(data.questions) || data.questions.length < 3) {
          res = await fetch("/api/blend/questions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              concept: occasion.title,
              recipientName: occasion.recipient_name,
              occasionType: occasion.occasion_type,
              intentSummary: occasion.intent_summary,
            }),
          });
          if (res.ok) {
            data = await res.json();
          }
        }

        if (!ignore && data?.questions && Array.isArray(data.questions) && data.questions.length >= 3) {
          setQuestions(data.questions);
        }
      } catch {
        // Retain tailored contextual questions
      } finally {
        if (!ignore) setIsAiLoading(false);
      }
    }

    loadAiQuestions();
    return () => {
      ignore = true;
    };
  }, [occasion.id, occasion.title, occasion.recipient_name, occasion.occasion_type, occasion.intent_summary]);

  // Load existing session if saved
  useEffect(() => {
    let ignore = false;
    async function loadSession() {
      try {
        const res = await fetch(`/api/blend?occasionId=${occasion.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (ignore || !data.hasSession) return;

        const orgMap: Record<string, string> = {};
        for (const a of data.organizerAnswers || []) {
          orgMap[a.questionKey] = a.answer;
        }

        const friendMap: Record<string, string> = {};
        for (const a of data.friendAnswers || []) {
          friendMap[a.questionKey] = a.answer;
        }

        setOrganizerAnswers(orgMap);
        setFriendAnswers(friendMap);
        if (data.friendLabel) {
          setFriendName(data.friendLabel);
        }
      } catch {
        // Ignore load error
      }
    }

    loadSession();
    return () => {
      ignore = true;
    };
  }, [occasion.id]);

  // Derived live score
  const orgEntries: AnswerEntry[] = useMemo(() => {
    return Object.entries(organizerAnswers).map(([k, v]) => ({ questionKey: k, answer: v }));
  }, [organizerAnswers]);

  const friendEntries: AnswerEntry[] = useMemo(() => {
    return Object.entries(friendAnswers).map(([k, v]) => ({ questionKey: k, answer: v }));
  }, [friendAnswers]);

  const blendResult: BlendScoreResult = useMemo(() => {
    return calculateBlendScore(orgEntries, friendEntries, friendName, questions);
  }, [orgEntries, friendEntries, friendName, questions]);

  const handleSelectOrganizer = (qKey: string, val: string) => {
    setOrganizerAnswers((prev) => ({ ...prev, [qKey]: val }));
  };

  const handleSelectFriend = (qKey: string, val: string) => {
    setFriendAnswers((prev) => ({ ...prev, [qKey]: val }));
  };

  const handleSaveToCloud = async () => {
    setIsSaving(true);
    setSavedNotice(null);
    try {
      const res = await fetch("/api/blend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occasionId: occasion.id,
          friendLabel: friendName,
          organizerAnswers: orgEntries,
          friendAnswers: friendEntries,
        }),
      });

      if (res.ok) {
        setSavedNotice("Perspectives saved securely to your celebration plan.");
        setTimeout(() => setSavedNotice(null), 4000);
      }
    } catch {
      setSavedNotice("Failed to save answers to cloud; local answers retained.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section
      aria-labelledby="blend-heading"
      className="rounded-2xl border border-blush bg-sand/30 p-5 shadow-xs sm:p-6"
    >
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-blush pb-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <HeartHandshake className="h-5 w-5 text-rose" aria-hidden="true" />
            <h2 id="blend-heading" className="font-serif text-xl font-bold text-plum sm:text-2xl">
              Our Blend: Pre-Event Vibe Match
            </h2>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                isAiLoading
                  ? "bg-plum text-white animate-pulse"
                  : "bg-peach/40 text-plum"
              }`}
            >
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              {isAiLoading ? "Generating AI Questions..." : "AI Prompt Vibe Match"}
            </span>
          </div>
          <p className="mt-1 text-xs text-mauve">
            Compare your impressions with a close friend or family member who knows {occasion.recipient_name || "the recipient"}.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              if (typeof window !== "undefined" && navigator?.clipboard?.writeText) {
                try {
                  const shareUrl = `${window.location.origin}/plan/${occasion.id}?tab=blend`;
                  await navigator.clipboard.writeText(shareUrl);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2500);
                } catch {
                  // Ignore clipboard write rejection
                }
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-white px-3.5 py-2 text-xs font-semibold text-plum shadow-2xs hover:bg-sand/40"
          >
            {copiedLink ? (
              <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
            ) : (
              <Share2 className="h-3.5 w-3.5 text-mauve" aria-hidden="true" />
            )}
            <span>{copiedLink ? "Link Copied!" : "Share Link"}</span>
          </button>

          <button
            type="button"
            onClick={handleSaveToCloud}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose bg-white px-3.5 py-2 text-xs font-semibold text-rose shadow-2xs hover:bg-blush disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            {isSaving ? "Saving..." : "Save Blend"}
          </button>
        </div>
      </div>

      {savedNotice && (
        <div className="mt-3 rounded-lg bg-peach/30 p-2.5 text-xs text-plum font-medium">
          {savedNotice}
        </div>
      )}

      {/* Two-Tone Navigation Steps */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setActiveStep("organizer")}
          className={`flex items-center justify-between rounded-xl p-3 text-left transition-all ${
            activeStep === "organizer"
              ? "border-2 border-rose bg-rose/10 font-bold text-plum shadow-xs"
              : "border border-blush bg-white text-mauve hover:bg-sand/60"
          }`}
        >
          <div>
            <span className="text-[10px] uppercase tracking-wider text-rose-deep">Step 1</span>
            <div className="text-xs font-semibold">Your Answers (Organizer)</div>
          </div>
          <span className="font-mono text-xs">{Object.keys(organizerAnswers).length}/{questions.length}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveStep("friend")}
          className={`flex items-center justify-between rounded-xl p-3 text-left transition-all ${
            activeStep === "friend"
              ? "border-2 border-purple-400 bg-purple-50 font-bold text-plum shadow-xs"
              : "border border-blush bg-white text-mauve hover:bg-sand/60"
          }`}
        >
          <div>
            <span className="text-[10px] uppercase tracking-wider text-purple-700">Step 2</span>
            <div className="text-xs font-semibold">{friendName}&apos;s Answers (Friend)</div>
          </div>
          <span className="font-mono text-xs">{Object.keys(friendAnswers).length}/{questions.length}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveStep("results")}
          className={`flex items-center justify-between rounded-xl p-3 text-left transition-all ${
            activeStep === "results"
              ? "border-2 border-plum bg-sand font-bold text-plum shadow-xs"
              : "border border-blush bg-white text-mauve hover:bg-sand/60"
          }`}
        >
          <div>
            <span className="text-[10px] uppercase tracking-wider text-plum">Step 3</span>
            <div className="text-xs font-semibold">Vibe Match Results</div>
          </div>
          <span className="font-mono text-xs font-bold text-rose">
            {blendResult.scorePercentage || "No match yet"}
          </span>
        </button>
      </div>

      {/* Step 1: Organizer Answers */}
      {activeStep === "organizer" && (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl bg-peach/20 p-3 text-xs text-plum font-medium">
            Answer based on your own plan and vision for {occasion.recipient_name || "the guest of honor"}.
          </div>

          {questions.map((q) => {
            const currentVal = organizerAnswers[q.key];
            return (
              <div key={q.key} className="rounded-xl border border-blush bg-white p-4 shadow-2xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose">
                  {q.category}
                </span>
                <h4 className="mt-0.5 text-sm font-bold text-plum">{q.title}</h4>
                <p className="text-xs text-mauve">{q.subtitle}</p>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {q.options.map((opt) => {
                    const isSelected = currentVal === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleSelectOrganizer(q.key, opt.value)}
                        className={`flex flex-col rounded-xl border p-3 text-left transition-all ${
                          isSelected
                            ? "border-rose bg-peach/30 text-plum shadow-2xs"
                            : "border-border bg-sand/20 text-mauve hover:bg-sand/40"
                        }`}
                      >
                        <span className="text-xs font-bold text-plum">{opt.label}</span>
                        <span className="mt-1 text-[11px] text-mauve leading-snug">
                          {opt.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => setActiveStep("friend")}
              className="rounded-xl bg-rose px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-rose/90"
            >
              Continue to Friend&apos;s Input &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Friend Answers */}
      {activeStep === "friend" && (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-4">
            <label className="block text-xs font-semibold text-plum mb-1.5">
              Friend or Collaborator&apos;s Name / Label:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={friendName}
                onChange={(e) => setFriendName(e.target.value)}
                placeholder="e.g. Riya, Aunt Priya, Best Friend Vikram"
                className="w-full max-w-sm rounded-lg border border-purple-200 p-2 text-xs text-plum focus:ring-2 focus:ring-purple-400"
              />
            </div>
            <p className="mt-1 text-[11px] text-mauve">
              Manually enter answers shared by {friendName} to compare perspectives.
            </p>
          </div>

          {questions.map((q) => {
            const currentVal = friendAnswers[q.key];
            return (
              <div key={q.key} className="rounded-xl border border-blush bg-white p-4 shadow-2xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700">
                  {q.category}
                </span>
                <h4 className="mt-0.5 text-sm font-bold text-plum">{q.title}</h4>
                <p className="text-xs text-mauve">{q.subtitle}</p>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {q.options.map((opt) => {
                    const isSelected = currentVal === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleSelectFriend(q.key, opt.value)}
                        className={`flex flex-col rounded-xl border p-3 text-left transition-all ${
                          isSelected
                            ? "border-purple-500 bg-purple-100/60 text-plum shadow-2xs"
                            : "border-border bg-sand/20 text-mauve hover:bg-sand/40"
                        }`}
                      >
                        <span className="text-xs font-bold text-plum">{opt.label}</span>
                        <span className="mt-1 text-[11px] text-mauve leading-snug">
                          {opt.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={() => setActiveStep("organizer")}
              className="rounded-xl border border-border bg-white px-4 py-2 text-xs font-semibold text-plum hover:bg-sand/60"
            >
              &larr; Back to Your Answers
            </button>
            <button
              type="button"
              onClick={() => setActiveStep("results")}
              className="rounded-xl bg-purple-700 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-purple-800"
            >
              View Comparison Results &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Comparison Results */}
      {activeStep === "results" && (
        <div className="mt-6 space-y-6">
          {/* Main Score Hero Card */}
          <div className="rounded-2xl border-2 border-blush bg-white p-6 text-center shadow-xs">
            {blendResult.score !== null ? (
              <>
                <span className="font-serif text-4xl sm:text-5xl font-bold text-rose">
                  {blendResult.scorePercentage}
                </span>
                <h3 className="mt-2 text-sm sm:text-base font-bold text-plum capitalize">
                  {blendResult.agreementLabel}
                </h3>
                <p className="mx-auto mt-1 max-w-md text-xs text-mauve">
                  {blendResult.meaningExplanation}
                </p>
              </>
            ) : (
              <>
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-peach/30 text-rose">
                  <Users className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className="font-serif text-lg font-bold text-plum">
                  No Comparable Answers Yet
                </h3>
                <p className="mx-auto mt-1 max-w-md text-xs text-mauve">
                  {blendResult.meaningExplanation}
                </p>
              </>
            )}

            {/* Honest Disclosure Callout */}
            <div className="mt-5 rounded-xl border border-blush/80 bg-sand/40 p-3.5 text-left text-xs text-mauve">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 shrink-0 text-mauve mt-0.5" aria-hidden="true" />
                <div>
                  <strong className="text-plum">Honest scope:</strong> {blendResult.limitsExplanation}
                </div>
              </div>
            </div>
          </div>

          {/* Planning Insight based on Differences */}
          <div className="rounded-xl border border-peach bg-peach/20 p-4">
            <div className="flex items-start gap-2.5">
              <Sparkles className="h-4 w-4 shrink-0 text-rose mt-0.5" aria-hidden="true" />
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-rose">
                  How Differences Inform Your Plan
                </h4>
                <p className="mt-1 text-xs text-plum font-medium leading-relaxed">
                  {blendResult.planningInsight}
                </p>
              </div>
            </div>
          </div>

          {/* Shared Answers Breakdown */}
          {blendResult.sharedAnswers.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-plum mb-2.5">
                Shared Impressions ({blendResult.sharedAnswers.length})
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {blendResult.sharedAnswers.map((s) => (
                  <div
                    key={s.questionKey}
                    className="flex items-center gap-2.5 rounded-xl border border-green-200 bg-green-50/60 p-3 text-xs"
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
                    <div>
                      <div className="font-bold text-plum">{s.questionTitle}</div>
                      <div className="text-green-800 font-medium">{s.matchedDisplay}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Different Answers Breakdown */}
          {blendResult.differentAnswers.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-plum mb-2.5">
                Differing Perspectives ({blendResult.differentAnswers.length})
              </h4>
              <div className="space-y-2.5">
                {blendResult.differentAnswers.map((d) => (
                  <div
                    key={d.questionKey}
                    className="rounded-xl border border-blush bg-white p-3.5 text-xs shadow-2xs"
                  >
                    <div className="font-bold text-plum mb-2">{d.questionTitle}</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="rounded-lg bg-peach/20 p-2 text-plum">
                        <span className="text-[10px] uppercase font-bold text-rose block">Your view</span>
                        <span className="font-medium">{d.organizerDisplay}</span>
                      </div>
                      <div className="rounded-lg bg-purple-50 p-2 text-plum">
                        <span className="text-[10px] uppercase font-bold text-purple-700 block">
                          {blendResult.friendName}&apos;s view
                        </span>
                        <span className="font-medium">{d.friendDisplay}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Missing Questions */}
          {blendResult.missingQuestions.length > 0 && (
            <div className="rounded-xl border border-border bg-white p-4 text-xs text-mauve">
              <span className="font-bold text-plum">
                Uncompared Questions ({blendResult.missingQuestions.length}):
              </span>
              <ul className="mt-2 list-disc list-inside space-y-1">
                {blendResult.missingQuestions.map((m) => (
                  <li key={m.questionKey}>
                    {m.questionTitle} (missing from: {m.missingFrom})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}


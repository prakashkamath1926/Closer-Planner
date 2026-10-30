"use client";

import React, { useState, useRef } from "react";
import { Mail, Download, Sparkles, Edit3, Image as ImageIcon, BookOpen, Send, Check, Calendar, X } from "lucide-react";
import { toPng } from "html-to-image";
import { generateInvitationHtml, buildMailtoDraft, PublicInvitationPayload } from "@/lib/engine/invitation";
import { sanitizeHtml } from "@/lib/engine/sanitizer";
import { LetterHelperResponse } from "@/lib/ai/schemas";
import { OccasionRecord } from "./plan-view";
import { ClientDateTime } from "@/components/client-date-time";

interface InvitationSectionProps {
  occasion: OccasionRecord;
}

export function InvitationSection({ occasion }: InvitationSectionProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Invitation draft state (editable before final export)
  const [headline, setHeadline] = useState(
    `Join us in celebrating ${occasion.recipient_name || "our guest of honor"}`
  );
  const [warmMessage, setWarmMessage] = useState(
    `We are gathering together for a meaningful celebration. Your presence, laughter, and warm company would mean the world to us.`
  );
  const [dressCode, setDressCode] = useState("Festive & comfortable attire");
  const [locationNote, setLocationNote] = useState("Shared privately with guests upon RSVP");

  const [isEditing, setIsEditing] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  // Letter helper state
  const [isLetterModalOpen, setIsLetterModalOpen] = useState(false);
  const [letterOutline, setLetterOutline] = useState<LetterHelperResponse | null>(null);
  const [isLoadingLetter, setIsLoadingLetter] = useState(false);
  const [userLetterDraft, setUserLetterDraft] = useState("");
  const [copiedLetter, setCopiedLetter] = useState(false);

  // Derived payload
  const payload: PublicInvitationPayload = {
    headline,
    recipientName: occasion.recipient_name || "our guest of honor",
    occasionType: occasion.urgency_mode || "Celebration",
    eventDate: occasion.event_at,
    warmMessage,
    dressCodeNote: dressCode,
    locationNote,
  };

  // AI copy generation
  const handleGenerateAiCopy = async () => {
    setIsGeneratingAi(true);
    setAiNotice(null);
    try {
      const res = await fetch("/api/invitation/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientName: occasion.recipient_name || "our guest of honor",
          occasionType: occasion.urgency_mode || "Celebration",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.copy) {
          setHeadline(data.copy.headline);
          setWarmMessage(data.copy.invitationBody);
          if (data.copy.dressCodeNote) setDressCode(data.copy.dressCodeNote);
          setAiNotice("Copy drafted! You can edit any line directly below.");
        }
      }
    } catch {
      setAiNotice("Could not reach AI copy generator; current text preserved.");
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Letter helper load
  const handleOpenLetterHelper = async () => {
    setIsLetterModalOpen(true);
    if (letterOutline) return;

    setIsLoadingLetter(true);
    try {
      const res = await fetch("/api/invitation/letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientName: occasion.recipient_name || "our guest of honor",
          occasionType: occasion.urgency_mode || "Celebration",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setLetterOutline({
          structureOutline: data.structureOutline,
          suggestedClosing: data.suggestedClosing,
          source: data.source || "ai",
        });
      }
    } catch {
      // Fallback outline
      setLetterOutline({
        structureOutline: [
          {
            sectionTitle: "A Specific Memory or Moment",
            guidancePrompt: `Think back to a moment when ${occasion.recipient_name || "they"} made you smile or laugh.`,
            exampleStarter: "I still remember the time when we...",
          },
          {
            sectionTitle: "What You Admire or Cherish",
            guidancePrompt: "What is a unique strength or quality you deeply appreciate in them?",
            exampleStarter: "What I cherish most about you is...",
          },
          {
            sectionTitle: "A Hope or Blessing",
            guidancePrompt: "What do you wish for their journey ahead?",
            exampleStarter: "As you celebrate this milestone, my wish for you is...",
          },
        ],
        suggestedClosing: "With love and gratitude,",
        source: "fallback",
      });
    } finally {
      setIsLoadingLetter(false);
    }
  };

  // Export PNG via html-to-image
  const handleExportPng = async () => {
    if (!cardRef.current) return;
    try {
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        backgroundColor: "#FAF6F0",
      });
      const link = document.createElement("a");
      link.download = `invitation_${(occasion.recipient_name || "celebration").toLowerCase().replace(/\s+/g, "_")}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      alert("Unable to generate PNG image. You can still download the standalone HTML.");
    }
  };

  // Download standalone sanitized HTML
  const handleDownloadHtml = () => {
    const rawHtml = generateInvitationHtml(payload);
    const cleanHtml = sanitizeHtml(rawHtml);

    const blob = new Blob([cleanHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `invitation_${(occasion.recipient_name || "celebration").toLowerCase().replace(/\s+/g, "_")}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const mailtoUrl = buildMailtoDraft(payload);

  return (
    <section
      aria-labelledby="invitation-heading"
      className="rounded-2xl border border-blush bg-sand/30 p-5 shadow-xs sm:p-6"
    >
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-blush pb-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-rose" aria-hidden="true" />
            <h2 id="invitation-heading" className="font-serif text-xl font-bold text-plum sm:text-2xl">
              Invitation Mini-Site & Deliverables
            </h2>
          </div>
          <p className="mt-1 text-xs text-mauve">
            Crafted from recipient-approved fields only (never budgets or vendor notes). Preview, edit, and export PNG or HTML.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleGenerateAiCopy}
            disabled={isGeneratingAi}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose bg-white px-3 py-2 text-xs font-semibold text-rose shadow-2xs hover:bg-blush disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {isGeneratingAi ? "Drafting..." : "AI Copy Draft"}
          </button>

          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-white px-3 py-2 text-xs font-semibold text-plum hover:bg-sand/60"
          >
            <Edit3 className="h-3.5 w-3.5 text-mauve" aria-hidden="true" />
            {isEditing ? "Close Editor" : "Edit Text"}
          </button>

          <button
            type="button"
            onClick={handleOpenLetterHelper}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-white px-3 py-2 text-xs font-semibold text-plum hover:bg-sand/60"
          >
            <BookOpen className="h-3.5 w-3.5 text-mauve" aria-hidden="true" />
            Personal Letter Helper
          </button>
        </div>
      </div>

      {aiNotice && (
        <div className="mt-3 rounded-lg bg-peach/30 p-2.5 text-xs text-plum font-medium">
          {aiNotice}
        </div>
      )}

      {/* Editor Controls if open */}
      {isEditing && (
        <div className="mt-4 rounded-xl border border-blush bg-white p-4 shadow-2xs space-y-3">
          <div>
            <label className="block text-xs font-semibold text-plum mb-1">Headline</label>
            <input
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className="w-full rounded-lg border border-border p-2 text-xs text-plum focus:ring-2 focus:ring-rose/40"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-plum mb-1">Warm Message</label>
            <textarea
              rows={3}
              value={warmMessage}
              onChange={(e) => setWarmMessage(e.target.value)}
              className="w-full rounded-lg border border-border p-2 text-xs text-plum focus:ring-2 focus:ring-rose/40"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-plum mb-1">Dress Code / Attire</label>
              <input
                type="text"
                value={dressCode}
                onChange={(e) => setDressCode(e.target.value)}
                className="w-full rounded-lg border border-border p-2 text-xs text-plum focus:ring-2 focus:ring-rose/40"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-plum mb-1">Location Note</label>
              <input
                type="text"
                value={locationNote}
                onChange={(e) => setLocationNote(e.target.value)}
                className="w-full rounded-lg border border-border p-2 text-xs text-plum focus:ring-2 focus:ring-rose/40"
              />
            </div>
          </div>
        </div>
      )}

      {/* Card Preview Container */}
      <div className="mt-6 flex flex-col items-center">
        {/* Rendered Invitation Card using Design Tokens & SVG Botanicals */}
        <div
          ref={cardRef}
          className="relative w-full max-w-lg rounded-3xl border border-blush bg-white p-8 text-center shadow-md transition-all sm:p-10"
        >
          {/* SVG Botanical Frame Motif */}
          <div className="mx-auto mb-3 flex justify-center text-rose">
            <svg
              className="h-10 w-10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 2L12 22M12 6C14 4 17 4 19 6C19 9 16 11 12 11M12 13C10 11 7 11 5 13C5 16 8 18 12 18" />
            </svg>
          </div>

          <span className="text-[11px] font-bold uppercase tracking-widest text-rose">
            A Celebration of Joy
          </span>

          <h3 className="mt-2 font-serif text-2xl font-bold text-plum sm:text-3xl leading-snug">
            {headline}
          </h3>

          <div className="my-4 inline-flex items-center gap-1.5 rounded-full bg-peach/40 px-4 py-1 text-xs font-semibold text-rose">
            <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {occasion.event_at ? (
              <ClientDateTime
                date={occasion.event_at}
                options={{ dateStyle: "full" }}
                fallback="Date to be announced"
              />
            ) : (
              <span>Date to be announced</span>
            )}
          </div>

          <p className="text-sm leading-relaxed text-mauve sm:text-base">
            {warmMessage}
          </p>

          <div className="mt-6 border-t border-blush/60 pt-4 text-xs text-mauve/90 flex flex-col sm:flex-row justify-around gap-2">
            <div>
              <strong className="text-plum">Attire:</strong> {dressCode}
            </div>
            <div>
              <strong className="text-plum">Location:</strong> {locationNote}
            </div>
          </div>
        </div>

        {/* Deliverable Actions Bar */}
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={handleExportPng}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose bg-rose px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-rose/90 focus:ring-2 focus:ring-rose/40"
          >
            <ImageIcon className="h-4 w-4" aria-hidden="true" />
            Export PNG Image
          </button>

          <button
            type="button"
            onClick={handleDownloadHtml}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-white px-4 py-2 text-xs font-semibold text-plum shadow-2xs hover:bg-sand/60 focus:ring-2 focus:ring-rose/40"
          >
            <Download className="h-4 w-4 text-mauve" aria-hidden="true" />
            Download Clean HTML
          </button>

          <a
            href={mailtoUrl}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-white px-4 py-2 text-xs font-semibold text-plum shadow-2xs hover:bg-sand/60 focus:ring-2 focus:ring-rose/40"
          >
            <Send className="h-4 w-4 text-mauve" aria-hidden="true" />
            Reviewed Email Draft (mailto:)
          </a>
        </div>
      </div>

      {/* Letter Helper Modal */}
      {isLetterModalOpen && (
        <div
          role="dialog"
          aria-labelledby="letter-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-plum/40 p-4 backdrop-blur-xs"
        >
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-blush bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-blush pb-3">
              <div>
                <h3 id="letter-modal-title" className="font-serif text-lg font-bold text-plum">
                  Personal Letter Helper
                </h3>
                <p className="text-xs text-mauve">
                  AI provides thoughtful prompts and structure; you write the heartfelt personal lines.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsLetterModalOpen(false)}
                aria-label="Close"
                className="rounded-lg p-1 text-mauve hover:bg-sand/60"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-3 rounded-lg bg-sand/60 p-2.5 text-[11px] font-semibold text-plum uppercase tracking-wider">
              Draft for Organizer — Hand-Crafted Personal Words Required
            </div>

            {isLoadingLetter ? (
              <p className="py-8 text-center text-xs text-mauve">Preparing prompts for your letter...</p>
            ) : letterOutline ? (
              <div className="mt-4 space-y-4">
                {letterOutline.structureOutline.map((sec, idx) => (
                  <div key={idx} className="rounded-xl border border-blush bg-peach/10 p-3.5">
                    <span className="font-mono text-[10px] font-bold text-rose uppercase tracking-wider">
                      Part {idx + 1}: {sec.sectionTitle}
                    </span>
                    <p className="mt-1 text-xs text-plum font-medium">{sec.guidancePrompt}</p>
                    <p className="mt-1.5 text-xs italic text-mauve">Starter: &quot;{sec.exampleStarter}&quot;</p>
                  </div>
                ))}

                <div className="mt-4">
                  <label className="block text-xs font-semibold text-plum mb-1.5">
                    Your Personal Letter Draft:
                  </label>
                  <textarea
                    rows={6}
                    value={userLetterDraft}
                    onChange={(e) => setUserLetterDraft(e.target.value)}
                    placeholder="Write your personal lines here following the prompts above..."
                    className="w-full rounded-xl border border-border p-3 text-xs text-plum focus:ring-2 focus:ring-rose/40"
                  />
                </div>

                <div className="flex justify-between items-center pt-2">
                  <span className="text-xs text-mauve italic">
                    Closing suggestion: {letterOutline.suggestedClosing}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(userLetterDraft);
                      setCopiedLetter(true);
                      setTimeout(() => setCopiedLetter(false), 2000);
                    }}
                    disabled={!userLetterDraft.trim()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose bg-rose px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-rose/90 disabled:opacity-40"
                  >
                    {copiedLetter ? <Check className="h-3.5 w-3.5" /> : null}
                    {copiedLetter ? "Copied!" : "Copy Letter"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

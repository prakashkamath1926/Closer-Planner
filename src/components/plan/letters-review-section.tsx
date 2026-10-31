"use client";

import React, { useState, useEffect } from "react";
import { Mail, Key, CheckCircle2, XCircle, Trash2, Copy, Check } from "lucide-react";
import { ClientDateTime } from "@/components/client-date-time";

export interface LetterRecord {
  id: string;
  occasion_id: string;
  contributor_name: string | null;
  body: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

interface ContributeLinkItem {
  id: string;
  kind: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

interface LettersReviewSectionProps {
  occasionId: string;
}

export function LettersReviewSection({ occasionId }: LettersReviewSectionProps) {
  const [letters, setLetters] = useState<LetterRecord[]>([]);
  const [contributeLinks, setContributeLinks] = useState<ContributeLinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [newRawLink, setNewRawLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Load letters & contribute links
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        setLoading(true);
        const [lettersRes, linksRes] = await Promise.all([
          fetch(`/api/letters?occasionId=${occasionId}`),
          fetch(`/api/letters/link?occasionId=${occasionId}`),
        ]);

        if (lettersRes.ok && isMounted) {
          const lData = await lettersRes.json();
          setLetters(lData.letters || []);
        }

        if (linksRes.ok && isMounted) {
          const kData = await linksRes.json();
          setContributeLinks(kData.links || []);
        }
      } catch (err) {
        console.error("Failed to load letters data:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [occasionId]);

  const handleGenerateLink = async () => {
    try {
      setGeneratingLink(true);
      setNewRawLink(null);

      const res = await fetch("/api/letters/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ occasionId, expiresInDays: 30 }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || "Failed to create contribute link");
      }

      const data = await res.json();
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      setNewRawLink(`${origin}${data.sharePath}`);

      // Refresh links
      const refresh = await fetch(`/api/letters/link?occasionId=${occasionId}`);
      if (refresh.ok) {
        const kData = await refresh.json();
        setContributeLinks(kData.links || []);
      }
    } catch (err) {
      console.error("handleGenerateLink error:", err);
      alert(err instanceof Error ? err.message : "Could not generate contribute link.");
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleCopy = async () => {
    if (!newRawLink) return;
    try {
      await navigator.clipboard.writeText(newRawLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(true);
    }
  };

  const handleUpdateStatus = async (letterId: string, status: "approved" | "rejected") => {
    try {
      setUpdatingId(letterId);
      const res = await fetch(`/api/letters/${letterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) throw new Error("Failed to update status");

      setLetters((prev) =>
        prev.map((l) => (l.id === letterId ? { ...l, status } : l)),
      );
    } catch (err) {
      console.error(err);
      alert("Failed to update letter status.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteLetter = async (letterId: string) => {
    if (!confirm("Are you sure you want to delete this letter?")) return;
    try {
      setUpdatingId(letterId);
      const res = await fetch(`/api/letters/${letterId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete letter");

      setLetters((prev) => prev.filter((l) => l.id !== letterId));
    } catch (err) {
      console.error(err);
      alert("Failed to delete letter.");
    } finally {
      setUpdatingId(null);
    }
  };

  const pendingCount = letters.filter((l) => l.status === "pending").length;
  const approvedCount = letters.filter((l) => l.status === "approved").length;

  return (
    <div className="mt-8 border-t border-blush pt-6" data-testid="letters-review-section">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-rose" aria-hidden="true" />
            <h4 className="text-sm font-bold text-plum uppercase tracking-wider">
              Letters from Loved Ones
            </h4>
            <span className="rounded-full bg-peach/40 px-2 py-0.5 text-xs font-semibold text-plum">
              {approvedCount} approved{pendingCount > 0 ? `, ${pendingCount} pending review` : ""}
            </span>
          </div>
          <p className="mt-1 text-xs text-mauve">
            Invite friends & family to write heartfelt notes. Only approved letters are revealed to the recipient.
            {contributeLinks.some((l) => !l.revoked_at) && (
              <span className="ml-1 text-mauve/80 font-medium">
                ({contributeLinks.filter((l) => !l.revoked_at).length} active link{contributeLinks.filter((l) => !l.revoked_at).length === 1 ? "" : "s"})
              </span>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={handleGenerateLink}
          disabled={generatingLink}
          className="inline-flex items-center gap-1.5 rounded-full bg-rose px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-roseDeep focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose disabled:opacity-50 transition-colors"
        >
          {generatingLink ? "Generating..." : "+ Create Contribute Link"}
        </button>
      </div>

      {/* Freshly Generated Raw Contribute Link Banner (Shown Once) */}
      {newRawLink && (
        <div className="mt-4 rounded-2xl border border-gold/40 bg-butter/30 p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-plum">
            <Key className="h-3.5 w-3.5 text-gold shrink-0" aria-hidden="true" />
            <span>New Contribute Link (Shown Once)</span>
          </div>
          <p className="mt-1 text-xs text-mauve">
            Share this link with family and friends so they can contribute kind words:
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={newRawLink}
              className="w-full rounded-xl border border-blush bg-white px-3 py-1.5 text-xs font-mono text-plum select-all"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-rose px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-roseDeep transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Letters List */}
      <div className="mt-5 space-y-3">
        {loading ? (
          <div className="py-6 text-center text-xs text-mauve">Loading letters...</div>
        ) : letters.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-blush bg-paper/40 p-6 text-center text-xs text-mauve">
            No letters received yet. Generate a contribute link above and share it with loved ones.
          </div>
        ) : (
          letters.map((letter) => {
            const isUpdating = updatingId === letter.id;

            return (
              <div
                key={letter.id}
                className="rounded-2xl border border-blush/80 bg-white p-4 shadow-2xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blush/40 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-serif text-sm font-bold text-plum">
                      {letter.contributor_name || "Someone who loves you"}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                        letter.status === "approved"
                          ? "bg-sage/50 text-sageDeep"
                          : letter.status === "rejected"
                          ? "bg-rose/15 text-roseDeep"
                          : "bg-peach/40 text-plum"
                      }`}
                    >
                      {letter.status}
                    </span>
                  </div>

                  <span className="text-[11px] text-mauve">
                    <ClientDateTime date={letter.created_at} />
                  </span>
                </div>

                <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-plum font-sans">
                  {letter.body}
                </p>

                <div className="mt-3.5 flex items-center justify-end gap-2 border-t border-blush/30 pt-2.5">
                  {letter.status !== "approved" && (
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => handleUpdateStatus(letter.id, "approved")}
                      className="inline-flex items-center gap-1 rounded-full bg-sage/60 px-3 py-1 text-xs font-semibold text-sageDeep hover:bg-sage transition-colors disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Approve</span>
                    </button>
                  )}

                  {letter.status !== "rejected" && (
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => handleUpdateStatus(letter.id, "rejected")}
                      className="inline-flex items-center gap-1 rounded-full border border-mauve/20 bg-paper/50 px-3 py-1 text-xs font-semibold text-mauve hover:bg-blush transition-colors disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Reject</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => handleDeleteLetter(letter.id)}
                    aria-label="Delete letter"
                    className="inline-flex items-center rounded-full p-1 text-mauve/60 hover:text-rose transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

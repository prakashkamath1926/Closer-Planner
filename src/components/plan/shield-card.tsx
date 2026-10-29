"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

interface ShareLinkItem {
  id: string;
  role: "recipient" | "friend";
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

interface ShieldCardProps {
  occasionId: string;
  eventAt?: string | null;
}

export function ShieldCard({ occasionId, eventAt }: ShieldCardProps) {
  const [headline, setHeadline] = useState("Something special is being prepared");
  const [message, setMessage] = useState("");
  const [revealAt, setRevealAt] = useState("");
  const [showCountdown, setShowCountdown] = useState(true);
  const [published, setPublished] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [shareLinks, setShareLinks] = useState<ShareLinkItem[]>([]);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [newRawLink, setNewRawLink] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [now] = useState(() => Date.now());

  // Load existing recipient view & share links
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        setLoading(true);
        // Load recipient view
        const viewRes = await fetch(`/api/recipient-view?occasionId=${occasionId}`);
        if (viewRes.ok) {
          const viewData = await viewRes.json();
          if (viewData.recipientView && isMounted) {
            setHeadline(viewData.recipientView.headline || "Something special is being prepared");
            setMessage(viewData.recipientView.message || "");
            if (viewData.recipientView.reveal_at) {
              // Convert ISO to datetime-local format YYYY-MM-DDTHH:mm
              const d = new Date(viewData.recipientView.reveal_at);
              if (!Number.isNaN(d.getTime())) {
                const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
                  .toISOString()
                  .slice(0, 16);
                setRevealAt(localIso);
              }
            } else if (eventAt) {
              const d = new Date(eventAt);
              if (!Number.isNaN(d.getTime())) {
                const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
                  .toISOString()
                  .slice(0, 16);
                setRevealAt(localIso);
              }
            }
            setShowCountdown(viewData.recipientView.show_countdown ?? true);
            setPublished(viewData.recipientView.published ?? false);
          }
        }

        // Load share links
        const linksRes = await fetch(`/api/share?occasionId=${occasionId}`);
        if (linksRes.ok) {
          const linksData = await linksRes.json();
          if (linksData.links && isMounted) {
            setShareLinks(linksData.links);
          }
        }
      } catch (err) {
        console.error("Failed to load shield settings:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [occasionId, eventAt]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setSaveSuccess(false);

      const payload = {
        occasionId,
        headline,
        message: message.trim() || null,
        revealAt: revealAt ? new Date(revealAt).toISOString() : null,
        showCountdown,
        published,
      };

      const res = await fetch("/api/recipient-view", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Failed to save recipient view");
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      alert("Could not save recipient view settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateShareLink = async () => {
    try {
      setGeneratingLink(true);
      setNewRawLink(null);
      setCopySuccess(false);

      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occasionId,
          role: "recipient",
          expiresInDays: 30,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create link");
      }

      const data = await res.json();
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const fullUrl = `${origin}${data.sharePath}`;
      setNewRawLink(fullUrl);

      // Refresh share links list
      const linksRes = await fetch(`/api/share?occasionId=${occasionId}`);
      if (linksRes.ok) {
        const linksData = await linksRes.json();
        setShareLinks(linksData.links);
      }
    } catch (err) {
      console.error(err);
      alert("Could not generate share link.");
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleRevokeLink = async (shareLinkId: string) => {
    if (!confirm("Are you sure you want to revoke this link? Anyone with the link will immediately lose access.")) {
      return;
    }

    try {
      setRevokingId(shareLinkId);
      const res = await fetch("/api/share", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ occasionId, shareLinkId }),
      });

      if (!res.ok) {
        throw new Error("Failed to revoke link");
      }

      setShareLinks((prev) =>
        prev.map((l) =>
          l.id === shareLinkId ? { ...l, revoked_at: new Date().toISOString() } : l,
        ),
      );
    } catch (err) {
      console.error(err);
      alert("Could not revoke share link.");
    } finally {
      setRevokingId(null);
    }
  };

  const handleCopyLink = () => {
    if (!newRawLink) return;
    navigator.clipboard.writeText(newRawLink);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2500);
  };

  if (loading) {
    return (
      <div className="rounded-3xl border border-blush bg-white p-6 shadow-xs animate-pulse">
        <div className="h-5 w-48 rounded-full bg-blush" />
        <div className="mt-3 h-3 w-72 rounded-full bg-blush/60" />
      </div>
    );
  }

  return (
    <section aria-labelledby="shield-heading" className="rounded-3xl border border-rose/20 bg-white p-6 shadow-sm sm:p-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-shield text-gold shadow-xs">
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 id="shield-heading" className="font-serif text-lg font-bold text-plum sm:text-xl">
                Surprise Shield & Recipient Share
              </h3>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  published
                    ? "bg-sage/40 text-sageDeep"
                    : "bg-blush text-mauve"
                }`}
              >
                {published ? "● Published" : "○ Draft (Locked)"}
              </span>
            </div>
            <p className="mt-1 text-xs text-mauve">
              Private notes, budget, and vendors remain strictly confidential. The recipient only sees what you curate here.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/r/preview?occasionId=${occasionId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-mauve/20 bg-paper px-3.5 py-1.5 text-xs font-semibold text-plum hover:bg-blush transition-colors"
          >
            👁️ Preview as Recipient
          </Link>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="rounded-full bg-blush px-3.5 py-1.5 text-xs font-semibold text-roseDeep hover:bg-blush/80 transition-colors"
          >
            {isExpanded ? "Collapse Settings" : "Configure Shield"}
          </button>
        </div>
      </div>

      {/* Collapsible Editor Form */}
      {isExpanded && (
        <form onSubmit={handleSave} className="mt-6 border-t border-blush pt-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {/* Headline */}
            <div className="sm:col-span-2">
              <label
                htmlFor="shield-headline"
                className="block text-xs font-semibold text-plum uppercase tracking-wider"
              >
                Recipient Headline
              </label>
              <input
                id="shield-headline"
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                maxLength={120}
                required
                className="mt-1.5 w-full rounded-2xl border border-blush bg-paper px-4 py-2.5 text-sm font-medium text-plum focus:border-rose focus:ring-1 focus:ring-rose focus:outline-hidden"
                placeholder="Something special is being prepared"
              />
            </div>

            {/* Personal Message */}
            <div className="sm:col-span-2">
              <label
                htmlFor="shield-message"
                className="block text-xs font-semibold text-plum uppercase tracking-wider"
              >
                Personal Note / Teaser (Optional)
              </label>
              <textarea
                id="shield-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={500}
                rows={3}
                className="mt-1.5 w-full rounded-2xl border border-blush bg-paper px-4 py-2.5 text-sm text-plum focus:border-rose focus:ring-1 focus:ring-rose focus:outline-hidden"
                placeholder="Keep this evening open... you won't want to miss what we have in store."
              />
            </div>

            {/* Reveal Time */}
            <div>
              <label
                htmlFor="shield-reveal-time"
                className="block text-xs font-semibold text-plum uppercase tracking-wider"
              >
                Reveal Time / Event Time
              </label>
              <input
                id="shield-reveal-time"
                type="datetime-local"
                value={revealAt}
                onChange={(e) => setRevealAt(e.target.value)}
                className="mt-1.5 w-full rounded-2xl border border-blush bg-paper px-4 py-2.5 text-sm text-plum focus:border-rose focus:ring-1 focus:ring-rose focus:outline-hidden"
              />
            </div>

            {/* Countdown and Publish Toggles */}
            <div className="flex flex-col justify-center gap-3 pt-2">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCountdown}
                  onChange={(e) => setShowCountdown(e.target.checked)}
                  className="h-4 w-4 rounded-sm border-blush text-rose focus:ring-rose"
                />
                <span className="text-xs font-medium text-plum">
                  Show live countdown to reveal time
                </span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={published}
                  onChange={(e) => setPublished(e.target.checked)}
                  className="h-4 w-4 rounded-sm border-blush text-rose focus:ring-rose"
                />
                <span className="text-xs font-medium text-plum">
                  <strong>Publish recipient view</strong> (Links show neutral shield cover when unpublished)
                </span>
              </label>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-blush pt-4">
            <span className="text-xs text-mauve">
              {saveSuccess ? (
                <span className="font-semibold text-sageDeep">✓ Settings saved successfully!</span>
              ) : (
                "Remember to publish when you are ready to share."
              )}
            </span>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-rose px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-roseDeep disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving..." : "Save Shield Settings"}
            </button>
          </div>
        </form>
      )}

      {/* Share Links Section */}
      <div className="mt-6 border-t border-blush pt-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h4 className="text-xs font-bold text-plum uppercase tracking-wider">
              Secret Share Links
            </h4>
            <p className="text-xs text-mauve">
              Tokens are 32-byte cryptographic keys stored as SHA-256 hashes. Raw keys are never stored in the database.
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerateShareLink}
            disabled={generatingLink}
            className="rounded-full bg-plum px-4 py-1.5 text-xs font-semibold text-white hover:bg-plum/90 disabled:opacity-50 transition-colors"
          >
            {generatingLink ? "Generating..." : "+ Create Recipient Link"}
          </button>
        </div>

        {/* Freshly Generated Raw Link Banner (Shown Only Once) */}
        {newRawLink && (
          <div className="mt-4 rounded-2xl border border-gold/40 bg-butter/30 p-4">
            <div className="flex items-center gap-2 text-xs font-bold text-plum">
              <span>🔑</span>
              <span>New Recipient Link Generated (Shown Once)</span>
            </div>
            <p className="mt-1 text-xs text-mauve">
              Copy this link now. For security, only the SHA-256 hash is saved in our system:
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
                onClick={handleCopyLink}
                className="shrink-0 rounded-xl bg-rose px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-roseDeep transition-colors"
              >
                {copySuccess ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}

        {/* Existing Share Links List */}
        {shareLinks.length > 0 && (
          <div className="mt-4 divide-y divide-blush/60 rounded-2xl border border-blush bg-paper/50">
            {shareLinks.map((link) => {
              const isRevoked = Boolean(link.revoked_at);
              const isExpired = new Date(link.expires_at).getTime() < now;
              const isActive = !isRevoked && !isExpired;

              return (
                <div
                  key={link.id}
                  className="flex flex-col justify-between gap-2 p-3 sm:flex-row sm:items-center"
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        isActive ? "bg-sageDeep" : "bg-mauve"
                      }`}
                    />
                    <span className="font-medium text-plum capitalize">{link.role} link</span>
                    <span className="text-mauve font-mono text-[11px]">
                      (expires: {new Date(link.expires_at).toLocaleDateString()})
                    </span>
                    {isRevoked && (
                      <span className="rounded-full bg-rose/15 px-2 py-0.5 text-[10px] font-semibold text-roseDeep">
                        Revoked
                      </span>
                    )}
                    {isExpired && !isRevoked && (
                      <span className="rounded-full bg-mauve/20 px-2 py-0.5 text-[10px] font-semibold text-mauve">
                        Expired
                      </span>
                    )}
                  </div>

                  {isActive && (
                    <button
                      type="button"
                      disabled={revokingId === link.id}
                      onClick={() => handleRevokeLink(link.id)}
                      className="rounded-full border border-rose/30 px-3 py-1 text-[11px] font-semibold text-roseDeep hover:bg-rose hover:text-white disabled:opacity-50 transition-colors"
                    >
                      {revokingId === link.id ? "Revoking..." : "Revoke Link"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

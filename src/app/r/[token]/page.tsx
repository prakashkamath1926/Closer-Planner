"use client";

import { use, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Lock, Sparkles } from "lucide-react";
import { RecipientCountdown } from "@/components/recipient/recipient-countdown";

interface RecipientData {
  headline: string;
  message: string | null;
  reveal_at: string | null;
  show_countdown: boolean;
}

interface PageProps {
  params: Promise<{ token: string }>;
}

function RecipientPlaceholder() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-blush px-4">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-pulse text-rose">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        </div>
        <p className="font-serif text-base text-mauve animate-pulse">
          Opening your surprise envelope...
        </p>
      </div>
    </div>
  );
}

function RecipientContent({ params }: PageProps) {
  const { token } = use(params);
  const searchParams = useSearchParams();
  const occasionId = searchParams.get("occasionId");

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<RecipientData | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadRecipientView() {
      try {
        setLoading(true);
        const query = occasionId ? `?occasionId=${encodeURIComponent(occasionId)}` : "";
        const res = await fetch(`/api/recipient/${token}${query}`, {
          cache: "no-store",
        });

        if (!res.ok) {
          if (isMounted) {
            setIsNotFound(true);
            setData(null);
          }
          return;
        }

        const json: RecipientData = await res.json();
        if (isMounted) {
          setData(json);
          setIsNotFound(false);
        }
      } catch {
        if (isMounted) {
          setIsNotFound(true);
          setData(null);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadRecipientView();

    return () => {
      isMounted = false;
    };
  }, [token, occasionId]);

  // ---------------------------------------------------------------------------
  // Loading State
  // ---------------------------------------------------------------------------
  if (loading) {
    return <RecipientPlaceholder />;
  }

  // ---------------------------------------------------------------------------
  // Surprise Shield Cover (404 / Invalid / Expired / Revoked / Unpublished)
  // Per design.md: shield background (#2E1A2B), gold heart-padlock, neutral text
  // ---------------------------------------------------------------------------
  if (isNotFound || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-shield px-6 py-12 text-center text-white">
        <div className="max-w-md">
          {/* Gold Heart-Padlock */}
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-gold/30 bg-gold/10 text-gold shadow-lg shadow-gold/5">
            <svg
              className="h-10 w-10"
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
              <circle cx="12" cy="16" r="1.5" fill="currentColor" />
            </svg>
          </div>

          <h1 className="font-serif text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Something special is being prepared
          </h1>

          <p className="mt-4 text-sm text-[#FBE7A1]/80">
            This invitation link is unavailable, expired, or has not been published yet.
          </p>

          <div className="mt-8 border-t border-white/10 pt-6">
            <p className="text-xs text-mauve">Celebration Companion</p>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Recipient Experience
  // Per design.md: blush background, botanical frame, countdown with gold sparkle,
  // no planner navigation, no chrome.
  // ---------------------------------------------------------------------------
  const isPreview = token === "preview";

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-blush px-4 py-12 sm:px-6">
      {/* Organizer Preview Banner */}
      {isPreview && (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-1.5 border-b border-rose/20 bg-rose px-4 py-2 text-center text-xs font-medium text-white shadow-xs">
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Organizer Preview Mode — Only you see this draft view before sharing</span>
        </div>
      )}

      {/* Main Botanical Envelope Card */}
      <main className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-rose/15 bg-white p-8 shadow-xl sm:p-12">
        {/* Decorative Botanical Corners */}
        <div className="pointer-events-none absolute -top-10 -left-10 h-32 w-32 opacity-30 text-sage" aria-hidden="true">
          <svg viewBox="0 0 100 100" fill="currentColor">
            <path d="M10,90 Q40,40 90,10 Q60,60 10,90 Z" />
            <path d="M25,75 Q45,25 75,25 Q50,60 25,75 Z" />
          </svg>
        </div>
        <div className="pointer-events-none absolute -bottom-10 -right-10 h-32 w-32 rotate-180 opacity-30 text-peach" aria-hidden="true">
          <svg viewBox="0 0 100 100" fill="currentColor">
            <path d="M10,90 Q40,40 90,10 Q60,60 10,90 Z" />
            <path d="M25,75 Q45,25 75,25 Q50,60 25,75 Z" />
          </svg>
        </div>

        {/* Botanical Seal Header */}
        <div className="relative text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-blush bg-blush/60 text-rose shadow-xs">
            <Sparkles className="h-6 w-6 text-rose" aria-hidden="true" />
          </div>

          <span className="inline-block text-xs font-semibold tracking-widest text-mauve uppercase">
            A celebration in the making
          </span>

          <h1 className="mt-3 font-serif text-3xl font-bold tracking-tight text-plum sm:text-4xl">
            {data.headline}
          </h1>
        </div>

        {/* Personal Letter Message */}
        {data.message && (
          <div className="relative mt-8 rounded-2xl border border-blush bg-paper/80 p-6 text-center shadow-xs">
            <p className="font-serif text-base leading-relaxed text-plum whitespace-pre-wrap sm:text-lg">
              &ldquo;{data.message}&rdquo;
            </p>
          </div>
        )}

        {/* Countdown */}
        {data.show_countdown && data.reveal_at && (
          <div className="mt-8">
            <RecipientCountdown revealAt={data.reveal_at} />
          </div>
        )}

        {/* Footer */}
        <footer className="mt-12 text-center">
          <div className="flex items-center justify-center gap-2 text-xs text-mauve">
            <Sparkles className="h-3.5 w-3.5 text-rose/70" aria-hidden="true" />
            <span>Crafted with love</span>
            <Sparkles className="h-3.5 w-3.5 text-rose/70" aria-hidden="true" />
          </div>
        </footer>
      </main>
    </div>
  );
}

export default function RecipientPage({ params }: PageProps) {
  return (
    <Suspense fallback={<RecipientPlaceholder />}>
      <RecipientContent params={params} />
    </Suspense>
  );
}

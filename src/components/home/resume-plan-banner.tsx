"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles, Calendar } from "lucide-react";

interface OccasionSummary {
  id: string;
  title: string;
  occasion_type: string;
  recipient_name: string | null;
  event_at: string | null;
  status: string;
  updated_at: string;
}

export function ResumePlanHero() {
  const [occasions, setOccasions] = useState<OccasionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/user/occasions")
      .then((res) => (res.ok ? res.json() : { occasions: [] }))
      .then((data) => {
        if (data.occasions && data.occasions.length > 0) {
          setOccasions(data.occasions);
        } else {
          try {
            const raw = localStorage.getItem("closer_last_occasion");
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed?.id && parsed?.title) {
                setOccasions([
                  {
                    id: parsed.id,
                    title: parsed.title,
                    occasion_type: parsed.occasion_type || "celebration",
                    recipient_name: parsed.recipient_name || null,
                    event_at: parsed.event_at || null,
                    status: "planning",
                    updated_at: new Date().toISOString(),
                  },
                ]);
              }
            }
          } catch {
            // Ignore
          }
        }
      })
      .catch(() => {
        try {
          const raw = localStorage.getItem("closer_last_occasion");
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed?.id && parsed?.title) {
              setOccasions([
                {
                  id: parsed.id,
                  title: parsed.title,
                  occasion_type: parsed.occasion_type || "celebration",
                  recipient_name: parsed.recipient_name || null,
                  event_at: parsed.event_at || null,
                  status: "planning",
                  updated_at: new Date().toISOString(),
                },
              ]);
            }
          }
        } catch {
          // Ignore
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading || occasions.length === 0) {
    return null;
  }

  const latest = occasions[0];

  return (
    <div className="mt-6 rounded-3xl border border-blush bg-white/90 p-4 shadow-sm backdrop-blur-xs sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-rose">
            <Sparkles className="size-3.5" aria-hidden="true" />
            <span className="text-[11px] font-bold uppercase tracking-wider">
              Your Active Plan
            </span>
          </div>
          <h3 className="font-serif text-lg font-bold text-plum sm:text-xl">
            {latest.title}
          </h3>
          <p className="flex items-center gap-1.5 text-xs text-mauve">
            <Calendar className="size-3 text-mauve/70" aria-hidden="true" />
            <span>
              {latest.recipient_name ? `For ${latest.recipient_name} • ` : ""}
              {latest.event_at
                ? new Date(latest.event_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "Date not set"}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1 sm:pt-0">
          <Link
            href={`/plan/${latest.id}`}
            className="inline-flex items-center gap-2 rounded-full bg-rose px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-roseDeep transition-colors"
          >
            <span>Open your plan</span>
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>

          {occasions.length > 1 && (
            <Link
              href="/plans"
              className="rounded-full border border-mauve/20 bg-paper px-4 py-2.5 text-xs font-semibold text-plum hover:bg-blush transition-colors"
            >
              All plans ({occasions.length})
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}


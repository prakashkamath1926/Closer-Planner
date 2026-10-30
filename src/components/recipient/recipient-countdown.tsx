"use client";

import { useEffect, useState } from "react";
import { Sparkles, PartyPopper } from "lucide-react";
import { calculateCountdown, CountdownState } from "@/lib/engine/shield";

interface RecipientCountdownProps {
  revealAt: string;
}

export function RecipientCountdown({ revealAt }: RecipientCountdownProps) {
  const [countdown, setCountdown] = useState<CountdownState | null>(() =>
    calculateCountdown(revealAt),
  );

  useEffect(() => {
    // Tick every second
    const interval = setInterval(() => {
      setCountdown(calculateCountdown(revealAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [revealAt]);

  if (!countdown) return null;

  if (countdown.isRevealed) {
    return (
      <div className="mt-8 rounded-3xl border border-gold/40 bg-butter/30 px-6 py-4 text-center shadow-xs">
        <div className="flex items-center justify-center gap-2 text-rose">
          <Sparkles className="h-6 w-6" aria-hidden="true" />
          <PartyPopper className="h-7 w-7" aria-hidden="true" />
          <Sparkles className="h-6 w-6" aria-hidden="true" />
        </div>
        <h4 className="mt-1 font-serif text-lg font-semibold text-plum">
          The moment has arrived!
        </h4>
        <p className="text-xs text-mauve">Your special celebration is now in motion.</p>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-3xl border border-blush bg-white/80 p-6 shadow-sm backdrop-blur-xs">
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-widest text-gold uppercase">
          <Sparkles className="h-3.5 w-3.5 text-gold shrink-0" aria-hidden="true" />
          <span>Countdown to the Big Reveal</span>
          <Sparkles className="h-3.5 w-3.5 text-gold shrink-0" aria-hidden="true" />
        </span>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 text-center sm:gap-4">
        <div className="rounded-2xl border border-blush/60 bg-blush/30 p-2.5 sm:p-4">
          <span className="block font-serif text-2xl font-bold text-plum sm:text-4xl">
            {countdown.days}
          </span>
          <span className="mt-1 block text-[10px] font-semibold text-mauve tracking-wider uppercase sm:text-xs">
            Days
          </span>
        </div>

        <div className="rounded-2xl border border-blush/60 bg-blush/30 p-2.5 sm:p-4">
          <span className="block font-serif text-2xl font-bold text-plum sm:text-4xl">
            {String(countdown.hours).padStart(2, "0")}
          </span>
          <span className="mt-1 block text-[10px] font-semibold text-mauve tracking-wider uppercase sm:text-xs">
            Hours
          </span>
        </div>

        <div className="rounded-2xl border border-blush/60 bg-blush/30 p-2.5 sm:p-4">
          <span className="block font-serif text-2xl font-bold text-plum sm:text-4xl">
            {String(countdown.minutes).padStart(2, "0")}
          </span>
          <span className="mt-1 block text-[10px] font-semibold text-mauve tracking-wider uppercase sm:text-xs">
            Minutes
          </span>
        </div>

        <div className="rounded-2xl border border-blush/60 bg-blush/30 p-2.5 sm:p-4">
          <span className="block font-serif text-2xl font-bold text-plum sm:text-4xl">
            {String(countdown.seconds).padStart(2, "0")}
          </span>
          <span className="mt-1 block text-[10px] font-semibold text-mauve tracking-wider uppercase sm:text-xs">
            Seconds
          </span>
        </div>
      </div>
    </div>
  );
}


"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Mail, X, Heart } from "lucide-react";
import type { RecipientLetter } from "@/lib/engine/shield";

interface EnvelopeGridProps {
  letters: RecipientLetter[];
}

const ROTATIONS = [-1.5, 1.2, -0.8, 1.8, -1.2, 0.9];
const PAPER_STYLES = [
  "bg-paper border-blush",
  "bg-blush/40 border-blush/80",
  "bg-peach/30 border-peach/60",
  "bg-sage/20 border-sage/40",
];

export function EnvelopeGrid({ letters }: EnvelopeGridProps) {
  const [selectedLetter, setSelectedLetter] = useState<{
    letter: RecipientLetter;
    index: number;
  } | null>(null);

  const reducedMotion = useReducedMotion();
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedLetter) {
        setSelectedLetter(null);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedLetter]);

  if (!letters || letters.length === 0) return null;

  return (
    <div className="mt-10 w-full" data-testid="envelope-grid">
      <div className="text-center">
        <h2 className="font-serif text-2xl font-bold text-plum sm:text-3xl">
          Letters from Loved Ones
        </h2>
        <p className="mt-1 text-xs text-mauve">
          Click or press Enter on an envelope to open a message written for you.
        </p>
      </div>

      {/* Grid of Envelopes */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {letters.map((letter, idx) => {
          const rotation = ROTATIONS[idx % ROTATIONS.length];
          const paperStyle = PAPER_STYLES[idx % PAPER_STYLES.length];
          const isSelected = selectedLetter?.index === idx;

          return (
            <button
              key={`${letter.from}-${idx}`}
              type="button"
              data-cursor="open"
              aria-expanded={isSelected}
              aria-label={`Open letter from ${letter.from || "a loved one"}`}
              onClick={(e) => {
                triggerRef.current = e.currentTarget;
                setSelectedLetter({ letter, index: idx });
              }}
              style={{
                transform: `rotate(${rotation}deg)`,
              }}
              className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-5 text-left shadow-xs transition-all duration-200 hover:-translate-y-1 hover:shadow-md focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose ${paperStyle}`}
            >
              {/* Envelope flap visual line */}
              <div
                className="pointer-events-none absolute top-0 left-0 right-0 h-14 border-b border-blush/60 bg-white/40"
                style={{
                  clipPath: "polygon(0 0, 100% 0, 50% 100%)",
                }}
                aria-hidden="true"
              />

              {/* Heart Seal */}
              <div className="relative z-10 mx-auto mt-2 flex h-8 w-8 items-center justify-center rounded-full bg-rose/10 text-rose shadow-2xs group-hover:bg-rose group-hover:text-white transition-colors">
                <Heart className="h-4 w-4" fill="currentColor" aria-hidden="true" />
              </div>

              {/* Letter Snippet / Sender */}
              <div className="relative z-10 mt-6 text-center">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-mauve">
                  Letter from
                </span>
                <span className="mt-1 block font-serif text-base font-bold text-plum truncate">
                  {letter.from || "Someone who loves you"}
                </span>
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-0.5 text-[10px] font-medium text-mauve group-hover:text-rose transition-colors">
                  <Mail className="h-3 w-3" aria-hidden="true" />
                  <span>Click to open</span>
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Unfolding Envelope & Letter Modal */}
      <AnimatePresence>
        {selectedLetter && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-plum/60 backdrop-blur-xs p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="envelope-letter-sender"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setSelectedLetter(null);
                triggerRef.current?.focus();
              }
            }}
          >
            <motion.div
              ref={modalRef}
              initial={
                reducedMotion
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.9, y: 30 }
              }
              animate={
                reducedMotion
                  ? { opacity: 1 }
                  : { opacity: 1, scale: 1, y: 0 }
              }
              exit={
                reducedMotion
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.95, y: 20 }
              }
              transition={{ duration: reducedMotion ? 0.01 : 0.25, ease: "easeOut" }}
              className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-blush bg-white shadow-2xl"
            >
              {/* Envelope Flap animation (3D fold unfold) */}
              {!reducedMotion && (
                <motion.div
                  initial={{ rotateX: 0 }}
                  animate={{ rotateX: -180 }}
                  exit={{ rotateX: 0 }}
                  transition={{ duration: 0.35, ease: "easeInOut" }}
                  style={{
                    transformOrigin: "top",
                    perspective: 1000,
                  }}
                  className="pointer-events-none absolute top-0 left-0 right-0 z-20 h-16 border-b border-blush bg-paper/90 shadow-xs"
                />
              )}

              {/* Close Button */}
              <button
                type="button"
                onClick={() => {
                  setSelectedLetter(null);
                  triggerRef.current?.focus();
                }}
                aria-label="Close letter"
                className="absolute top-4 right-4 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-paper text-mauve hover:bg-blush hover:text-plum focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose transition-colors"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>

              {/* Letter Panels Unfolding */}
              <motion.div
                initial={
                  reducedMotion
                    ? { opacity: 1 }
                    : { opacity: 0, y: 30, scaleY: 0.85 }
                }
                animate={
                  reducedMotion
                    ? { opacity: 1 }
                    : { opacity: 1, y: 0, scaleY: 1 }
                }
                exit={
                  reducedMotion
                    ? { opacity: 0 }
                    : { opacity: 0, y: 20, scaleY: 0.9 }
                }
                transition={{
                  duration: reducedMotion ? 0.01 : 0.4,
                  delay: reducedMotion ? 0 : 0.15,
                  ease: "easeOut",
                }}
                style={{ transformOrigin: "top" }}
                className="p-6 sm:p-10"
              >
                {/* Letter Header */}
                <div className="border-b border-blush pb-4 text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-peach/30 text-rose mb-2">
                    <Heart className="h-5 w-5" fill="currentColor" aria-hidden="true" />
                  </div>
                  <h3
                    id="envelope-letter-sender"
                    className="font-serif text-xl font-bold text-plum sm:text-2xl"
                  >
                    From: {selectedLetter.letter.from || "Someone who loves you"}
                  </h3>
                </div>

                {/* Letter Plain Text Body (Selectable, never dangerouslySetInnerHTML) */}
                <div className="mt-6 max-h-[60vh] overflow-y-auto pr-1">
                  <p className="select-text font-serif text-base leading-relaxed text-plum whitespace-pre-wrap sm:text-lg">
                    {selectedLetter.letter.body}
                  </p>
                </div>

                {/* Unfolded Footer Note */}
                <div className="mt-8 border-t border-blush/60 pt-4 text-center">
                  <span className="text-xs text-mauve">
                    Press <kbd className="rounded border border-mauve/20 bg-paper px-1.5 py-0.5 font-mono text-[11px]">Escape</kbd> to fold back into envelope
                  </span>
                </div>
              </motion.div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

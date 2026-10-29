"use client";

import React, { useState } from "react";
import { X, Sparkles, AlertTriangle, CheckCircle2 } from "lucide-react";
import { ParsedQuoteFields } from "@/lib/engine/vendors";
import { formatMoney } from "@/lib/engine/money";

interface QuoteParseModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendorId: string;
  vendorName: string;
  category: string;
  occasionId: string;
  currency: string;
  existingNotes?: string | null;
  existingFields?: ParsedQuoteFields | Record<string, unknown>;
  onQuoteSaved: () => void;
}

export function QuoteParseModal({
  isOpen,
  onClose,
  vendorId,
  vendorName,
  category,
  occasionId,
  currency,
  existingNotes,
  existingFields,
  onQuoteSaved,
}: QuoteParseModalProps) {
  const [pastedText, setPastedText] = useState(existingNotes || "");
  const [parsing, setParsing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sourceNotice, setSourceNotice] = useState<string | null>(null);
  const [parsedResult, setParsedResult] = useState<ParsedQuoteFields | null>(() => {
    if (existingFields && "included" in existingFields) {
      return existingFields as ParsedQuoteFields;
    }
    return null;
  });

  if (!isOpen) return null;

  const handleParse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pastedText.trim()) return;

    try {
      setParsing(true);
      setErrorMsg(null);
      setSourceNotice(null);

      const res = await fetch("/api/vendors/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId,
          occasionId,
          category,
          pastedText,
          currency,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to parse quote");
      }

      const data = await res.json();
      setParsedResult(data.quoteFields);
      if (data.source === "fallback") {
        setSourceNotice("AI is unavailable, extracted basic details via template fallback.");
      }
      onQuoteSaved();
    } catch (err) {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : "Error parsing quote");
    } finally {
      setParsing(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quote-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-plum/50 p-4 backdrop-blur-xs"
    >
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-blush bg-white p-6 shadow-xl sm:p-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-blush pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-peach/40 px-2.5 py-0.5 text-xs font-semibold text-plum uppercase">
                {category}
              </span>
              <h3 id="quote-modal-title" className="font-serif text-xl font-bold text-plum">
                Quote Breakdown: {vendorName}
              </h3>
            </div>
            <p className="mt-1 text-xs text-mauve">
              Pasted quotes are treated as unverified data. Status never advances automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-full p-1.5 text-mauve hover:bg-blush hover:text-plum transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Input Form */}
        <form onSubmit={handleParse} className="mt-4">
          <label
            htmlFor="pasted-quote"
            className="block text-xs font-semibold text-plum uppercase tracking-wider"
          >
            Paste Vendor Email, WhatsApp Message, or Quote Text
          </label>
          <textarea
            id="pasted-quote"
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            rows={5}
            required
            placeholder="Paste raw vendor message here, e.g.: 'Hi! For November 20th, our standard package is ₹45,000 including 4 live food stations...'"
            className="mt-1.5 w-full rounded-2xl border border-blush bg-paper px-4 py-3 text-xs text-plum font-mono focus:border-rose focus:ring-1 focus:ring-rose focus:outline-hidden"
          />

          <div className="mt-3 flex items-center justify-between">
            <span className="text-[11px] text-mauve">
              🛡️ Safe: Prompt injection defense active. Quoted text cannot execute commands.
            </span>
            <button
              type="submit"
              disabled={parsing || !pastedText.trim()}
              className="inline-flex items-center gap-1.5 rounded-full bg-rose px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-roseDeep disabled:opacity-50 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{parsing ? "Parsing Quote..." : "Parse & Compare Fields"}</span>
            </button>
          </div>
        </form>

        {errorMsg && (
          <div className="mt-4 rounded-xl border border-rose/30 bg-rose/10 p-3 text-xs text-roseDeep">
            ⚠️ {errorMsg}
          </div>
        )}

        {sourceNotice && (
          <div className="mt-3 rounded-xl border border-butter bg-butter/30 p-2.5 text-xs text-plum">
            ℹ️ {sourceNotice}
          </div>
        )}

        {/* Parsed Quote Results */}
        {parsedResult && (
          <div className="mt-6 border-t border-blush pt-5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-butter/40 px-3 py-1 text-xs font-bold text-plum">
                <span>⚠️</span>
                <span>QUOTED (Unverified Claims)</span>
              </span>
              <span className="text-xs text-mauve">Organizer confirmation required</span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Quoted Price */}
              <div className="rounded-2xl border border-blush bg-paper p-4">
                <span className="text-[11px] font-semibold text-mauve uppercase tracking-wider">
                  Quoted Price
                </span>
                <p className="mt-1 font-serif text-2xl font-bold text-plum">
                  {parsedResult.price !== null
                    ? formatMoney(parsedResult.price, parsedResult.currency || currency)
                    : "Not quoted / Unspecified"}
                </p>
                {parsedResult.price === null && (
                  <span className="mt-1 inline-block text-[10px] text-roseDeep font-semibold">
                    ⚠️ Missing price figure
                  </span>
                )}
              </div>

              {/* Availability Claim */}
              <div className="rounded-2xl border border-blush bg-paper p-4">
                <span className="text-[11px] font-semibold text-mauve uppercase tracking-wider">
                  Availability Claim
                </span>
                <p className="mt-1 text-xs text-plum">
                  {parsedResult.availability_claim || "No availability statement mentioned"}
                </p>
                <span className="mt-1 block text-[10px] text-mauve">
                  *Unverified claim; dates require organizer confirmation.
                </span>
              </div>

              {/* Included Items */}
              <div className="rounded-2xl border border-blush bg-paper p-4">
                <span className="text-[11px] font-semibold text-mauve uppercase tracking-wider">
                  Included Services & Items ({parsedResult.included?.length || 0})
                </span>
                {parsedResult.included && parsedResult.included.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-plum">
                    {parsedResult.included.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-sageDeep mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-mauve">None explicitly detailed</p>
                )}
              </div>

              {/* Extra Fees */}
              <div className="rounded-2xl border border-blush bg-paper p-4">
                <span className="text-[11px] font-semibold text-mauve uppercase tracking-wider">
                  Additional / Extra Fees ({parsedResult.extra_fees?.length || 0})
                </span>
                {parsedResult.extra_fees && parsedResult.extra_fees.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-plum">
                    {parsedResult.extra_fees.map((fee, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 mt-0.5" />
                        <span>{fee}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-mauve">No extra fees mentioned</p>
                )}
              </div>

              {/* Cancellation & Payment Terms */}
              <div className="sm:col-span-2 rounded-2xl border border-blush bg-paper p-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <span className="text-[11px] font-semibold text-mauve uppercase tracking-wider">
                      Cancellation Policy
                    </span>
                    <p className="mt-1 text-xs text-plum">
                      {parsedResult.cancellation_terms || "Not provided in quote (needs confirmation)"}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-mauve uppercase tracking-wider">
                      Payment Terms & Deposit
                    </span>
                    <p className="mt-1 text-xs text-plum">
                      {parsedResult.payment_terms || "Not provided in quote (needs confirmation)"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Missing Information */}
              {parsedResult.missing && parsedResult.missing.length > 0 && (
                <div className="sm:col-span-2 rounded-2xl border border-rose/20 bg-rose/5 p-4">
                  <span className="text-[11px] font-semibold text-roseDeep uppercase tracking-wider">
                    Missing or Incomparable Information
                  </span>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {parsedResult.missing.map((m, idx) => (
                      <span
                        key={idx}
                        className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-roseDeep shadow-2xs border border-rose/20"
                      >
                        ⚠️ {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Questions to Ask */}
              {parsedResult.questions && parsedResult.questions.length > 0 && (
                <div className="sm:col-span-2 rounded-2xl border border-sage/30 bg-sage/10 p-4">
                  <span className="text-[11px] font-semibold text-sageDeep uppercase tracking-wider">
                    Suggested Questions to Ask Vendor
                  </span>
                  <ul className="mt-2 space-y-1.5 text-xs text-plum">
                    {parsedResult.questions.map((q, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="font-bold text-sageDeep">{idx + 1}.</span>
                        <span>{q}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


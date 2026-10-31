"use client";

import React, { useState, useTransition } from "react";
import { Send, CheckCircle2, AlertCircle, Heart } from "lucide-react";

interface ContributeFormProps {
  token: string;
}

export function ContributeForm({ token }: ContributeFormProps) {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const remainingChars = 600 - body.length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedBody = body.trim();
    if (trimmedBody.length === 0) {
      setErrorMessage("Please write a few words before sending.");
      return;
    }
    if (trimmedBody.length > 600) {
      setErrorMessage("Letter cannot exceed 600 characters.");
      return;
    }
    if (name.length > 40) {
      setErrorMessage("Name cannot exceed 40 characters.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/letters/contribute/${encodeURIComponent(token)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim() || undefined,
            body: trimmedBody,
            honeypot: honeypot || undefined,
          }),
        });

        if (!res.ok) {
          if (res.status === 429) {
            setErrorMessage("Too many submissions. Please wait a minute and try again.");
            return;
          }
          setErrorMessage("Unable to submit letter. This link may have expired or is invalid.");
          return;
        }

        setIsSuccess(true);
      } catch {
        setErrorMessage("Network error. Please try again.");
      }
    });
  };

  if (isSuccess) {
    return (
      <div
        className="rounded-3xl border border-blush/80 bg-white p-8 text-center shadow-xs"
        role="status"
        aria-live="polite"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-peach/40 text-rose">
          <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
        </div>
        <h1 className="mt-4 font-serif text-2xl font-bold text-plum sm:text-3xl">
          Thank you for sharing
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-mauve">
          Your letter has been securely received. The organizer will review all letters before they are revealed to the recipient.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-blush/80 bg-white p-6 shadow-xs sm:p-8">
      <div className="text-center">
        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-peach/30 text-rose mb-3">
          <Heart className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="font-serif text-2xl font-bold text-plum sm:text-3xl">
          Write a few kind words
        </h1>
        <p className="mt-2 text-sm text-mauve">
          Share a cherished memory, a message of love, or words of encouragement.
        </p>
      </div>

      {errorMessage && (
        <div
          role="alert"
          aria-live="assertive"
          className="mt-6 flex items-start gap-2.5 rounded-2xl border border-rose/30 bg-rose/10 p-3.5 text-xs text-rose"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
        {/* Anti-spam Honeypot Field */}
        <div className="hidden" aria-hidden="true">
          <label htmlFor="contribute-hp">Leave this empty</label>
          <input
            id="contribute-hp"
            type="text"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        {/* Contributor Name */}
        <div>
          <label
            htmlFor="contributor-name"
            className="block text-xs font-semibold uppercase tracking-wider text-plum"
          >
            Your Name <span className="text-mauve font-normal lowercase">(optional)</span>
          </label>
          <input
            id="contributor-name"
            type="text"
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Grandma, Sarah, Uncle Dave"
            className="mt-1.5 block w-full rounded-2xl border border-blush bg-paper px-3.5 py-2.5 text-sm text-plum placeholder:text-mauve focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose"
          />
        </div>

        {/* Letter Body */}
        <div>
          <div className="flex items-center justify-between">
            <label
              htmlFor="letter-body"
              className="block text-xs font-semibold uppercase tracking-wider text-plum"
            >
              Your Message <span className="text-rose">*</span>
            </label>
            <span
              id="letter-counter"
              className={`text-xs ${
                remainingChars < 0
                  ? "font-bold text-rose"
                  : remainingChars < 50
                  ? "text-peach font-semibold"
                  : "text-mauve font-medium"
              }`}
              aria-live="polite"
            >
              {remainingChars} characters remaining
            </span>
          </div>
          <textarea
            id="letter-body"
            required
            rows={6}
            maxLength={600}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-describedby="letter-counter letter-notice"
            placeholder="Write your heartfelt note here..."
            className="mt-1.5 block w-full resize-none rounded-2xl border border-blush bg-paper px-3.5 py-2.5 text-sm text-plum placeholder:text-mauve focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose"
          />
        </div>

        {/* Honest Organizer Notice */}
        <p id="letter-notice" className="text-xs leading-relaxed text-plum bg-paper rounded-xl p-3 border border-blush">
          <strong>Note:</strong> The organizer reads all letters before they are presented to the recipient to ensure everything is perfect.
        </p>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isPending || body.trim().length === 0 || remainingChars < 0}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-rose py-3 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-roseDeep focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? (
            <>
              <div
                className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                aria-hidden="true"
              />
              <span>Sending letter...</span>
            </>
          ) : (
            <>
              <Send className="h-4 w-4" aria-hidden="true" />
              <span>Send Letter</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}

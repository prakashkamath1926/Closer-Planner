"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { forgotPasswordSchema } from "@/lib/auth/validation";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    const validation = forgotPasswordSchema.safeParse({ email });
    if (!validation.success) {
      setErrorMessage(validation.error.issues[0]?.message || "Please enter a valid email address.");
      return;
    }

    startTransition(async () => {
      try {
        const supabase = createClient();
        const origin = typeof window !== "undefined" ? window.location.origin : "";

        // Reset password request
        await supabase.auth.resetPasswordForEmail(validation.data.email, {
          redirectTo: `${origin}/reset-password`,
        });

        // Always show generic success message (no account enumeration)
        setStatusMessage(
          "If an account exists with this email address, we have sent instructions to reset your password. Please check your inbox.",
        );
      } catch {
        // Generic message even on network/provider error
        setStatusMessage(
          "If an account exists with this email address, we have sent instructions to reset your password. Please check your inbox.",
        );
      }
    });
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-md flex-col justify-center px-4 py-12">
      <div className="rounded-3xl border border-blush/80 bg-white p-6 shadow-sm sm:p-8">
        <div className="text-center">
          <h1 className="font-serif text-2xl font-bold text-plum sm:text-3xl">
            Reset your password
          </h1>
          <p className="mt-2 text-sm text-mauve">
            Enter your email and we&apos;ll send you a link to choose a new password
          </p>
        </div>

        {errorMessage && (
          <div
            aria-live="polite"
            className="mt-4 rounded-xl border border-rose/30 bg-blush/30 p-3 text-center text-xs font-medium text-rose-deep"
          >
            {errorMessage}
          </div>
        )}

        {statusMessage && (
          <div
            aria-live="polite"
            className="mt-4 rounded-xl border border-sage/40 bg-sage/20 p-3 text-center text-xs font-medium text-sage-deep"
          >
            {statusMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="forgot-email"
              className="block text-xs font-semibold uppercase tracking-wider text-mauve"
            >
              Email address
            </label>
            <input
              id="forgot-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1.5 w-full rounded-2xl border border-border bg-paper px-4 py-2.5 text-sm text-plum placeholder:text-mauve/70 focus:border-rose focus-visible:outline-2 focus-visible:outline-rose-deep"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-full bg-rose py-3 text-center text-sm font-semibold text-white shadow-sm hover:bg-rose-deep focus-visible:outline-2 focus-visible:outline-rose-deep disabled:opacity-50 transition-colors"
          >
            {isPending ? "Sending reset link..." : "Send reset link"}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-mauve">
          Remembered your password?{" "}
          <Link href="/login" className="font-semibold text-rose-deep hover:underline">
            Return to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition, useSyncExternalStore, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X, Lock, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { upgradeSchema } from "@/lib/auth/validation";

interface SavePlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  occasionId?: string;
  onUpgraded?: () => void;
}

const emptySubscribe = () => () => {};

export function SavePlanModal({ isOpen, onClose, occasionId, onUpgraded }: SavePlanModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isGooglePending, setIsGooglePending] = useState(false);
  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false);

  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen || !isClient) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const validation = upgradeSchema.safeParse({ email, password, fullName });
    if (!validation.success) {
      setErrorMessage(validation.error.issues[0]?.message || "Invalid input");
      return;
    }

    startTransition(async () => {
      try {
        const supabase = createClient();

        // Check current session to ensure user is logged in
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();

        if (!currentUser) {
          setErrorMessage("No active planning session found. Please refresh.");
          return;
        }

        // UPGRADE the anonymous user via secure server API:
        // preserves the exact same auth.uid() and auto-confirms email!
        const res = await fetch("/api/auth/upgrade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: validation.data.email,
            password: validation.data.password,
            fullName: validation.data.fullName,
          }),
        });

        const json = await res.json();
        if (!res.ok) {
          setErrorMessage(json.error || "Failed to save plan with account.");
          return;
        }

        // Establish full password session in browser cookies
        await supabase.auth.signInWithPassword({
          email: validation.data.email,
          password: validation.data.password,
        });

        setIsSuccess(true);
        if (onUpgraded) onUpgraded();
        setTimeout(() => {
          onClose();
          window.location.reload();
        }, 1500);
      } catch {
        setErrorMessage("An unexpected error occurred. Please try again.");
      }
    });
  };

  const handleGoogleLink = async () => {
    try {
      setIsGooglePending(true);
      setErrorMessage(null);
      const supabase = createClient();
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const returnPath = occasionId ? `/plan/${occasionId}` : "/";

      // Initiate Google OAuth with return path and claim param so ownership transfers seamlessly
      const callbackUrl = `${origin}/auth/callback?next=${encodeURIComponent(returnPath)}${
        occasionId ? `&claim=${encodeURIComponent(occasionId)}` : ""
      }`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl,
        },
      });

      if (error) {
        setErrorMessage(error.message || "Could not connect with Google.");
        setIsGooglePending(false);
      }
    } catch {
      setErrorMessage("Could not connect with Google.");
      setIsGooglePending(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-plan-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 overflow-y-auto bg-plum/50 backdrop-blur-xs p-3 sm:p-4"
    >
      <div className="flex min-h-full items-center justify-center py-4">
        <div className="relative my-auto w-full max-w-md rounded-3xl border border-blush bg-white p-5 sm:p-6 text-left shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute right-4 top-4 rounded-full p-2 text-mauve hover:bg-blush hover:text-plum focus-visible:outline-2 focus-visible:outline-rose-deep"
        >
          <X className="size-4" aria-hidden="true" />
        </button>

        <div className="flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-full bg-blush text-rose-deep shrink-0">
            <Lock className="size-3.5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="save-plan-title" className="font-serif text-lg font-bold text-plum sm:text-xl">
              Save your celebration plan
            </h2>
            <p className="text-[11px] text-mauve">
              Keep your tasks, vendors, and schedule permanently safe
            </p>
          </div>
        </div>

        {errorMessage && (
          <div
            aria-live="polite"
            className="mt-3 rounded-xl border border-rose/30 bg-blush/30 p-2.5 text-center text-xs font-medium text-rose-deep"
          >
            <span>{errorMessage}</span>
            {errorMessage.toLowerCase().includes("already exists") && (
              <div className="mt-1">
                <Link
                  href={`/login?next=${encodeURIComponent(occasionId ? `/plan/${occasionId}` : "/")}`}
                  onClick={onClose}
                  className="font-bold underline hover:text-plum"
                >
                  Sign in to your account &rarr;
                </Link>
              </div>
            )}
          </div>
        )}

        {isSuccess && (
          <div
            aria-live="polite"
            className="mt-3 flex items-center gap-2 rounded-xl border border-sage/40 bg-sage/20 p-2.5 text-center text-xs font-medium text-sage-deep"
          >
            <CheckCircle2 className="size-4 text-sage-deep shrink-0" aria-hidden="true" />
            <span>Plan saved! Your account is secured under the same link.</span>
          </div>
        )}

        {!isSuccess && (
          <>
            <button
              type="button"
              onClick={handleGoogleLink}
              disabled={isGooglePending || isPending}
              className="mt-4 flex w-full items-center justify-center gap-2.5 rounded-2xl border border-border bg-white px-4 py-2 text-xs font-semibold text-plum shadow-2xs hover:bg-paper focus-visible:outline-2 focus-visible:outline-rose-deep disabled:opacity-50 transition-colors"
            >
              <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.05h3.9c2.27-2.1 3.645-5.18 3.645-9.14z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.9-3.05c-1.08.72-2.45 1.16-4.03 1.16-3.13 0-5.78-2.11-6.73-4.96H1.23v3.13C3.26 21.36 7.36 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.27 14.24A7.18 7.18 0 0 1 4.89 12c0-.78.14-1.54.38-2.24V6.63H1.23A11.97 11.97 0 0 0 0 12c0 1.92.45 3.74 1.23 5.37l4.04-3.13z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.36 0 3.26 2.64 1.23 6.63l4.04 3.13c.95-2.85 3.6-4.96 6.73-4.96z"
                />
              </svg>
              {isGooglePending ? "Connecting to Google..." : "Save with Google"}
            </button>

            <div className="relative my-3 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <span className="relative bg-white px-2 text-[10px] uppercase tracking-wider text-mauve">
                or set email and password
              </span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-2.5">
              <div>
                <label
                  htmlFor="upgrade-name"
                  className="block text-[11px] font-semibold uppercase tracking-wider text-mauve"
                >
                  Your name (optional)
                </label>
                <input
                  id="upgrade-name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Kavya"
                  className="mt-1 w-full rounded-xl border border-border bg-paper px-3 py-1.5 text-xs text-plum placeholder:text-mauve/70 focus:border-rose focus-visible:outline-2 focus-visible:outline-rose-deep"
                />
              </div>

              <div>
                <label
                  htmlFor="upgrade-email"
                  className="block text-[11px] font-semibold uppercase tracking-wider text-mauve"
                >
                  Email address
                </label>
                <input
                  id="upgrade-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="mt-1 w-full rounded-xl border border-border bg-paper px-3 py-1.5 text-xs text-plum placeholder:text-mauve/70 focus:border-rose focus-visible:outline-2 focus-visible:outline-rose-deep"
                />
              </div>

              <div>
                <label
                  htmlFor="upgrade-password"
                  className="block text-[11px] font-semibold uppercase tracking-wider text-mauve"
                >
                  Password (min. 10 characters)
                </label>
                <input
                  id="upgrade-password"
                  type="password"
                  required
                  minLength={10}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••"
                  className="mt-1 w-full rounded-xl border border-border bg-paper px-3 py-1.5 text-xs text-plum placeholder:text-mauve/70 focus:border-rose focus-visible:outline-2 focus-visible:outline-rose-deep"
                />
              </div>

              <div className="pt-1.5">
                <button
                  type="submit"
                  disabled={isPending || isGooglePending}
                  className="w-full rounded-full bg-rose py-2 text-center text-xs font-semibold text-white shadow-xs hover:bg-rose-deep focus-visible:outline-2 focus-visible:outline-rose-deep disabled:opacity-50 transition-colors"
                >
                  {isPending ? "Securing plan..." : "Save plan"}
                </button>
              </div>

              <p className="mt-2.5 text-center text-xs text-mauve">
                Already have an account?{" "}
                <Link
                  href={`/login?next=${encodeURIComponent(occasionId ? `/plan/${occasionId}` : "/")}`}
                  onClick={onClose}
                  className="font-semibold text-rose hover:underline"
                >
                  Sign in
                </Link>
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  </div>,
  document.body,
);
}

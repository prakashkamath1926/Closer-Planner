"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { resetPasswordSchema } from "@/lib/auth/validation";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const validation = resetPasswordSchema.safeParse({ password, confirmPassword });
    if (!validation.success) {
      setErrorMessage(validation.error.issues[0]?.message || "Passwords do not match");
      return;
    }

    startTransition(async () => {
      try {
        const supabase = createClient();
        const { error } = await supabase.auth.updateUser({
          password: validation.data.password,
        });

        if (error) {
          setErrorMessage("Failed to update password. Please request a new reset link.");
          return;
        }

        setIsSuccess(true);
        setTimeout(() => {
          router.push("/login");
        }, 2000);
      } catch {
        setErrorMessage("An unexpected error occurred while resetting your password.");
      }
    });
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-md flex-col justify-center px-4 py-12">
      <div className="rounded-3xl border border-blush/80 bg-white p-6 shadow-sm sm:p-8">
        <div className="text-center">
          <h1 className="font-serif text-2xl font-bold text-plum sm:text-3xl">
            Choose a new password
          </h1>
          <p className="mt-2 text-sm text-mauve">
            Enter your new secure password (at least 10 characters)
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

        {isSuccess && (
          <div
            aria-live="polite"
            className="mt-4 rounded-xl border border-sage/40 bg-sage/20 p-3 text-center text-xs font-medium text-sage-deep"
          >
            Password updated successfully! Redirecting you to sign in...
          </div>
        )}

        {!isSuccess && (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="reset-new-password"
                className="block text-xs font-semibold uppercase tracking-wider text-mauve"
              >
                New password
              </label>
              <input
                id="reset-new-password"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                className="mt-1.5 w-full rounded-2xl border border-border bg-paper px-4 py-2.5 text-sm text-plum placeholder:text-mauve/70 focus:border-rose focus-visible:outline-2 focus-visible:outline-rose-deep"
              />
            </div>

            <div>
              <label
                htmlFor="reset-confirm-password"
                className="block text-xs font-semibold uppercase tracking-wider text-mauve"
              >
                Confirm new password
              </label>
              <input
                id="reset-confirm-password"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••"
                className="mt-1.5 w-full rounded-2xl border border-border bg-paper px-4 py-2.5 text-sm text-plum placeholder:text-mauve/70 focus:border-rose focus-visible:outline-2 focus-visible:outline-rose-deep"
              />
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-full bg-rose py-3 text-center text-sm font-semibold text-white shadow-sm hover:bg-rose-deep focus-visible:outline-2 focus-visible:outline-rose-deep disabled:opacity-50 transition-colors"
            >
              {isPending ? "Updating password..." : "Update password"}
            </button>
          </form>
        )}

        <div className="mt-6 text-center text-xs text-mauve">
          <Link href="/login" className="font-semibold text-rose-deep hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

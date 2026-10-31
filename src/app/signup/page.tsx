"use client";

import { useState, useTransition, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { signupSchema } from "@/lib/auth/validation";
import { validateNextParam } from "@/lib/auth/redirect";
import { APP_NAME } from "@/lib/brand";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = validateNextParam(searchParams.get("next"), "/");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isGooglePending, setIsGooglePending] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessNotice(null);

    const formData = new FormData(e.currentTarget);
    const nameVal = (formData.get("fullName") as string) || fullName;
    const emailVal = (formData.get("email") as string) || email;
    const passVal = (formData.get("password") as string) || password;

    const validation = signupSchema.safeParse({
      fullName: nameVal,
      email: emailVal,
      password: passVal,
    });
    if (!validation.success) {
      setErrorMessage(validation.error.issues[0]?.message || "Invalid input");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName: validation.data.fullName,
            email: validation.data.email,
            password: validation.data.password,
          }),
        });

        const json = await res.json();
        if (!res.ok) {
          setErrorMessage(json.error || "Unable to create account. Please try again.");
          return;
        }

        // Sign in immediately to establish session in browser cookies
        const supabase = createClient();
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: validation.data.email,
          password: validation.data.password,
        });

        if (signInError) {
          setErrorMessage("Account created! Please sign in with your credentials.");
          router.push(`/login?next=${encodeURIComponent(nextParam)}`);
          return;
        }

        router.push(nextParam);
        router.refresh();
      } catch {
        setErrorMessage("An unexpected error occurred. Please try again.");
      }
    });
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsGooglePending(true);
      setErrorMessage(null);
      const supabase = createClient();
      const origin = typeof window !== "undefined" ? window.location.origin : "";

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextParam)}`,
        },
      });

      if (error) {
        setErrorMessage("Could not connect to Google. Please try again.");
        setIsGooglePending(false);
      }
    } catch {
      setErrorMessage("Could not initiate Google sign in.");
      setIsGooglePending(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-md flex-col justify-center px-4 py-12">
      <div className="rounded-3xl border border-blush/80 bg-white p-6 shadow-sm sm:p-8">
        <div className="text-center">
          <h1 className="font-serif text-2xl font-bold text-plum sm:text-3xl">
            Join {APP_NAME}
          </h1>
          <p className="mt-2 text-sm text-mauve">
            Plan heartfelt celebrations and bring people closer
          </p>
        </div>

        {errorMessage && (
          <div
            id="auth-error-alert"
            role="alert"
            aria-live="assertive"
            className="mt-4 rounded-xl border border-rose/30 bg-blush/30 p-3 text-center text-xs font-medium text-rose-deep"
          >
            <span>{errorMessage}</span>
            {errorMessage.toLowerCase().includes("already exists") && (
              <div className="mt-1">
                <Link
                  href={`/login?next=${encodeURIComponent(nextParam)}`}
                  className="font-bold underline hover:text-plum"
                >
                  Sign in to your account &rarr;
                </Link>
              </div>
            )}
          </div>
        )}

        {successNotice && (
          <div
            aria-live="polite"
            className="mt-4 rounded-xl border border-sage/40 bg-sage/20 p-3 text-center text-xs font-medium text-sage-deep"
          >
            {successNotice}
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isGooglePending || isPending}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl border border-border bg-white px-4 py-3 text-sm font-semibold text-plum shadow-2xs hover:bg-paper focus-visible:outline-2 focus-visible:outline-rose-deep disabled:opacity-50 transition-colors"
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
          {isGooglePending ? "Connecting to Google..." : "Continue with Google"}
        </button>

        <div className="relative my-6 flex items-center justify-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <span className="relative bg-white px-3 text-xs uppercase tracking-wider text-mauve">
            or with email
          </span>
        </div>

        <form onSubmit={handleSubmit} noValidate action="#" method="post" className="space-y-4">
          <div>
            <label
              htmlFor="fullName"
              className="block text-xs font-semibold uppercase tracking-wider text-mauve"
            >
              Your name
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              required
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Kavya Patel"
              className="mt-1.5 w-full rounded-2xl border border-border bg-paper px-4 py-2.5 text-sm text-plum placeholder:text-mauve/70 focus:border-rose focus-visible:outline-2 focus-visible:outline-rose-deep"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-xs font-semibold uppercase tracking-wider text-mauve"
            >
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1.5 w-full rounded-2xl border border-border bg-paper px-4 py-2.5 text-sm text-plum placeholder:text-mauve/70 focus:border-rose focus-visible:outline-2 focus-visible:outline-rose-deep"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-semibold uppercase tracking-wider text-mauve"
            >
              Password (min. 10 characters)
            </label>
            <input
              id="password"
              name="password"
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

          <button
            type="submit"
            disabled={isPending || isGooglePending}
            className="w-full rounded-full bg-rose py-3 text-center text-sm font-semibold text-white shadow-sm hover:bg-rose-deep focus-visible:outline-2 focus-visible:outline-rose-deep disabled:opacity-50 transition-colors"
          >
            {isPending ? "Creating account..." : "Create account"}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-mauve">
          Already have an account?{" "}
          <Link
            href={`/login?next=${encodeURIComponent(nextParam)}`}
            className="font-semibold text-rose-deep hover:underline"
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-md items-center justify-center p-6 text-sm text-mauve">
          Loading sign up...
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}

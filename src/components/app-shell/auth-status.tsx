"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, User } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import type { User as SupabaseUser } from "@supabase/supabase-js";

export function AuthStatus() {
  const router = useRouter();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    try {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data: { user } }) => {
        setUser(user);
      });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
      });

      return () => {
        subscription.unsubscribe();
      };
    } catch {
      // Fallback if browser supabase client not yet initialized
    }
  }, []);

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/");
      router.refresh();
    } catch {
      // Ignore
    } finally {
      setIsSigningOut(false);
    }
  };

  // If user is authenticated and NOT anonymous, show user details & Sign out
  if (user && !user.is_anonymous) {
    const displayName =
      user.user_metadata?.full_name ||
      user.email?.split("@")[0] ||
      "Account";

    return (
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5 text-xs font-medium text-plum">
          <User className="size-3.5 text-mauve" aria-hidden="true" />
          <span className="max-w-[120px] truncate">{displayName}</span>
        </span>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={isSigningOut}
          aria-label="Sign out of account"
          className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-semibold text-mauve hover:bg-blush hover:text-plum focus-visible:outline-2 focus-visible:outline-rose-deep disabled:opacity-50 transition-colors"
        >
          <LogOut className="size-3.5" aria-hidden="true" />
          <span>{isSigningOut ? "Signing out..." : "Sign out"}</span>
        </button>
      </div>
    );
  }

  // Otherwise show Sign in link
  return (
    <Link
      href="/login"
      className="inline-flex items-center rounded-2xl border border-border bg-white px-3.5 py-1.5 text-xs font-semibold text-plum shadow-2xs hover:bg-blush focus-visible:outline-2 focus-visible:outline-rose-deep transition-colors"
    >
      Sign in
    </Link>
  );
}


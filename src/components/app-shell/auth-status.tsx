"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { navLinkClasses, signOutLinkClasses } from "./nav-links";
import { SavePlanModal } from "@/components/auth/save-plan-modal";

export function AuthStatus() {
  const router = useRouter();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);

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

  // 1. Signed-in permanent user (saved account)
  if (user && !user.is_anonymous) {
    const rawName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      "";
    const firstName = rawName.trim()
      ? rawName.trim().split(/\s+/)[0]
      : (user.email?.split("@")[0] || "Friend");
    const initial = (firstName[0] || "U").toUpperCase();

    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-2 text-sm font-medium text-plum">
          <span
            className="grid size-7 place-items-center rounded-full bg-blush text-xs font-semibold text-rose-deep shrink-0 select-none"
            aria-hidden="true"
          >
            {initial}
          </span>
          <span className="max-w-[120px] truncate">{firstName}</span>
        </span>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={isSigningOut}
          aria-label="Sign out of account"
          className={signOutLinkClasses}
        >
          {isSigningOut ? "Signing out..." : "Sign out"}
        </button>
      </div>
    );
  }

  // 2. Anonymous session (unsaved plan)
  if (user?.is_anonymous) {
    return (
      <>
        <div className="flex items-center gap-1">
          <Link href="/login" className={navLinkClasses}>
            Sign in
          </Link>
          <button
            type="button"
            onClick={() => setShowSaveModal(true)}
            className={navLinkClasses}
          >
            Save your plan
          </button>
        </div>
        <SavePlanModal
          isOpen={showSaveModal}
          onClose={() => setShowSaveModal(false)}
        />
      </>
    );
  }

  // 3. Completely unauthenticated guest
  return (
    <Link href="/login" className={navLinkClasses}>
      Sign in
    </Link>
  );
}


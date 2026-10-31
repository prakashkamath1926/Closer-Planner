"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import {
  navLinkClasses,
  signOutLinkClasses,
  compactPrimaryButtonClasses,
} from "./nav-links";
import { SavePlanModal } from "@/components/auth/save-plan-modal";

/** Normalises name for display (first letter capital, rest lower) in pure code */
function normalizeName(name: string): string {
  if (!name) return "";
  const cleaned = name.trim();
  if (!cleaned) return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

export function AuthStatus() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);

  const occasionId = pathname?.startsWith("/plan/") ? pathname.split("/")[2] : undefined;

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
    const rawFirstName = rawName.trim()
      ? rawName.trim().split(/\s+/)[0]
      : (user.email?.split("@")[0] || "Friend");
    const normalizedFirstName = normalizeName(rawFirstName);
    const initial = (normalizedFirstName[0] || "U").toUpperCase();

    return (
      <div className="flex items-center gap-2">
        <Link href="/plans" className={navLinkClasses}>
          My plans
        </Link>
        <span
          role="img"
          aria-label={`Signed in as ${normalizedFirstName}`}
          title={`Signed in as ${normalizedFirstName}`}
          className="grid size-7 place-items-center rounded-full bg-blush text-xs font-semibold text-rose-deep shrink-0 select-none cursor-default"
        >
          {initial}
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
        <div className="flex items-center gap-2">
          <Link href="/plans" className={navLinkClasses}>
            My plans
          </Link>
          <Link href="/login" className={navLinkClasses}>
            Sign in
          </Link>
          <button
            type="button"
            onClick={() => setShowSaveModal(true)}
            className={compactPrimaryButtonClasses}
          >
            Save your plan
          </button>
        </div>
        <SavePlanModal
          isOpen={showSaveModal}
          onClose={() => setShowSaveModal(false)}
          occasionId={occasionId}
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

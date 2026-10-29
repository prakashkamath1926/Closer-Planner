"use client";

/**
 * Anonymous session bootstrapper — client component.
 *
 * Ensures an anonymous Supabase session is established on first visit so
 * every visitor gets a real auth.uid() that Row-Level Security (RLS) can act on.
 * Uses the browser client to persist the session directly in browser cookies.
 */
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/browser";

export function SessionBootstrapper() {
  useEffect(() => {
    try {
      const supabase = createClient();
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) {
          supabase.auth.signInAnonymously().catch((err) => {
            console.warn("Client anonymous session initialization:", err);
          });
        }
      });
    } catch (e) {
      console.warn("Session bootstrapper error:", e);
    }
  }, []);

  return null;
}

/**
 * Browser (client-side) Supabase client.
 *
 * Uses @supabase/ssr's createBrowserClient which persists the auth session in
 * cookies so it survives hard reloads and SSR re-renders.
 *
 * Only import this in Client Components ("use client").
 * Server Components must use src/lib/supabase/server.ts instead.
 */
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { getPublicEnv } from "@/lib/env";

/**
 * Returns a Supabase client bound to the browser's cookie store.
 *
 * Calling this multiple times per render is safe — each call returns a new
 * instance but they share the same cookie-backed session.
 */
export function createClient() {
  const env = getPublicEnv();
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

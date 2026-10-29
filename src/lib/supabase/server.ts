/**
 * Server-side Supabase client (cookie-based, @supabase/ssr).
 *
 * This client reads and writes the auth session from Next.js server-side
 * cookies, so it correctly reflects the anonymous (or signed-in) user and
 * allows RLS policies to fire on behalf of that user.
 *
 * Use this in:
 *   - Server Components
 *   - Route Handlers (app/api/*)
 *   - Server Actions
 *
 * Never use the admin (service-role) client for ordinary owner reads/writes;
 * those must go through this client so RLS applies.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { getPublicEnv } from "@/lib/env";

/**
 * Creates a Supabase client for server-side usage.
 *
 * Must be called inside a request-time context (Server Component, Route
 * Handler, Server Action). Not suitable for `use cache` scopes or the static
 * shell, because it reads cookies() which is a request-time API.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const env = getPublicEnv();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll() is called from Server Components where cookies() is
            // read-only. The session will still be refreshed on the next
            // Route Handler or Server Action call.
          }
        },
      },
    },
  );
}

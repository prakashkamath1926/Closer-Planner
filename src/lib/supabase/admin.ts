/**
 * Admin (service-role) Supabase client.
 *
 * SECURITY NOTICE: This client bypasses Row Level Security (RLS).
 * It is restricted to server-only modules via the "server-only" package.
 * The service-role key never reaches the browser or client bundle.
 *
 * Permitted uses (see architecture.md):
 *   - Rate limiting via rate_limit_hit() (Task 4)
 *   - Recipient/share token validation (Task 6)
 *   - Friend answer routes (Task 10)
 *
 * NEVER use this for ordinary owner reads/writes. Use the cookie-based
 * server client (server.ts) so that RLS policies apply.
 */
import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getPublicEnv, parseServerEnv } from "@/lib/env";

// ---------------------------------------------------------------------------
// Lazy singletons — env and client are parsed/created on first call.
// This prevents build-time failures when .env.local is absent.
// ---------------------------------------------------------------------------
let _serverEnv: ReturnType<typeof parseServerEnv> | undefined;

function getServerEnv() {
  if (_serverEnv) return _serverEnv;
  _serverEnv = parseServerEnv();
  return _serverEnv;
}

/**
 * Singleton admin client. Reusing the same instance per process avoids
 * excessive GoTrue connections in serverless environments.
 */
let _adminClient: ReturnType<typeof createSupabaseClient<Database>> | null =
  null;

/**
 * Returns the Supabase admin client (service role, bypasses RLS).
 *
 * Only call this from server-only modules for the use-cases listed above.
 */
export function createAdminClient() {
  if (_adminClient) return _adminClient;

  const publicEnv = getPublicEnv();
  const serverEnv = getServerEnv();

  _adminClient = createSupabaseClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        // The admin client manages no user sessions; disable session persistence
        // and auto-refresh to keep it stateless.
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );

  return _adminClient;
}

/**
 * Returns server-only env values for use in other server-only modules.
 * Throws at call time if required variables are missing.
 */
export function getAdminEnv() {
  const serverEnv = getServerEnv();
  return {
    appBaseUrl: serverEnv.APP_BASE_URL,
    googleGenerativeAiApiKey: serverEnv.GOOGLE_GENERATIVE_AI_API_KEY,
    groqApiKey: serverEnv.GROQ_API_KEY,
  } as const;
}

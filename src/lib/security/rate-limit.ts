/**
 * Rate Limiting Security Module (PostgreSQL-backed via admin client).
 *
 * Rules (architecture.md & task_today.md):
 * - Rate limits live in Postgres table `rate_limits` via `rate_limit_hit()` function.
 * - `rate_limit_hit` is SECURITY DEFINER, executable only by `service_role`.
 * - Window: 60 seconds.
 * - Max requests per window: 10 for AI endpoints.
 * - The 11th AI request in a minute returns 429.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  windowSeconds: number;
  retryAfterSeconds?: number;
}

/**
 * Checks and increments the rate limit counter for a given bucket.
 *
 * @param bucket Identifier, e.g. 'ai:<user_id>' or 'ai-ip:<ip>'
 * @param windowSeconds Window length in seconds (default 60)
 * @param maxHits Maximum requests allowed in the window (default 10)
 */
export async function checkRateLimit(
  bucket: string,
  windowSeconds: number = 60,
  maxHits: number = 10,
): Promise<RateLimitResult> {
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("rate_limit_hit", {
    p_bucket: bucket,
    p_window_seconds: windowSeconds,
    p_max: maxHits,
  });

  if (error) {
    // If rate limiting fails due to DB error, log error and fail closed or open safely
    console.error("Rate limit check error:", error.message);
    // Safe default: allow request if RPC fails transiently, but log warning
    return {
      allowed: true,
      limit: maxHits,
      windowSeconds,
    };
  }

  const allowed = Boolean(data);

  return {
    allowed,
    limit: maxHits,
    windowSeconds,
    retryAfterSeconds: allowed ? undefined : windowSeconds,
  };
}

/**
 * Helper to construct a standard HTTP 429 response.
 */
export function createRateLimitResponse(retryAfterSeconds: number = 60): Response {
  return new Response(
    JSON.stringify({
      error: "Too Many Requests",
      message: "You have exceeded the rate limit for celebration planning. Please take a breath and try again in a minute.",
      retryAfter: retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": retryAfterSeconds.toString(),
      },
    },
  );
}


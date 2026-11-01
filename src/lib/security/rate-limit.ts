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

interface MemoryBucket {
  count: number;
  resetAt: number;
}

const memoryRateLimitMap = new Map<string, MemoryBucket>();

function checkInMemoryFallback(
  bucket: string,
  windowSeconds: number,
  maxHits: number,
): RateLimitResult {
  const now = Date.now();
  const entry = memoryRateLimitMap.get(bucket);

  if (!entry || now >= entry.resetAt) {
    memoryRateLimitMap.set(bucket, { count: 1, resetAt: now + windowSeconds * 1000 });
    return {
      allowed: true,
      limit: maxHits,
      windowSeconds,
    };
  }

  if (entry.count < maxHits) {
    entry.count += 1;
    return {
      allowed: true,
      limit: maxHits,
      windowSeconds,
    };
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  return {
    allowed: false,
    limit: maxHits,
    windowSeconds,
    retryAfterSeconds,
  };
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
    const isAiBucket = bucket.startsWith("ai:") || bucket.startsWith("ai-ip:");
    // Log metadata only (never user payload or credentials)
    console.error(
      `[RateLimit DB Error] bucket_type=${isAiBucket ? "ai" : "non-ai"} limit=${maxHits} error="${error.message || "Unknown"}"`,
    );

    if (isAiBucket) {
      // Conservative in-memory fallback for AI routes: never allow unlimited traffic
      return checkInMemoryFallback(bucket, windowSeconds, maxHits);
    }

    // Safe default for non-AI routes: fail open
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


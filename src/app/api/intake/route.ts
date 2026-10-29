/**
 * POST /api/intake
 *
 * Rules:
 * - Rate limited via Postgres `rate_limit_hit('ai:<user_id>', 60, 10)`.
 * - The 11th request in a minute returns HTTP 429.
 * - Input parsed with Zod `intakeRequestSchema`.
 * - Calls `proposeIdeas` and returns 3 curated ideas.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, createRateLimitResponse } from "@/lib/security/rate-limit";
import { intakeRequestSchema } from "@/lib/ai/schemas";
import { proposeIdeas } from "@/lib/ai/orchestrator";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Use user ID if signed in (anonymous or permanent), else IP fallback
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "anonymous-ip";
    const bucket = user ? `ai:${user.id}` : `ai-ip:${ip}`;

    // Rate limit check: 10 requests per 60 seconds
    const rateLimit = await checkRateLimit(bucket, 60, 10);
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit.retryAfterSeconds || 60);
    }

    const body = await req.json();
    const parseResult = intakeRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Invalid intake request",
          details: parseResult.error.issues,
        },
        { status: 400 },
      );
    }

    const ideasResponse = await proposeIdeas(parseResult.data);

    return NextResponse.json({
      success: true,
      ideas: ideasResponse.ideas,
      generalWhy: ideasResponse.generalWhy,
      source: ideasResponse.source || "ai",
    });
  } catch (error) {
    console.error("Intake route error:", error);
    return NextResponse.json(
      { error: "Internal server error during celebration planning" },
      { status: 500 },
    );
  }
}


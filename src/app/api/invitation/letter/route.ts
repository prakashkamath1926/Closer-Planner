import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, createRateLimitResponse } from "@/lib/security/rate-limit";
import { parseJsonBody } from "@/lib/security/request";
import { getLetterHelper } from "@/lib/ai/orchestrator";

const letterHelperRequestSchema = z.object({
  recipientName: z.string().min(1).max(100),
  relationship: z.string().max(80).optional(),
  occasionType: z.string().min(1).max(80),
  intentSummary: z.string().max(300).optional(),
});

/**
 * POST /api/invitation/letter
 * Returns structured prompts and sentence starters for the organizer to draft their personal letter.
 * Rate limited; provides labelled deterministic fallback if AI is unavailable.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const rateLimit = await checkRateLimit(`ai:${user.id}`, 60, 10);
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit.retryAfterSeconds ?? 60);
    }

    const jsonResult = await parseJsonBody(req);
    if (!jsonResult.success) {
      return jsonResult.response;
    }
    const body = jsonResult.data;
    const parsed = letterHelperRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid letter helper request", details: parsed.error.format() },
        { status: 400 },
      );
    }

    const result = await getLetterHelper(parsed.data);

    return NextResponse.json({
      success: true,
      structureOutline: result.structureOutline,
      suggestedClosing: result.suggestedClosing,
      source: result.source,
    });
  } catch {
    return NextResponse.json({ error: "Failed to generate letter prompts" }, { status: 500 });
  }
}


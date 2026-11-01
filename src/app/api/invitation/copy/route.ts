import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, createRateLimitResponse } from "@/lib/security/rate-limit";
import { parseJsonBody } from "@/lib/security/request";
import { generateInvitationCopy } from "@/lib/ai/orchestrator";
import { extractByokFromHeaders } from "@/lib/ai/router";

const invitationCopyRequestSchema = z.object({
  recipientName: z.string().min(1).max(100),
  occasionType: z.string().min(1).max(80),
  intentSummary: z.string().max(300).optional(),
});

/**
 * POST /api/invitation/copy
 * Generates concise, warm invitation copy from approved recipient fields only.
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
    const parsed = invitationCopyRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid invitation copy request", details: parsed.error.format() },
        { status: 400 },
      );
    }

    const byok = extractByokFromHeaders(req.headers);
    const copy = await generateInvitationCopy(parsed.data, { byok });

    return NextResponse.json({
      success: true,
      copy,
    });
  } catch {
    return NextResponse.json({ error: "Failed to generate invitation copy" }, { status: 500 });
  }
}


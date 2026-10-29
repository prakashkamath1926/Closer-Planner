import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, createRateLimitResponse } from "@/lib/security/rate-limit";
import { getVendorQuestions } from "@/lib/ai/orchestrator";

const questionsRequestSchema = z.object({
  category: z.string().min(1).max(80),
  occasionType: z.string().max(80).default("celebration"),
});

/**
 * POST /api/vendors/questions: Returns tailored questions to ask a vendor for a given category.
 * Rate limited and provides labelled template fallback if AI is unavailable.
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

    const body = await req.json();
    const parsed = questionsRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid questions request", details: parsed.error.format() },
        { status: 400 },
      );
    }

    const { category, occasionType } = parsed.data;
    const result = await getVendorQuestions(category, occasionType);

    return NextResponse.json({
      category: result.category,
      questions: result.questions,
      source: result.source,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


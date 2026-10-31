import { NextRequest, NextResponse, connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateBlendQuestions } from "@/lib/ai/orchestrator";

/**
 * GET /api/blend/questions?occasionId=...
 * Generates dynamic AI questions tailored specifically to the occasion's prompt,
 * recipient, intent, and concept.
 */
export async function GET(req: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const occasionId = searchParams.get("occasionId");

    if (!occasionId) {
      return NextResponse.json({ error: "occasionId is required" }, { status: 400 });
    }

    // Fetch occasion under RLS
    const { data: occasion, error: occasionError } = await supabase
      .from("occasions")
      .select("id, title, occasion_type, recipient_name, intent_summary, guest_count")
      .eq("id", occasionId)
      .single();

    if (occasionError || !occasion) {
      return NextResponse.json({ error: "Occasion not found" }, { status: 404 });
    }

    // Fetch recipient facts / interests if present
    const { data: facts } = await supabase
      .from("recipient_facts")
      .select("fact_key, fact_value")
      .eq("occasion_id", occasionId);

    const knownInterests = (facts || []).map((f) => f.fact_value);

    const questions = await generateBlendQuestions({
      occasionType: occasion.occasion_type || occasion.title || "Celebration",
      recipientName: occasion.recipient_name || undefined,
      intentSummary: occasion.intent_summary || undefined,
      concept: occasion.title || undefined,
      knownInterests: knownInterests.length > 0 ? knownInterests : undefined,
      guestCount: occasion.guest_count || undefined,
    });

    return NextResponse.json({ questions });
  } catch (err: unknown) {
    console.error("Failed to generate blend questions:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


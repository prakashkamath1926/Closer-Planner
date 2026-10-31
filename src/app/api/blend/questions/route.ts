import { NextRequest, NextResponse, connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateBlendQuestions } from "@/lib/ai/orchestrator";
import { extractByokFromHeaders } from "@/lib/ai/router";

/**
 * GET /api/blend/questions?occasionId=...
 * Generates dynamic AI questions tailored specifically to the occasion's prompt,
 * recipient, intent, and concept.
 */
export async function GET(req: NextRequest) {
  await connection();
  try {
    const { searchParams } = new URL(req.url);
    const occasionId = searchParams.get("occasionId");

    if (!occasionId) {
      return NextResponse.json({ error: "occasionId is required" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let occasion: {
      id: string;
      title: string;
      occasion_type: string | null;
      recipient_name: string | null;
      intent_summary: string | null;
      guest_count: number | null;
    } | null = null;

    if (user) {
      const { data } = await supabase
        .from("occasions")
        .select("id, title, occasion_type, recipient_name, intent_summary, guest_count")
        .eq("id", occasionId)
        .single();
      occasion = data;
    }

    // If unauthenticated / collaborator without session, read public metadata via admin client
    if (!occasion) {
      const admin = createAdminClient();
      const { data } = await admin
        .from("occasions")
        .select("id, title, occasion_type, recipient_name, intent_summary, guest_count")
        .eq("id", occasionId)
        .single();
      occasion = data;
    }

    if (!occasion) {
      return NextResponse.json({ error: "Occasion not found" }, { status: 404 });
    }

    // Fetch recipient facts / interests if present
    const admin = createAdminClient();
    const { data: facts } = await admin
      .from("recipient_facts")
      .select("fact_key, fact_value")
      .eq("occasion_id", occasionId);

    const knownInterests = (facts || []).map((f) => f.fact_value);

    const byok = extractByokFromHeaders(req.headers);
    const questions = await generateBlendQuestions(
      {
        occasionType: occasion.occasion_type || occasion.title || "Celebration",
        recipientName: occasion.recipient_name || undefined,
        intentSummary: occasion.intent_summary || undefined,
        concept: occasion.title || undefined,
        knownInterests: knownInterests.length > 0 ? knownInterests : undefined,
        guestCount: occasion.guest_count || undefined,
      },
      { byok },
    );

    return NextResponse.json({ questions });
  } catch (err: unknown) {
    console.error("Failed to generate blend questions:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/blend/questions
 * Directly generates dynamic AI questions from client occasion details.
 */
export async function POST(req: NextRequest) {
  await connection();
  try {
    const body = await req.json();
    const { occasionType, recipientName, intentSummary, concept, knownInterests, guestCount } = body;

    const byok = extractByokFromHeaders(req.headers);
    const questions = await generateBlendQuestions(
      {
        occasionType: occasionType || "Celebration",
        recipientName: recipientName || undefined,
        intentSummary: intentSummary || undefined,
        concept: concept || undefined,
        knownInterests: Array.isArray(knownInterests) ? knownInterests : undefined,
        guestCount: guestCount ? Number(guestCount) : undefined,
      },
      { byok },
    );

    return NextResponse.json({ questions });
  } catch (err: unknown) {
    console.error("Failed to generate blend questions from POST:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


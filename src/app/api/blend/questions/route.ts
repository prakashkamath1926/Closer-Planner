import { NextRequest, NextResponse, connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateBlendQuestions } from "@/lib/ai/orchestrator";
import { extractByokFromHeaders } from "@/lib/ai/router";
import { checkRateLimit, createRateLimitResponse } from "@/lib/security/rate-limit";
import { hashShareToken, isValidTokenFormat } from "@/lib/engine/shield";

/**
 * GET /api/blend/questions?occasionId=...&token=...
 * Generates dynamic AI questions tailored specifically to the occasion's prompt,
 * recipient, intent, and concept.
 *
 * Rules:
 * - Allowed ONLY if (a) the session user owns the occasion (RLS client), or
 *   (b) a valid unexpired, unrevoked share_links token matches the occasion.
 * - Everything else returns generic 404: { error: "Not found" }.
 * - Rate limited identically to other AI routes (10 req/min).
 */
export async function GET(req: NextRequest) {
  await connection();
  try {
    const { searchParams } = new URL(req.url);
    const occasionId = searchParams.get("occasionId");
    const rawToken = searchParams.get("token") || req.headers.get("x-share-token");

    if (!occasionId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // AI rate limiting (10 req / 60 sec)
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "anonymous-ip";
    const bucket = user ? `ai:${user.id}` : `ai-ip:${ip}`;
    const rateLimit = await checkRateLimit(bucket, 60, 10);
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit.retryAfterSeconds || 60);
    }

    let isAuthorized = false;
    let occasion: {
      id: string;
      title: string;
      occasion_type: string | null;
      recipient_name: string | null;
      intent_summary: string | null;
      guest_count: number | null;
    } | null = null;

    // Check (a): Session user owns the occasion via RLS-bound client
    if (user) {
      const { data } = await supabase
        .from("occasions")
        .select("id, title, occasion_type, recipient_name, intent_summary, guest_count")
        .eq("id", occasionId)
        .single();
      if (data) {
        occasion = data;
        isAuthorized = true;
      }
    }

    // Check (b): Valid unexpired, unrevoked share_links token for this occasion
    if (!isAuthorized && rawToken && isValidTokenFormat(rawToken)) {
      const tokenHash = hashShareToken(rawToken);
      const admin = createAdminClient();
      const { data: link } = await admin
        .from("share_links")
        .select("occasion_id, role, kind, expires_at, revoked_at")
        .eq("token_hash", tokenHash)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (link && link.occasion_id === occasionId && (link.role === "friend" || link.role === "recipient")) {
        isAuthorized = true;
      }
    }

    // Unauthorized or invalid occasion -> generic 404
    if (!isAuthorized) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // If authorized via token, load occasion metadata with admin client
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
      return NextResponse.json({ error: "Not found" }, { status: 404 });
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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // AI rate limiting (10 req / 60 sec)
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "anonymous-ip";
    const bucket = user ? `ai:${user.id}` : `ai-ip:${ip}`;
    const rateLimit = await checkRateLimit(bucket, 60, 10);
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit.retryAfterSeconds || 60);
    }

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


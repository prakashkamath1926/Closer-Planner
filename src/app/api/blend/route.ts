import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { calculateBlendScore, AnswerEntry } from "@/lib/engine/blend";

const saveBlendSchema = z.object({
  occasionId: z.string().uuid(),
  friendLabel: z.string().min(1).max(80),
  organizerAnswers: z.array(
    z.object({
      questionKey: z.string().min(1),
      answer: z.string().min(1),
    }),
  ),
  friendAnswers: z.array(
    z.object({
      questionKey: z.string().min(1),
      answer: z.string().min(1),
    }),
  ),
});

/**
 * GET /api/blend?occasionId=...
 * Reads pre-event Blend session and answers under RLS.
 */
export async function GET(req: NextRequest) {
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

    // 1. Fetch pre session under RLS
    const { data: session, error: sessionError } = await supabase
      .from("blend_sessions")
      .select("id")
      .eq("occasion_id", occasionId)
      .eq("stage", "pre")
      .maybeSingle();

    if (sessionError) {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (!session) {
      return NextResponse.json({
        hasSession: false,
        organizerAnswers: [],
        friendAnswers: [],
        friendLabel: "trusted friend",
      });
    }

    // 2. Fetch answers
    const { data: answers, error: answersError } = await supabase
      .from("blend_answers")
      .select("respondent_role, respondent_label, question_key, answer")
      .eq("session_id", session.id);

    if (answersError) {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    const orgAnswers: AnswerEntry[] = [];
    const friendAnswers: AnswerEntry[] = [];
    let friendLabel = "trusted friend";

    for (const a of answers || []) {
      if (a.respondent_role === "organizer") {
        orgAnswers.push({ questionKey: a.question_key, answer: a.answer });
      } else if (a.respondent_role === "friend") {
        friendAnswers.push({ questionKey: a.question_key, answer: a.answer });
        if (a.respondent_label) {
          friendLabel = a.respondent_label;
        }
      }
    }

    const blendResult = calculateBlendScore(orgAnswers, friendAnswers, friendLabel);

    return NextResponse.json({
      hasSession: true,
      organizerAnswers: orgAnswers,
      friendAnswers,
      friendLabel,
      blendResult,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/blend
 * Saves organizer answers and manually entered friend answers under RLS.
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

    const body = await req.json();
    const parsed = saveBlendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid blend payload", details: parsed.error.format() },
        { status: 400 },
      );
    }

    const { occasionId, friendLabel, organizerAnswers, friendAnswers } = parsed.data;

    // 1. Ensure blend_session exists under RLS
    let sessionId: string;
    const { data: existingSession } = await supabase
      .from("blend_sessions")
      .select("id")
      .eq("occasion_id", occasionId)
      .eq("stage", "pre")
      .maybeSingle();

    if (existingSession) {
      sessionId = existingSession.id;
    } else {
      const { data: newSession, error: createError } = await supabase
        .from("blend_sessions")
        .insert({
          occasion_id: occasionId,
          stage: "pre",
        })
        .select("id")
        .single();

      if (createError || !newSession) {
        return NextResponse.json({ error: "Failed to create blend session" }, { status: 403 });
      }
      sessionId = newSession.id;
    }

    // 2. Clear old answers for session to ensure clean sync
    await supabase.from("blend_answers").delete().eq("session_id", sessionId);

    // 3. Prepare answer rows
    const rows: Array<{
      session_id: string;
      respondent_role: "organizer" | "friend";
      respondent_label: string | null;
      question_key: string;
      answer: string;
    }> = [];

    for (const oa of organizerAnswers) {
      rows.push({
        session_id: sessionId,
        respondent_role: "organizer",
        respondent_label: null,
        question_key: oa.questionKey,
        answer: oa.answer,
      });
    }

    for (const fa of friendAnswers) {
      rows.push({
        session_id: sessionId,
        respondent_role: "friend",
        respondent_label: friendLabel,
        question_key: fa.questionKey,
        answer: fa.answer,
      });
    }

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from("blend_answers").insert(rows);
      if (insertError) {
        return NextResponse.json({ error: "Failed to save answers" }, { status: 500 });
      }
    }

    const blendResult = calculateBlendScore(organizerAnswers, friendAnswers, friendLabel);

    return NextResponse.json({
      success: true,
      blendResult,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const getLettersSchema = z.object({
  occasionId: z.string().uuid(),
});

/**
 * GET /api/letters?occasionId=...
 * Organizer-only: lists all letters (pending, approved, rejected) for an owned occasion.
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

    const occasionId = req.nextUrl.searchParams.get("occasionId");
    const parsed = getLettersSchema.safeParse({ occasionId });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid occasionId" }, { status: 400 });
    }

    // Verify occasion ownership under RLS
    const { data: occasion, error: occError } = await supabase
      .from("occasions")
      .select("id")
      .eq("id", parsed.data.occasionId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (occError || !occasion) {
      return NextResponse.json(
        { error: "Occasion not found or access denied" },
        { status: 403 },
      );
    }

    // Fetch letters under owner RLS
    const { data: letters, error: lettersError } = await supabase
      .from("letters")
      .select("id, occasion_id, contributor_name, body, status, created_at")
      .eq("occasion_id", parsed.data.occasionId)
      .order("created_at", { ascending: false });

    if (lettersError) {
      return NextResponse.json(
        { error: "Failed to fetch letters" },
        { status: 500 },
      );
    }

    return NextResponse.json({ letters: letters || [] }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

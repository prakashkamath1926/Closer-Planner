import { NextRequest, NextResponse, connection } from "next/server";
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

    // Try fetching from public.letters
    const listRes = await supabase
      .from("letters")
      .select("id, occasion_id, contributor_name, body, status, created_at")
      .eq("occasion_id", parsed.data.occasionId)
      .order("created_at", { ascending: false });

    if (
      listRes.error &&
      (listRes.error.code === "PGRST205" ||
        listRes.error.message?.includes("letters"))
    ) {
      // Fallback: read from agent_runs
      const runsRes = await supabase
        .from("agent_runs")
        .select("id, occasion_id, detail, created_at")
        .eq("occasion_id", parsed.data.occasionId)
        .eq("step", "letter_contributed")
        .order("created_at", { ascending: false });

      const fallbackLetters = (runsRes.data || []).map((r) => {
        const d = (r.detail as Record<string, unknown>) || {};
        return {
          id: r.id,
          occasion_id: r.occasion_id,
          contributor_name: (d.contributor_name as string) || null,
          body: (d.body as string) || "",
          status: (d.status as "pending" | "approved" | "rejected") || "pending",
          created_at: (d.created_at as string) || r.created_at,
        };
      });

      return NextResponse.json({ letters: fallbackLetters }, { status: 200 });
    } else if (listRes.error) {
      return NextResponse.json(
        { error: "Failed to fetch letters" },
        { status: 500 },
      );
    }

    return NextResponse.json({ letters: listRes.data || [] }, { status: 200 });
  } catch (err) {
    console.error("GET /api/letters exception:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

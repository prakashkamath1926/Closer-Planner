import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseJsonBody } from "@/lib/security/request";

const recipientViewSchema = z.object({
  occasionId: z.string().uuid(),
  headline: z.string().min(1).max(200).default("Something special is being prepared"),
  message: z.string().max(1000).nullable().optional(),
  revealAt: z.string().nullable().optional(),
  showCountdown: z.boolean().default(true),
  published: z.boolean().default(false),
});

/**
 * GET /api/recipient-view?occasionId=...: Gets the organizer's recipient_view settings.
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
    if (!occasionId) {
      return NextResponse.json({ error: "occasionId is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("recipient_view")
      .select("*")
      .eq("occasion_id", occasionId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "Failed to fetch recipient view" }, { status: 500 });
    }

    return NextResponse.json({ recipientView: data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT /api/recipient-view: Saves the organizer's recipient_view settings.
 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const jsonResult = await parseJsonBody(req);
    if (!jsonResult.success) {
      return jsonResult.response;
    }

    const parsed = recipientViewSchema.safeParse(jsonResult.data);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid recipient view configuration", details: parsed.error.format() },
        { status: 400 },
      );
    }

    const { occasionId, headline, message, revealAt, showCountdown, published } = parsed.data;

    // Verify ownership
    const { data: occasion } = await supabase
      .from("occasions")
      .select("id")
      .eq("id", occasionId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!occasion) {
      return NextResponse.json({ error: "Occasion not found" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("recipient_view")
      .upsert(
        {
          occasion_id: occasionId,
          headline,
          message: message ?? null,
          reveal_at: revealAt ?? null,
          show_countdown: showCountdown,
          published,
        },
        { onConflict: "occasion_id" },
      )
      .select("*")
      .single();

    if (error) {
      console.error("Failed to save recipient view:", error);
      return NextResponse.json(
        { error: "Failed to save recipient view" },
        { status: 500 },
      );
    }

    return NextResponse.json({ recipientView: data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

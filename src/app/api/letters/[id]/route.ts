import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const updateLetterSchema = z.object({
  status: z.enum(["approved", "rejected", "pending"]),
});

/**
 * PATCH /api/letters/[id]
 * Organizer-only: updates letter status (approve / reject).
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = updateLetterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid status update", details: parsed.error.format() },
        { status: 400 },
      );
    }

    // Update letter under owner RLS
    const { data: updated, error: updateError } = await supabase
      .from("letters")
      .update({ status: parsed.data.status })
      .eq("id", id)
      .select("id, occasion_id, contributor_name, body, status, created_at")
      .maybeSingle();

    if (updateError || !updated) {
      return NextResponse.json(
        { error: "Letter not found or access denied" },
        { status: 404 },
      );
    }

    return NextResponse.json({ letter: updated }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/letters/[id]
 * Organizer-only: deletes a letter.
 */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { error: deleteError } = await supabase
      .from("letters")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json(
        { error: "Failed to delete letter or access denied" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

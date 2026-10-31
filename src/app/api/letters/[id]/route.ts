import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

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

    // Try updating public.letters
    const updateRes = await supabase
      .from("letters")
      .update({ status: parsed.data.status })
      .eq("id", id)
      .select("id, occasion_id, contributor_name, body, status, created_at")
      .maybeSingle();

    if (
      updateRes.error &&
      (updateRes.error.code === "PGRST205" ||
        updateRes.error.message?.includes("letters"))
    ) {
      // Fallback: check agent_runs
      const { data: run, error: runError } = await supabase
        .from("agent_runs")
        .select("id, occasion_id, detail, created_at")
        .eq("id", id)
        .maybeSingle();

      if (runError || !run) {
        return NextResponse.json(
          { error: "Letter not found or access denied" },
          { status: 404 },
        );
      }

      const existingDetail =
        typeof run.detail === "object" && run.detail !== null
          ? (run.detail as Record<string, unknown>)
          : {};
      const updatedDetail: Record<string, unknown> = {
        ...existingDetail,
        status: parsed.data.status,
      };

      await supabase
        .from("agent_runs")
        .update({ detail: updatedDetail as unknown as Json })
        .eq("id", id);

      return NextResponse.json(
        {
          letter: {
            id: run.id,
            occasion_id: run.occasion_id,
            contributor_name: (updatedDetail.contributor_name as string) || null,
            body: (updatedDetail.body as string) || "",
            status: parsed.data.status,
            created_at: (updatedDetail.created_at as string) || run.created_at,
          },
        },
        { status: 200 },
      );
    } else if (updateRes.error || !updateRes.data) {
      return NextResponse.json(
        { error: "Letter not found or access denied" },
        { status: 404 },
      );
    }

    return NextResponse.json({ letter: updateRes.data }, { status: 200 });
  } catch (err) {
    console.error("PATCH /api/letters/[id] exception:", err);
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

    const deleteRes = await supabase.from("letters").delete().eq("id", id);

    if (
      deleteRes.error &&
      (deleteRes.error.code === "PGRST205" ||
        deleteRes.error.message?.includes("letters"))
    ) {
      const runDelete = await supabase.from("agent_runs").delete().eq("id", id);
      if (runDelete.error) {
        return NextResponse.json(
          { error: "Failed to delete letter or access denied" },
          { status: 404 },
        );
      }
    } else if (deleteRes.error) {
      return NextResponse.json(
        { error: "Failed to delete letter or access denied" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("DELETE /api/letters/[id] exception:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

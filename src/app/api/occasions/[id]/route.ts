import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createSnapshot } from "@/lib/engine/versions";
import type { Database, Json } from "@/lib/supabase/database.types";

const updateOccasionSchema = z.object({
  eventAt: z.string().nullable().optional(),
  budgetTotal: z.number().nonnegative().nullable().optional(),
  guestCount: z.number().int().nonnegative().nullable().optional(),
  title: z.string().min(1).max(100).optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: occasionId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await req.json();
    const parseResult = updateOccasionSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid parameters", details: parseResult.error.issues },
        { status: 400 },
      );
    }

    const { eventAt, budgetTotal, guestCount, title } = parseResult.data;

    // Verify occasion ownership
    const { data: occasion, error: occError } = await supabase
      .from("occasions")
      .select("*")
      .eq("id", occasionId)
      .eq("owner_id", user.id)
      .single();

    if (occError || !occasion) {
      return NextResponse.json(
        { error: "Occasion not found or access denied" },
        { status: 404 },
      );
    }

    // Fetch items and vendors for snapshot
    const { data: items } = await supabase
      .from("plan_items")
      .select("*")
      .eq("occasion_id", occasionId);
    const { data: vendors } = await supabase
      .from("vendors")
      .select("*")
      .eq("occasion_id", occasionId);

    // Fetch latest version
    const { data: latestVersions } = await supabase
      .from("plan_versions")
      .select("version_no")
      .eq("occasion_id", occasionId)
      .order("version_no", { ascending: false })
      .limit(1);

    const latestVersionNo = latestVersions && latestVersions[0] ? latestVersions[0].version_no : 0;
    const newVersionNo = latestVersionNo + 1;

    // Snapshot before updating
    const currentSnapshot = createSnapshot(occasion, items || [], vendors || []);
    const summary = eventAt !== undefined
      ? `Updated celebration date${eventAt ? ` to ${eventAt}` : " (cleared)"}.`
      : "Updated occasion details.";

    await supabase.from("plan_versions").insert({
      occasion_id: occasionId,
      version_no: newVersionNo,
      snapshot: currentSnapshot as unknown as Json,
      change_summary: summary,
    });

    // Apply updates
    const updates: Database["public"]["Tables"]["occasions"]["Update"] = {};
    if (eventAt !== undefined) updates.event_at = eventAt;
    if (budgetTotal !== undefined) {
      updates.budget_total = budgetTotal !== null ? budgetTotal.toFixed(2) : null;
    }
    if (guestCount !== undefined) updates.guest_count = guestCount;
    if (title !== undefined) updates.title = title;

    const { data: updatedOccasion, error: updateError } = await supabase
      .from("occasions")
      .update(updates)
      .eq("id", occasionId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update occasion" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      occasion: updatedOccasion,
      newVersionNo,
      changeSummary: summary,
    });
  } catch (err) {
    console.error("PATCH /api/occasions/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


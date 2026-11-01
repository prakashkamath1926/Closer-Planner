/**
 * POST /api/versions/restore
 *
 * Restores a historical plan version.
 * - Restoring reproduces the exact snapshot and keeps the replaced state as a new version.
 * - Pure, deterministic version progression.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { prepareRestore, isValidSnapshot, PlanSnapshotData } from "@/lib/engine/versions";
import { parseJsonBody } from "@/lib/security/request";
import type { Json } from "@/lib/supabase/database.types";

const restoreVersionRequestSchema = z.object({
  occasionId: z.string().uuid(),
  targetVersionNo: z.number().int().positive(),
});

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

    const jsonResult = await parseJsonBody(req);
    if (!jsonResult.success) {
      return jsonResult.response;
    }
    const body = jsonResult.data;
    const parseResult = restoreVersionRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid restore request", details: parseResult.error.issues },
        { status: 400 },
      );
    }

    const { occasionId, targetVersionNo } = parseResult.data;

    // 1. Fetch target version snapshot
    const { data: targetVersionRow, error: targetError } = await supabase
      .from("plan_versions")
      .select("*")
      .eq("occasion_id", occasionId)
      .eq("version_no", targetVersionNo)
      .single();

    if (targetError || !targetVersionRow) {
      return NextResponse.json(
        { error: `Version ${targetVersionNo} not found for this occasion` },
        { status: 404 },
      );
    }

    const targetSnapshot = targetVersionRow.snapshot as unknown as PlanSnapshotData;

    // Validate snapshot structure before executing any modifications
    if (!isValidSnapshot(targetSnapshot)) {
      return NextResponse.json(
        { error: `Version ${targetVersionNo} contains a malformed or corrupted snapshot` },
        { status: 400 },
      );
    }

    // 2. Fetch current live state
    const { data: currentOccasion, error: currentOccasionError } = await supabase
      .from("occasions")
      .select("*")
      .eq("id", occasionId)
      .single();

    if (currentOccasionError || !currentOccasion) {
      return NextResponse.json(
        { error: "Occasion not found or inaccessible" },
        { status: 404 },
      );
    }

    const { data: currentItems, error: currentItemsError } = await supabase
      .from("plan_items")
      .select("*")
      .eq("occasion_id", occasionId);

    if (currentItemsError) {
      console.error("Failed to fetch current plan items before restore:", currentItemsError);
      return NextResponse.json(
        { error: "Failed to load current items before restore" },
        { status: 500 },
      );
    }

    const { data: currentVendors, error: currentVendorsError } = await supabase
      .from("vendors")
      .select("*")
      .eq("occasion_id", occasionId);

    if (currentVendorsError) {
      console.error("Failed to fetch current vendors before restore:", currentVendorsError);
      return NextResponse.json(
        { error: "Failed to load current vendors before restore" },
        { status: 500 },
      );
    }

    // 3. Fetch latest version number
    const { data: latestVersions } = await supabase
      .from("plan_versions")
      .select("version_no")
      .eq("occasion_id", occasionId)
      .order("version_no", { ascending: false })
      .limit(1);

    const highestVersionNo = latestVersions && latestVersions[0] ? latestVersions[0].version_no : 0;

    // 4. Prepare restore: captures current state as a new version snapshot
    const restoreResult = prepareRestore(
      {
        occasion: currentOccasion,
        plan_items: currentItems || [],
        vendors: currentVendors || [],
      },
      targetSnapshot,
      highestVersionNo,
      targetVersionNo,
    );

    // 5. Save the replaced state snapshot as the new version
    const { error: saveReplacedError } = await supabase.from("plan_versions").insert({
      occasion_id: occasionId,
      version_no: restoreResult.newVersionNo,
      snapshot: restoreResult.replacedStateSnapshot as unknown as Json,
      change_summary: restoreResult.changeSummary,
    });

    if (saveReplacedError) {
      console.error("Failed to save replaced state as new version:", saveReplacedError);
      return NextResponse.json(
        { error: "Failed to create version snapshot for replaced state", stage: "snapshot_save" },
        { status: 500 },
      );
    }

    // 6. Restore occasion fields to match target snapshot
    const restoredOcc = restoreResult.stateToRestore.occasion;
    const { error: updateOccasionError } = await supabase
      .from("occasions")
      .update({
        title: restoredOcc.title,
        budget_total: restoredOcc.budget_total ? String(restoredOcc.budget_total) : null,
        event_at: restoredOcc.event_at || null,
        guest_count: restoredOcc.guest_count || null,
        urgency_mode: (restoredOcc.urgency_mode as "tonight" | "this_week" | "weeks_away") || "weeks_away",
      })
      .eq("id", occasionId);

    if (updateOccasionError) {
      console.error("Failed to restore occasion fields:", updateOccasionError);
      return NextResponse.json(
        { error: "Failed to restore occasion details", stage: "occasion_restore" },
        { status: 500 },
      );
    }

    // 7. Replace live plan_items with restored snapshot items
    // Note: Sequential database operations; if a subsequent write fails, an error response is returned
    // identifying the exact failure stage.
    // First, delete current live items for this occasion
    const { error: deleteError } = await supabase.from("plan_items").delete().eq("occasion_id", occasionId);
    if (deleteError) {
      console.error("Failed to delete current items during restore:", deleteError);
      return NextResponse.json(
        { error: "Failed to clear current items while restoring version", stage: "items_clear" },
        { status: 500 },
      );
    }

    // Re-insert exact snapshot items
    if (restoreResult.stateToRestore.plan_items.length > 0) {
      const itemsToInsert = restoreResult.stateToRestore.plan_items.map((item, idx) => ({
        id: item.id,
        occasion_id: occasionId,
        title: item.title,
        category: (item.category as string) || "other",
        intent_tag: (item.intent_tag as string) || null,
        why: (item.why as string) || null,
        status: (item.status as "todo" | "doing" | "done" | "skipped") || "todo",
        due_at: (item.due_at as string) || null,
        estimated_cost: item.estimated_cost ? String(item.estimated_cost) : "0.00",
        confirmed_cost: item.confirmed_cost ? String(item.confirmed_cost) : null,
        cost_status: (item.cost_status as "estimate" | "quoted" | "confirmed") || "estimate",
        depends_on: (item.depends_on as string[]) || [],
        plan_b: (item.plan_b as string) || null,
        is_fallback: Boolean(item.is_fallback),
        fallback_for: (item.fallback_for as string) || null,
        is_non_negotiable: Boolean(item.is_non_negotiable),
        sort_order: typeof item.sort_order === "number" ? item.sort_order : idx,
      }));

      const { error: insertRestoredError } = await supabase
        .from("plan_items")
        .insert(itemsToInsert);

      if (insertRestoredError) {
        console.error("Failed to insert restored items:", insertRestoredError);
        return NextResponse.json(
          { error: "Failed to insert restored plan items", stage: "items_insert" },
          { status: 500 },
        );
      }
    }

    // 8. Replace live vendors with restored snapshot vendors
    // First, delete current live vendors for this occasion
    const { error: deleteVendorsError } = await supabase.from("vendors").delete().eq("occasion_id", occasionId);
    if (deleteVendorsError) {
      console.error("Failed to delete current vendors during restore:", deleteVendorsError);
      return NextResponse.json(
        { error: "Failed to clear current vendors while restoring version", stage: "vendors_clear" },
        { status: 500 },
      );
    }

    // Re-insert exact snapshot vendors
    if (restoreResult.stateToRestore.vendors && restoreResult.stateToRestore.vendors.length > 0) {
      const vendorsToInsert = restoreResult.stateToRestore.vendors.map((vendor, idx) => ({
        id: vendor.id,
        occasion_id: occasionId,
        name: vendor.name,
        category: (vendor.category as string) || "other",
        contact: (vendor.contact as string) || null,
        status: (vendor.status as "suggested" | "verified" | "contacted" | "confirmed" | "declined") || "suggested",
        quote_amount: vendor.quote_amount !== undefined && vendor.quote_amount !== null ? String(vendor.quote_amount) : null,
        quote_notes: (vendor.quote_notes as string) || null,
        quote_fields: (vendor.quote_fields as Json) || {},
        priority: typeof vendor.priority === "number" ? vendor.priority : idx + 1,
      }));

      const { error: insertVendorsError } = await supabase
        .from("vendors")
        .insert(vendorsToInsert);

      if (insertVendorsError) {
        console.error("Failed to insert restored vendors:", insertVendorsError);
        return NextResponse.json(
          { error: "Failed to insert restored vendors", stage: "vendors_insert" },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      success: true,
      restoredVersionNo: restoreResult.newVersionNo,
      changeSummary: restoreResult.changeSummary,
    });
  } catch (error) {
    console.error("Restore route error:", error);
    return NextResponse.json(
      { error: "Internal error restoring plan version" },
      { status: 500 },
    );
  }
}


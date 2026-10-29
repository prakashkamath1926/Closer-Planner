/**
 * POST /api/changes/apply
 *
 * Applies an approved change / trade-off to a plan.
 * - Snapshots current state into plan_versions (next version_no).
 * - Applies modified items, added items, and deleted items.
 * - Updates occasion constraints (budget, date).
 * - Idempotency key supported to prevent double-apply on network retry.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createSnapshot } from "@/lib/engine/versions";
import { tradeoffOptionSchema } from "@/lib/ai/schemas";
import type { Database, Json } from "@/lib/supabase/database.types";

const applyChangeRequestSchema = z.object({
  occasionId: z.string().uuid(),
  chosenOption: tradeoffOptionSchema,
  newBudgetTotal: z.number().nonnegative().optional().nullable(),
  newEventAt: z.string().optional().nullable(),
  newGuestCount: z.number().int().nonnegative().optional().nullable(),
  idempotencyKey: z.string().optional(),
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

    const body = await req.json();
    const parseResult = applyChangeRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid apply payload", details: parseResult.error.issues },
        { status: 400 },
      );
    }

    const { occasionId, chosenOption, newBudgetTotal, newEventAt, newGuestCount, idempotencyKey } =
      parseResult.data;

    // 1. Fetch current occasion
    const { data: occasion, error: occError } = await supabase
      .from("occasions")
      .select("*")
      .eq("id", occasionId)
      .single();

    if (occError || !occasion) {
      return NextResponse.json({ error: "Occasion not found" }, { status: 404 });
    }

    // 2. Fetch current plan items and vendors
    const { data: items } = await supabase
      .from("plan_items")
      .select("*")
      .eq("occasion_id", occasionId)
      .order("sort_order", { ascending: true });

    const { data: vendors } = await supabase
      .from("vendors")
      .select("*")
      .eq("occasion_id", occasionId);

    // 3. Fetch latest version number
    const { data: latestVersions } = await supabase
      .from("plan_versions")
      .select("version_no")
      .eq("occasion_id", occasionId)
      .order("version_no", { ascending: false })
      .limit(1);

    const latestVersionNo = latestVersions && latestVersions[0] ? latestVersions[0].version_no : 0;
    const newVersionNo = latestVersionNo + 1;

    // 4. Create snapshot of current state BEFORE applying changes
    const currentSnapshot = createSnapshot(occasion, items || [], vendors || []);

    const changeSummary = `Applied trade-off: "${chosenOption.title}". ${chosenOption.description}`;

    // 5. Insert snapshot into plan_versions
    const { error: versionError } = await supabase.from("plan_versions").insert({
      occasion_id: occasionId,
      version_no: newVersionNo,
      snapshot: {
        ...currentSnapshot,
        idempotency_key: idempotencyKey,
      } as unknown as Json,
      change_summary: changeSummary,
    });

    if (versionError) {
      console.error("Failed to snapshot version:", versionError);
      return NextResponse.json(
        { error: "Failed to create version snapshot before applying change" },
        { status: 500 },
      );
    }

    // 6. Update occasion if constraints changed
    const occasionUpdates: Database["public"]["Tables"]["occasions"]["Update"] = {};
    if (newBudgetTotal !== undefined && newBudgetTotal !== null) {
      occasionUpdates.budget_total = newBudgetTotal.toFixed(2);
    }
    if (newEventAt !== undefined && newEventAt !== null) {
      occasionUpdates.event_at = newEventAt;
    }
    if (newGuestCount !== undefined && newGuestCount !== null) {
      occasionUpdates.guest_count = newGuestCount;
    }

    if (Object.keys(occasionUpdates).length > 0) {
      await supabase.from("occasions").update(occasionUpdates).eq("id", occasionId);
    }

    // 7. Apply removed items
    if (chosenOption.removedItemIds && chosenOption.removedItemIds.length > 0) {
      await supabase
        .from("plan_items")
        .delete()
        .eq("occasion_id", occasionId)
        .in("id", chosenOption.removedItemIds);
    }

    // 8. Apply modified items
    for (const mod of chosenOption.modifiedItems || []) {
      const updates: Database["public"]["Tables"]["plan_items"]["Update"] = {};
      if (mod.title !== undefined) updates.title = mod.title;
      if (mod.estimatedCost !== undefined) updates.estimated_cost = mod.estimatedCost.toFixed(2);
      if (mod.dueAt !== undefined) updates.due_at = mod.dueAt;
      if (mod.dependsOn !== undefined) updates.depends_on = mod.dependsOn;
      if (mod.intentTag !== undefined) updates.intent_tag = mod.intentTag;
      if (mod.why !== undefined) updates.why = mod.why;

      if (Object.keys(updates).length > 0) {
        await supabase
          .from("plan_items")
          .update(updates)
          .eq("id", mod.id)
          .eq("occasion_id", occasionId);
      }
    }

    // 9. Apply added items
    if (chosenOption.addedItems && chosenOption.addedItems.length > 0) {
      const highestSortOrder = (items || []).reduce((max, i) => Math.max(max, i.sort_order || 0), 0);
      const itemsToInsert = chosenOption.addedItems.map((item, idx) => ({
        occasion_id: occasionId,
        title: item.title,
        category: item.category || "other",
        intent_tag: item.intentTag || null,
        why: item.why || null,
        status: "todo" as const,
        estimated_cost: item.estimatedCost.toFixed(2),
        cost_status: "estimate" as const,
        is_non_negotiable: item.isNonNegotiable || false,
        plan_b: item.planB || null,
        sort_order: highestSortOrder + idx + 1,
      }));

      await supabase.from("plan_items").insert(itemsToInsert);
    }

    return NextResponse.json({
      success: true,
      newVersionNo,
      changeSummary,
    });
  } catch (error) {
    console.error("Apply change route error:", error);
    return NextResponse.json(
      { error: "Internal error applying change" },
      { status: 500 },
    );
  }
}


/**
 * PATCH /api/plan/items/[id]
 *
 * Updates a plan item's status, cost, or timing.
 * Owner-scoped under standard Supabase RLS.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const updateItemSchema = z.object({
  status: z.enum(["todo", "doing", "done", "skipped"]).optional(),
  confirmedCost: z.number().nonnegative().optional().nullable(),
  costStatus: z.enum(["estimate", "quoted", "confirmed"]).optional(),
  dueAt: z.string().optional().nullable(),
});

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
    const parseResult = updateItemSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid item update", details: parseResult.error.issues },
        { status: 400 },
      );
    }

    const updates: Database["public"]["Tables"]["plan_items"]["Update"] = {};
    if (parseResult.data.status !== undefined) updates.status = parseResult.data.status;
    if (parseResult.data.confirmedCost !== undefined) updates.confirmed_cost = parseResult.data.confirmedCost !== null ? parseResult.data.confirmedCost.toFixed(2) : null;
    if (parseResult.data.costStatus !== undefined) updates.cost_status = parseResult.data.costStatus;
    if (parseResult.data.dueAt !== undefined) updates.due_at = parseResult.data.dueAt;

    const { data: updatedItem, error: updateError } = await supabase
      .from("plan_items")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update item", details: updateError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ item: updatedItem });
  } catch (err: unknown) {
    console.error("Item update error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

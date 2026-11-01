import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { Database, Json } from "@/lib/supabase/database.types";
import { parseJsonBody } from "@/lib/security/request";
import {
  VendorRecord,
  VendorStatus,
  isValidStatusTransition,
  findNextFallbackVendor,
} from "@/lib/engine/vendors";

const vendorStatusEnum = z.enum(["suggested", "verified", "contacted", "confirmed", "declined"]);

const createVendorSchema = z.object({
  occasionId: z.string().uuid(),
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(80),
  contact: z.string().max(200).nullable().optional(),
  priority: z.number().int().min(1).max(99).default(1),
  quoteAmount: z.number().nonnegative().nullable().optional(),
  quoteNotes: z.string().max(4000).nullable().optional(),
  quoteFields: z.record(z.string(), z.unknown()).optional().default({}),
});

const updateVendorSchema = z.object({
  id: z.string().uuid(),
  occasionId: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  category: z.string().min(1).max(80).optional(),
  contact: z.string().max(200).nullable().optional(),
  priority: z.number().int().min(1).max(99).optional(),
  status: vendorStatusEnum.optional(),
  quoteAmount: z.number().nonnegative().nullable().optional(),
  quoteNotes: z.string().max(4000).nullable().optional(),
  quoteFields: z.record(z.string(), z.unknown()).optional(),
});

/**
 * GET /api/vendors?occasionId=...: Lists all vendors for an occasion.
 * RLS applies: user can only see vendors of their own occasions.
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

    const { data: vendors, error } = await supabase
      .from("vendors")
      .select("*")
      .eq("occasion_id", occasionId)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: "Failed to fetch vendors" }, { status: 500 });
    }

    return NextResponse.json({ vendors });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/vendors: Creates a new vendor.
 * Status defaults to 'suggested'.
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

    const jsonResult = await parseJsonBody(req);
    if (!jsonResult.success) {
      return jsonResult.response;
    }

    const parsed = createVendorSchema.safeParse(jsonResult.data);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid vendor data", details: parsed.error.format() },
        { status: 400 },
      );
    }

    const { occasionId, name, category, contact, priority, quoteAmount, quoteNotes, quoteFields } =
      parsed.data;

    // Verify occasion ownership under RLS
    const { data: occasion } = await supabase
      .from("occasions")
      .select("id")
      .eq("id", occasionId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!occasion) {
      return NextResponse.json({ error: "Occasion not found" }, { status: 403 });
    }

    const { data: vendor, error: insertError } = await supabase
      .from("vendors")
      .insert({
        occasion_id: occasionId,
        name,
        category,
        contact: contact ?? null,
        status: "suggested", // Initial status always starts at suggested
        priority,
        quote_amount:
          quoteAmount !== null && quoteAmount !== undefined ? String(quoteAmount) : null,
        quote_notes: quoteNotes ?? null,
        quote_fields: quoteFields as unknown as Json,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: "Failed to create vendor" }, { status: 500 });
    }

    return NextResponse.json({ vendor }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT /api/vendors: Updates a vendor.
 * HARD RULE: Status changes ONLY by explicit organizer action.
 * Status ladder: suggested -> verified -> contacted -> confirmed (+ declined).
 * Status cannot skip to confirmed unless explicitly requested by organizer.
 * When status is 'declined', computes and suggests next fallback vendor.
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

    const parsed = updateVendorSchema.safeParse(jsonResult.data);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid vendor update data", details: parsed.error.format() },
        { status: 400 },
      );
    }

    const { id, occasionId, status: newStatus, ...updates } = parsed.data;

    // Fetch existing vendor under RLS
    const { data: existing, error: fetchError } = await supabase
      .from("vendors")
      .select("*")
      .eq("id", id)
      .eq("occasion_id", occasionId)
      .maybeSingle();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    // Validate status transition if status is being updated
    if (newStatus && newStatus !== existing.status) {
      if (!isValidStatusTransition(existing.status as VendorStatus, newStatus)) {
        return NextResponse.json(
          {
            error: `Invalid status transition from '${existing.status}' to '${newStatus}'. Status follows the ladder: suggested -> verified -> contacted -> confirmed.`,
          },
          { status: 400 },
        );
      }
    }

    const updatePayload: Database["public"]["Tables"]["vendors"]["Update"] = {};
    if (updates.name !== undefined) updatePayload.name = updates.name;
    if (updates.category !== undefined) updatePayload.category = updates.category;
    if (updates.contact !== undefined) updatePayload.contact = updates.contact;
    if (updates.priority !== undefined) updatePayload.priority = updates.priority;
    if (updates.quoteAmount !== undefined) {
      updatePayload.quote_amount = updates.quoteAmount !== null ? String(updates.quoteAmount) : null;
    }
    if (updates.quoteNotes !== undefined) updatePayload.quote_notes = updates.quoteNotes;
    if (updates.quoteFields !== undefined) updatePayload.quote_fields = updates.quoteFields as unknown as Json;
    if (newStatus !== undefined) updatePayload.status = newStatus;

    const { data: updated, error: updateError } = await supabase
      .from("vendors")
      .update(updatePayload)
      .eq("id", id)
      .eq("occasion_id", occasionId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: "Failed to update vendor" }, { status: 500 });
    }

    // If vendor was marked declined, find next fallback in category
    let nextFallback: VendorRecord | null = null;
    if (newStatus === "declined") {
      const { data: allCategoryVendors } = await supabase
        .from("vendors")
        .select("*")
        .eq("occasion_id", occasionId)
        .order("priority", { ascending: true });

      if (allCategoryVendors) {
        nextFallback = findNextFallbackVendor(
          allCategoryVendors as VendorRecord[],
          updated.category,
          id,
        );
      }
    }

    return NextResponse.json({
      vendor: updated,
      nextFallback,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/vendors: Deletes a vendor.
 */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const id = req.nextUrl.searchParams.get("id");
    const occasionId = req.nextUrl.searchParams.get("occasionId");
    if (!id || !occasionId) {
      return NextResponse.json({ error: "id and occasionId are required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("vendors")
      .delete()
      .eq("id", id)
      .eq("occasion_id", occasionId);

    if (error) {
      return NextResponse.json({ error: "Failed to delete vendor" }, { status: 500 });
    }

    return NextResponse.json({ success: true, deletedId: id });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

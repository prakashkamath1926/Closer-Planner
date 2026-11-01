/**
 * POST /api/plan
 *
 * Persists an approved celebration idea into Supabase.
 * - Uses the user's cookie client so Row Level Security (RLS) applies.
 * - Saves occasion, recipient facts, and plan items in order.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseJsonBody } from "@/lib/security/request";
import { celebrationIdeaSchema, entryPathEnum } from "@/lib/ai/schemas";

const savePlanRequestSchema = z.object({
  idea: celebrationIdeaSchema,
  entryPath: entryPathEnum.default("have_idea"),
  occasionType: z.string().default("birthday"),
  recipientName: z.string().nullable().optional(),
  intentSummary: z.string().nullable().optional(),
  eventAt: z.string().nullable().optional(),
  budgetTotal: z.number().nonnegative().nullable().optional(),
  currency: z.string().default("INR"),
  guestCount: z.number().int().nonnegative().nullable().optional(),
  isSurprise: z.boolean().default(false),
  avoidNotes: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    let user = (await supabase.auth.getUser()).data.user;

    // If no session exists yet (first-time visitor), establish an anonymous session
    // right here in the Route Handler where cookies are writable.
    if (!user) {
      const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
      if (anonError || !anonData.user) {
        console.error("Failed to establish anonymous user session:", anonError);
        return NextResponse.json(
          {
            error: "Authentication required and failed to create anonymous session",
          },
          { status: 401 },
        );
      }
      user = anonData.user;
    }

    const jsonResult = await parseJsonBody(req);
    if (!jsonResult.success) {
      return jsonResult.response;
    }
    const body = jsonResult.data;
    const parseResult = savePlanRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid plan payload", details: parseResult.error.issues },
        { status: 400 },
      );
    }

    const data = parseResult.data;
    const idea = data.idea;

    // 1. Insert occasion
    const { data: occasion, error: occError } = await supabase
      .from("occasions")
      .insert({
        owner_id: user.id,
        title: idea.title,
        occasion_type: data.occasionType,
        recipient_name: data.recipientName || null,
        intent_summary: data.intentSummary || idea.whyItSuitsThem,
        event_at: data.eventAt || null,
        budget_total:
          data.budgetTotal !== undefined && data.budgetTotal !== null
            ? Math.max(0, data.budgetTotal).toFixed(2)
            : null,
        currency: data.currency,
        guest_count:
          data.guestCount !== undefined && data.guestCount !== null
            ? Math.max(0, Math.floor(data.guestCount))
            : null,
        urgency_mode: idea.urgencyMode,
        entry_path: data.entryPath,
        is_surprise: data.isSurprise,
        avoid_notes: data.avoidNotes || null,
        status: "planning",
      })
      .select("id")
      .single();

    if (occError || !occasion) {
      console.error("Failed to insert occasion:", occError);
      return NextResponse.json(
        { error: "Failed to create occasion" },
        { status: 500 },
      );
    }

    const occasionId = occasion.id;

    // 2. Insert recipient facts
    if (idea.facts && idea.facts.length > 0) {
      const factsToInsert = idea.facts.map((f) => ({
        occasion_id: occasionId,
        fact_key: f.key,
        fact_value: f.value,
        status: f.status,
        source: f.source,
      }));

      const { error: factsError } = await supabase
        .from("recipient_facts")
        .insert(factsToInsert);

      if (factsError) {
        console.warn("Failed to insert recipient facts:", factsError.message);
      }
    }

    // 3. Insert plan items
    if (idea.items && idea.items.length > 0) {
      const itemsToInsert = idea.items.map((item, index) => ({
        occasion_id: occasionId,
        title: item.title,
        category: item.category || "other",
        intent_tag: item.intentTag || null,
        why: item.why || null,
        status: "todo" as const,
        estimated_cost: item.estimatedCost ? item.estimatedCost.toFixed(2) : "0.00",
        cost_status: "estimate" as const,
        is_non_negotiable: item.isNonNegotiable || false,
        plan_b: item.planB || null,
        sort_order: index,
      }));

      const { error: itemsError } = await supabase
        .from("plan_items")
        .insert(itemsToInsert);

      if (itemsError) {
        console.error("Failed to insert plan items:", itemsError);
      }
    }

    return NextResponse.json({
      success: true,
      occasionId,
      title: idea.title,
    });
  } catch (error) {
    console.error("Save plan route error:", error);
    return NextResponse.json(
      { error: "Internal error saving celebration plan" },
      { status: 500 },
    );
  }
}

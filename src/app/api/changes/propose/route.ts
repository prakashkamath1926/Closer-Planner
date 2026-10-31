/**
 * POST /api/changes/propose
 *
 * Proposes 2 to 3 trade-offs when constraints change (e.g. budget, date).
 * - Rate limited via checkRateLimit('ai:<user_id>', 60, 10).
 * - Sends only minimal affected items to AI.
 * - HARD RULE: Trade-offs that fail budget ceiling or dependency checks are dropped.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, createRateLimitResponse } from "@/lib/security/rate-limit";
import { analyzeChangeImpact, PlanItem } from "@/lib/engine/changes";
import { proposeTradeoffs } from "@/lib/ai/orchestrator";

const proposeChangesRequestSchema = z.object({
  occasionId: z.string().uuid(),
  newBudgetTotal: z.number().nonnegative().optional().nullable(),
  newEventAt: z.string().optional().nullable(),
  newGuestCount: z.number().int().nonnegative().optional().nullable(),
  reason: z.string().max(300).optional(),
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

    const rateLimit = await checkRateLimit(`ai:${user.id}`, 60, 10);
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit.retryAfterSeconds || 60);
    }

    const body = await req.json();
    const parseResult = proposeChangesRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid change request", details: parseResult.error.issues },
        { status: 400 },
      );
    }

    const { occasionId, newBudgetTotal, newEventAt, newGuestCount, reason } = parseResult.data;

    // Fetch occasion
    const { data: occasion, error: occError } = await supabase
      .from("occasions")
      .select("*")
      .eq("id", occasionId)
      .single();

    if (occError || !occasion) {
      return NextResponse.json({ error: "Occasion not found" }, { status: 404 });
    }

    // Fetch active plan items
    const { data: items, error: itemsError } = await supabase
      .from("plan_items")
      .select("*")
      .eq("occasion_id", occasionId)
      .order("sort_order", { ascending: true });

    if (itemsError) {
      return NextResponse.json({ error: "Failed to fetch plan items" }, { status: 500 });
    }

    const planItems: PlanItem[] = (items || []).map((i) => ({
      id: i.id,
      title: i.title,
      category: i.category,
      intent_tag: i.intent_tag,
      why: i.why,
      status: i.status as "todo" | "doing" | "done" | "skipped",
      due_at: i.due_at,
      estimated_cost: i.estimated_cost,
      confirmed_cost: i.confirmed_cost,
      cost_status: i.cost_status as "estimate" | "quoted" | "confirmed",
      depends_on: i.depends_on || [],
      is_fallback: i.is_fallback,
      fallback_for: i.fallback_for,
      is_non_negotiable: i.is_non_negotiable,
      sort_order: i.sort_order,
    }));

    // Analyze impact with new constraints
    const updatedOccasion = {
      id: occasion.id,
      title: occasion.title,
      budget_total: newBudgetTotal !== undefined && newBudgetTotal !== null ? newBudgetTotal : occasion.budget_total,
      event_at: newEventAt !== undefined && newEventAt !== null ? newEventAt : occasion.event_at,
      guest_count: newGuestCount !== undefined && newGuestCount !== null ? newGuestCount : occasion.guest_count,
      currency: occasion.currency,
    };

    const impact = analyzeChangeImpact(updatedOccasion, planItems, planItems);

    // Format minimal affected items for AI
    const affectedItemSet = new Set(impact.affectedItemIds);
    const affectedItemsForAi = planItems
      .filter((i) => affectedItemSet.has(i.id) || !i.is_non_negotiable)
      .map((i) => ({
        id: i.id,
        title: i.title,
        category: i.category,
        intentTag: i.intent_tag,
        estimatedCost: Number(i.estimated_cost || 0),
        dueAt: i.due_at,
        dependsOn: i.depends_on,
        isNonNegotiable: i.is_non_negotiable,
      }));

    // Call orchestrator (which drops any options failing engine budget or dependency checks)
    const tradeoffs = await proposeTradeoffs(
      {
        occasionTitle: occasion.title,
        previousBudget: occasion.budget_total ? Number(occasion.budget_total) : null,
        newBudget: newBudgetTotal ?? (occasion.budget_total ? Number(occasion.budget_total) : null),
        currency: occasion.currency,
        previousEventAt: occasion.event_at,
        newEventAt: newEventAt ?? occasion.event_at,
        affectedItems: affectedItemsForAi,
        reason,
      },
      planItems,
    );

    return NextResponse.json({
      success: true,
      tradeoffs,
      options: tradeoffs.options,
      affectedItemIds: impact.affectedItemIds,
      infeasibleFlags: impact.infeasibleFlags,
      budgetSummary: impact.budgetSummary,
      diff: impact.diff,
      summary: impact.summary,
      source: tradeoffs.source || "ai",
    });
  } catch (error) {
    console.error("Propose changes route error:", error);
    return NextResponse.json(
      { error: "Internal error proposing trade-offs" },
      { status: 500 },
    );
  }
}


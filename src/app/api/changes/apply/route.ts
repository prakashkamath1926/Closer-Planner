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
import { parseJsonBody } from "@/lib/security/request";
import type { Database, Json } from "@/lib/supabase/database.types";

const applyChangeRequestSchema = z.object({
  occasionId: z.string().uuid(),
  chosenOption: tradeoffOptionSchema,
  newBudgetTotal: z.number().nonnegative().optional().nullable(),
  newEventAt: z.string().optional().nullable(),
  newGuestCount: z.number().int().nonnegative().optional().nullable(),
  idempotencyKey: z.string().min(1),
});

// In-process mutex to prevent overlapping mutations on the same occasion within the active runtime instance
const activeOccasionLocks = new Set<string>();

export async function POST(req: NextRequest) {
  let lockedOccasionId: string | null = null;
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
    const parseResult = applyChangeRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid apply payload", details: parseResult.error.issues },
        { status: 400 },
      );
    }

    const { occasionId, chosenOption, newBudgetTotal, newEventAt, newGuestCount, idempotencyKey } =
      parseResult.data;

    // Concurrency Lock Check (in-process mutex for the occasion)
    if (activeOccasionLocks.has(occasionId)) {
      return NextResponse.json(
        {
          error: "Another operation for this occasion is currently being processed. Please retry shortly.",
          code: "concurrent_occasion_lock",
        },
        { status: 409 },
      );
    }
    activeOccasionLocks.add(occasionId);
    lockedOccasionId = occasionId;

    // 1. Fetch current occasion
    const { data: occasion, error: occError } = await supabase
      .from("occasions")
      .select("*")
      .eq("id", occasionId)
      .single();

    if (occError || !occasion) {
      return NextResponse.json({ error: "Occasion not found" }, { status: 404 });
    }

    // 2. Check for idempotent replay: look up plan_versions for this occasion with snapshot->>'idempotency_key' equal to the key
    const { data: existingVersions } = await supabase
      .from("plan_versions")
      .select("version_no, change_summary, snapshot")
      .eq("occasion_id", occasionId);

    const replayedVersion = existingVersions?.find(
      (v) => (v.snapshot as Record<string, unknown>)?.idempotency_key === idempotencyKey,
    );

    if (replayedVersion) {
      const snapshotObj = (replayedVersion.snapshot as Record<string, unknown>) || {};
      const applyStatus = snapshotObj.apply_status as string | undefined;

      if (applyStatus === "failed") {
        const failureStage = (snapshotObj.failure_stage as string) || "unknown";
        return NextResponse.json(
          {
            error: `A previous attempt with this idempotency key partially failed at stage '${failureStage}'. Changes were not fully applied.`,
            code: "idempotency_partial_failure",
            stage: failureStage,
            failedVersionNo: replayedVersion.version_no,
          },
          { status: 409 },
        );
      }

      if (applyStatus === "in_progress") {
        const startedAt = typeof snapshotObj.started_at === "string" ? new Date(snapshotObj.started_at).getTime() : 0;
        const isStale = startedAt > 0 && Date.now() - startedAt > 60_000;
        if (isStale) {
          return NextResponse.json(
            {
              error: "A previous attempt with this idempotency key was interrupted and remains in an incomplete (in_progress) state. It cannot be automatically completed or replayed.",
              code: "idempotency_stale_in_progress",
              staleVersionNo: replayedVersion.version_no,
            },
            { status: 409 },
          );
        }

        return NextResponse.json(
          {
            error: "An operation with this idempotency key is currently in progress. Please wait and retry.",
            code: "idempotency_in_progress",
          },
          { status: 409 },
        );
      }

      // Replay successful completion (or legacy snapshot without apply_status)
      return NextResponse.json({
        success: true,
        newVersionNo: replayedVersion.version_no,
        changeSummary: replayedVersion.change_summary,
      });
    }

    // Check if another operation on this occasion is actively in progress across instances
    const activeOtherOperation = existingVersions?.find((v) => {
      const snap = (v.snapshot as Record<string, unknown>) || {};
      if (snap.apply_status !== "in_progress") return false;
      if (snap.idempotency_key === idempotencyKey) return false;
      const startedAt = typeof snap.started_at === "string" ? new Date(snap.started_at).getTime() : 0;
      return startedAt > 0 && Date.now() - startedAt <= 60_000;
    });

    if (activeOtherOperation) {
      return NextResponse.json(
        {
          error: "Another change is currently being applied to this plan. Please wait and retry.",
          code: "concurrent_occasion_modification",
        },
        { status: 409 },
      );
    }

    // 3. Fetch current plan items and vendors
    const { data: items } = await supabase
      .from("plan_items")
      .select("*")
      .eq("occasion_id", occasionId)
      .order("sort_order", { ascending: true });

    const { data: vendors } = await supabase
      .from("vendors")
      .select("*")
      .eq("occasion_id", occasionId);

    // 4. Compute next version number directly from the evaluated existingVersions snapshot.
    // Deriving newVersionNo strictly from the same snapshot checked for active in_progress
    // operations guarantees that simultaneous cross-instance requests both compute the SAME
    // version number, forcing PostgreSQL's unique(occasion_id, version_no) constraint to reject
    // one with 23505 before any mutations can execute.
    const latestVersionNo = (existingVersions || []).reduce(
      (max, v) => (typeof v.version_no === "number" && v.version_no > max ? v.version_no : max),
      0,
    );
    const newVersionNo = latestVersionNo + 1;

    // 5. Create snapshot of current state BEFORE applying changes
    const currentSnapshot = createSnapshot(occasion, items || [], vendors || []);

    const changeSummary = `Applied trade-off: "${chosenOption.title}". ${chosenOption.description}`;

    // 6. Insert snapshot into plan_versions with in_progress status
    const { error: versionError } = await supabase.from("plan_versions").insert({
      occasion_id: occasionId,
      version_no: newVersionNo,
      snapshot: {
        ...currentSnapshot,
        idempotency_key: idempotencyKey,
        apply_status: "in_progress",
        started_at: new Date().toISOString(),
      } as unknown as Json,
      change_summary: changeSummary,
    });

    if (versionError) {
      console.error("Failed to snapshot version:", versionError);
      if ((versionError as { code?: string }).code === "23505") {
        return NextResponse.json(
          { error: "A concurrent update was detected for this plan. Please retry.", code: "concurrent_modification" },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: "Failed to create version snapshot before applying change" },
        { status: 500 },
      );
    }

    // Helper to record failure state on the snapshot so retries cannot succeed partially
    const recordFailure = async (
      stage: string,
      errorMessage: string,
    ): Promise<{ ok: boolean; recordError?: string }> => {
      try {
        const query = supabase.from("plan_versions").update?.({
          snapshot: {
            ...currentSnapshot,
            idempotency_key: idempotencyKey,
            apply_status: "failed",
            failure_stage: stage,
            failure_error: errorMessage,
            failed_at: new Date().toISOString(),
          } as unknown as Json,
        });
        if (query && typeof query.eq === "function") {
          const q2 = query.eq("occasion_id", occasionId);
          if (q2 && typeof q2.eq === "function") {
            const { error: updateError } = await q2.eq("version_no", newVersionNo);
            if (updateError) {
              console.error("Failed to record failure status in plan_versions:", updateError);
              return { ok: false, recordError: updateError.message || "Failed to update version record" };
            }
            return { ok: true };
          }
        }
        return { ok: true };
      } catch (err) {
        console.error("Exception recording failure status in plan_versions:", err);
        return { ok: false, recordError: err instanceof Error ? err.message : String(err) };
      }
    };

    const handleMutationFailure = async (stage: string, mutationErrorMessage: string) => {
      const recordResult = await recordFailure(stage, mutationErrorMessage);
      if (!recordResult.ok) {
        console.error(`Mutation failed at stage '${stage}' AND failed to record 'failed' status:`, recordResult.recordError);
        return NextResponse.json(
          {
            error: `Operation failed at stage '${stage}' and could not record failure state to version history. The operation state could not be recorded.`,
            code: "mutation_and_record_failure",
            stage,
            mutationError: mutationErrorMessage,
            recordError: recordResult.recordError,
            versionNo: newVersionNo,
            idempotencyKey,
          },
          { status: 500 },
        );
      }
      return NextResponse.json(
        {
          error: `Failed during stage '${stage}' while applying change: ${mutationErrorMessage}`,
          stage,
          code: "mutation_failure",
          versionNo: newVersionNo,
        },
        { status: 500 },
      );
    };

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
      const { error: occasionUpdateError } = await supabase
        .from("occasions")
        .update(occasionUpdates)
        .eq("id", occasionId);

      if (occasionUpdateError) {
        console.error("Failed to update occasion during change apply:", occasionUpdateError);
        return await handleMutationFailure("occasion_update", occasionUpdateError.message || "Failed to update occasion parameters");
      }
    }

    // 7. Apply removed items
    if (chosenOption.removedItemIds && chosenOption.removedItemIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("plan_items")
        .delete()
        .eq("occasion_id", occasionId)
        .in("id", chosenOption.removedItemIds);

      if (deleteError) {
        console.error("Failed to delete removed items during change apply:", deleteError);
        return await handleMutationFailure("items_delete", deleteError.message || "Failed to remove items");
      }
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
        const { error: updateItemError } = await supabase
          .from("plan_items")
          .update(updates)
          .eq("id", mod.id)
          .eq("occasion_id", occasionId);

        if (updateItemError) {
          console.error(`Failed to update item ${mod.id} during change apply:`, updateItemError);
          return await handleMutationFailure(
            "items_update",
            updateItemError.message || `Failed to update modified item "${mod.title || mod.id}"`,
          );
        }
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

      const { error: insertItemsError } = await supabase.from("plan_items").insert(itemsToInsert);
      if (insertItemsError) {
        console.error("Failed to insert added items during change apply:", insertItemsError);
        return await handleMutationFailure("items_insert", insertItemsError.message || "Failed to add new items");
      }
    }

    // 10. Mark version snapshot as completed
    try {
      const updateQuery = supabase.from("plan_versions").update?.({
        snapshot: {
          ...currentSnapshot,
          idempotency_key: idempotencyKey,
          apply_status: "completed",
          completed_at: new Date().toISOString(),
        } as unknown as Json,
      });
      if (updateQuery && typeof updateQuery.eq === "function") {
        const q2 = updateQuery.eq("occasion_id", occasionId);
        if (q2 && typeof q2.eq === "function") {
          await q2.eq("version_no", newVersionNo);
        }
      }
    } catch (completeError) {
      console.warn("Failed to mark version as completed in snapshot:", completeError);
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
  } finally {
    if (lockedOccasionId) {
      activeOccasionLocks.delete(lockedOccasionId);
    }
  }
}


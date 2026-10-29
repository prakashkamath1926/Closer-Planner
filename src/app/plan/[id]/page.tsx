import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PlanView, type PlanItemRecord, type OccasionRecord } from "@/components/plan/plan-view";
import type { VersionItem } from "@/components/plan/version-drawer";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function PlanLoader({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id: occasionId } = await params;

  // If the parameter is not a valid UUID (e.g. malformed or test route), trigger 404
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(occasionId);
  if (!isUuid) {
    notFound();
  }

  const supabase = await createClient();

  // 1. Fetch Occasion
  const { data: occasion, error: occError } = await supabase
    .from("occasions")
    .select("*")
    .eq("id", occasionId)
    .single();

  if (occError || !occasion) {
    console.warn("Occasion not found or access restricted:", occError?.message, "occasionId:", occasionId);
    notFound();
  }

  // 2. Fetch Plan Items
  const { data: items, error: itemsError } = await supabase
    .from("plan_items")
    .select("*")
    .eq("occasion_id", occasionId)
    .order("sort_order", { ascending: true });

  if (itemsError) {
    throw new Error("Failed to load plan items");
  }

  // 3. Fetch Versions
  const { data: versions } = await supabase
    .from("plan_versions")
    .select("id, version_no, change_summary, created_at")
    .eq("occasion_id", occasionId)
    .order("version_no", { ascending: false });

  // Map to strongly typed records
  const occasionRecord: OccasionRecord = {
    id: occasion.id,
    title: occasion.title,
    event_at: occasion.event_at,
    budget_total: occasion.budget_total ? Number(occasion.budget_total) : null,
    guest_count: occasion.guest_count,
    currency: occasion.currency || "INR",
    urgency_mode: occasion.urgency_mode || "weeks_away",
    status: occasion.status || "active",
  };

  const itemRecords: PlanItemRecord[] = (items || []).map((i) => ({
    id: i.id,
    occasion_id: i.occasion_id,
    title: i.title,
    category: i.category,
    intent_tag: i.intent_tag,
    why: i.why,
    status: i.status as "todo" | "doing" | "done" | "skipped",
    due_at: i.due_at,
    estimated_cost: i.estimated_cost ? Number(i.estimated_cost) : null,
    confirmed_cost: i.confirmed_cost ? Number(i.confirmed_cost) : null,
    cost_status: (i.cost_status || "estimate") as "estimate" | "quoted" | "confirmed",
    depends_on: i.depends_on || [],
    is_fallback: i.is_fallback,
    fallback_for: i.fallback_for,
    is_non_negotiable: i.is_non_negotiable,
    sort_order: i.sort_order,
  }));

  const versionRecords: VersionItem[] = (versions || []).map((v) => ({
    id: v.id,
    version_no: v.version_no,
    change_summary: v.change_summary,
    created_at: v.created_at,
  }));

  return (
    <PlanView
      initialOccasion={occasionRecord}
      initialItems={itemRecords}
      initialVersions={versionRecords}
    />
  );
}

export default function PlanPage({ params }: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-paper">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-rose border-r-transparent" />
            <p className="mt-4 font-serif text-sm font-medium text-plum">
              Loading celebration plan...
            </p>
          </div>
        </div>
      }
    >
      <PlanLoader params={params} />
    </Suspense>
  );
}


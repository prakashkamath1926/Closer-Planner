/**
 * Deterministic Version History and Restore Engine.
 *
 * Rules (architecture.md & task_today.md):
 * - Snapshot captures occasion, plan_items, and vendors.
 * - Restoring a version reproduces the exact snapshot and keeps the replaced state as a new version.
 * - Pure deterministic functions with no side effects.
 */

export interface PlanSnapshotData {
  occasion: {
    id: string;
    title: string;
    event_at?: string | null;
    budget_total?: string | number | null;
    currency?: string;
    guest_count?: number | null;
    urgency_mode?: string;
    status?: string;
    [key: string]: unknown;
  };
  plan_items: Array<{
    id: string;
    occasion_id: string;
    title: string;
    category?: string;
    status?: string;
    due_at?: string | null;
    estimated_cost?: string | number | null;
    confirmed_cost?: string | number | null;
    cost_status?: string;
    depends_on?: string[];
    is_fallback?: boolean;
    fallback_for?: string | null;
    intent_tag?: string | null;
    [key: string]: unknown;
  }>;
  vendors: Array<{
    id: string;
    occasion_id: string;
    name: string;
    category?: string;
    status?: string;
    quote_amount?: string | number | null;
    [key: string]: unknown;
  }>;
  captured_at: string;
}

export interface RestoreResult {
  /** The snapshot of the current state that was replaced (to be saved as a version) */
  replacedStateSnapshot: PlanSnapshotData;
  /** The exact state to restore into the database */
  stateToRestore: PlanSnapshotData;
  /** The new version number assigned to this restore operation */
  newVersionNo: number;
  /** Human-readable change summary for the restore */
  changeSummary: string;
}

/**
 * Creates a clean, deep-cloned snapshot of an occasion's plan.
 */
export function createSnapshot(
  occasion: PlanSnapshotData["occasion"],
  plan_items: PlanSnapshotData["plan_items"],
  vendors: PlanSnapshotData["vendors"] = [],
  capturedAt: string = new Date().toISOString(),
): PlanSnapshotData {
  return {
    occasion: JSON.parse(JSON.stringify(occasion)),
    plan_items: JSON.parse(JSON.stringify(plan_items)),
    vendors: JSON.parse(JSON.stringify(vendors)),
    captured_at: capturedAt,
  };
}

/**
 * Validates the structure of a snapshot.
 */
export function isValidSnapshot(snapshot: unknown): snapshot is PlanSnapshotData {
  if (!snapshot || typeof snapshot !== "object") return false;
  const s = snapshot as Record<string, unknown>;
  return (
    typeof s.occasion === "object" &&
    s.occasion !== null &&
    Array.isArray(s.plan_items) &&
    Array.isArray(s.vendors)
  );
}

/**
 * Prepares a version restore operation.
 *
 * Rules:
 * - Keeps the replaced state as a new snapshot version (so undo can itself be undone).
 * - Reproduces the exact target snapshot.
 * - Increments version_no.
 *
 * @param currentState The current live occasion state
 * @param targetSnapshot The historical snapshot being restored
 * @param currentLatestVersionNo The highest version_no in `plan_versions` so far
 */
export function prepareRestore(
  currentState: {
    occasion: PlanSnapshotData["occasion"];
    plan_items: PlanSnapshotData["plan_items"];
    vendors: PlanSnapshotData["vendors"];
  },
  targetSnapshot: PlanSnapshotData,
  currentLatestVersionNo: number,
  targetVersionNo?: number,
): RestoreResult {
  if (!isValidSnapshot(targetSnapshot)) {
    throw new Error("Invalid target snapshot structure for restore.");
  }

  // 1. Snapshot the current state so it is preserved as a new version
  const replacedStateSnapshot = createSnapshot(
    currentState.occasion,
    currentState.plan_items,
    currentState.vendors,
  );

  // 2. Prepare exact target state
  const stateToRestore = createSnapshot(
    targetSnapshot.occasion,
    targetSnapshot.plan_items,
    targetSnapshot.vendors,
    targetSnapshot.captured_at,
  );

  const newVersionNo = currentLatestVersionNo + 1;
  const targetLabel = targetVersionNo ? `v${targetVersionNo}` : "an earlier version";
  const changeSummary = `Restored plan from ${targetLabel} (${stateToRestore.plan_items.length} items, ${stateToRestore.vendors.length} vendors).`;

  return {
    replacedStateSnapshot,
    stateToRestore,
    newVersionNo,
    changeSummary,
  };
}


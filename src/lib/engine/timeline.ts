/**
 * Deterministic Timeline and Dependency Engine.
 *
 * Rules:
 * - Detects cycles in `depends_on` graphs and rejects them.
 * - Detects dependencies referencing missing IDs.
 * - Produces topological ordering of plan items.
 * - Identifies blocked vs ready tasks.
 * - Calculates urgency modes based on time remaining to event_at.
 * - Flags infeasible deadlines (e.g., due_at > event_at, or task due before prerequisite).
 */

export interface TimelineItem {
  id: string;
  title: string;
  status: "todo" | "doing" | "done" | "skipped";
  due_at?: string | null;
  depends_on?: string[];
  sort_order?: number;
}

export type UrgencyMode = "tonight" | "this_week" | "weeks_away";

export interface TimelineValidationResult {
  valid: boolean;
  errors: string[];
  /** Topologically sorted item IDs (prerequisites first) if acyclic */
  sortedIds: string[];
}

export interface InfeasibleItemFlag {
  itemId: string;
  itemTitle: string;
  reason: "due_after_event" | "due_before_prerequisite" | "overdue";
  message: string;
  conflictWithId?: string;
}

/**
 * Validates the dependency graph:
 * 1. All dependency IDs must exist in the item list.
 * 2. No item may depend on itself.
 * 3. The graph must be acyclic (DAG).
 *
 * Returns topologically sorted IDs if valid.
 */
export function validateDependencyGraph(items: TimelineItem[]): TimelineValidationResult {
  const itemMap = new Map<string, TimelineItem>();
  const errors: string[] = [];

  for (const item of items) {
    if (itemMap.has(item.id)) {
      errors.push(`Duplicate item ID: ${item.id}`);
    }
    itemMap.set(item.id, item);
  }

  // 1. Check self-dependencies and missing references
  for (const item of items) {
    const deps = item.depends_on || [];
    for (const depId of deps) {
      if (depId === item.id) {
        errors.push(`Item "${item.title}" (${item.id}) cannot depend on itself.`);
      } else if (!itemMap.has(depId)) {
        errors.push(
          `Item "${item.title}" (${item.id}) depends on non-existent item "${depId}".`,
        );
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, sortedIds: [] };
  }

  // 2. Cycle detection and topological sort via DFS
  // 0 = unvisited, 1 = visiting (in recursion stack), 2 = visited
  const visitState = new Map<string, number>();
  const sortedIds: string[] = [];
  const cyclePath: string[] = [];
  let hasCycle = false;

  function dfs(nodeId: string, currentPath: string[]): boolean {
    visitState.set(nodeId, 1);
    currentPath.push(nodeId);

    const item = itemMap.get(nodeId);
    const deps = item?.depends_on || [];

    for (const depId of deps) {
      const state = visitState.get(depId) || 0;
      if (state === 1) {
        // Cycle detected
        const cycleStartIndex = currentPath.indexOf(depId);
        cyclePath.push(...currentPath.slice(cycleStartIndex), depId);
        hasCycle = true;
        return false;
      }
      if (state === 0) {
        if (!dfs(depId, currentPath)) {
          return false;
        }
      }
    }

    currentPath.pop();
    visitState.set(nodeId, 2);
    // Dependency finishes first, so node depending on it comes after
    sortedIds.push(nodeId);
    return true;
  }

  for (const item of items) {
    if ((visitState.get(item.id) || 0) === 0) {
      if (!dfs(item.id, [])) {
        break;
      }
    }
  }

  if (hasCycle) {
    const cycleNames = cyclePath
      .map((id) => `"${itemMap.get(id)?.title || id}"`)
      .join(" -> ");
    errors.push(`Cyclic dependency detected: ${cycleNames}`);
    return { valid: false, errors, sortedIds: [] };
  }

  return { valid: true, errors: [], sortedIds };
}

/**
 * Calculates Urgency Mode from event date relative to reference date.
 * - <= 24 hours: 'tonight'
 * - <= 7 days: 'this_week'
 * - > 7 days: 'weeks_away'
 */
export function calculateUrgencyMode(
  eventAt: string | Date | null | undefined,
  now: Date = new Date(),
): UrgencyMode {
  if (!eventAt) return "weeks_away";

  const eventTime = new Date(eventAt).getTime();
  const currentTime = now.getTime();
  const diffHours = (eventTime - currentTime) / (1000 * 60 * 60);

  if (diffHours <= 24) {
    return "tonight";
  }
  if (diffHours <= 24 * 7) {
    return "this_week";
  }
  return "weeks_away";
}

/**
 * Identifies blocked, ready, and overdue tasks.
 * An item is `blocked` if any of its `depends_on` tasks are not 'done'.
 */
export function categorizeTaskReadiness(
  items: TimelineItem[],
  now: Date = new Date(),
) {
  const itemMap = new Map<string, TimelineItem>(items.map((i) => [i.id, i]));
  const ready: TimelineItem[] = [];
  const blocked: TimelineItem[] = [];
  const completed: TimelineItem[] = [];
  const overdue: TimelineItem[] = [];

  for (const item of items) {
    if (item.status === "done" || item.status === "skipped") {
      completed.push(item);
      continue;
    }

    // Check overdue
    if (item.due_at) {
      const dueTime = new Date(item.due_at).getTime();
      if (dueTime < now.getTime()) {
        overdue.push(item);
      }
    }

    // Check prerequisites
    const deps = item.depends_on || [];
    let isBlocked = false;
    for (const depId of deps) {
      const dep = itemMap.get(depId);
      if (dep && dep.status !== "done") {
        isBlocked = true;
        break;
      }
    }

    if (isBlocked) {
      blocked.push(item);
    } else {
      ready.push(item);
    }
  }

  return { ready, blocked, completed, overdue };
}

/**
 * Flags infeasible deadlines in a plan.
 * Used when the event date is moved earlier or task dates shift:
 * 1. Task due_at is after the celebration event itself.
 * 2. Task due_at is before or equal to a prerequisite's due_at.
 * 3. Task due_at is in the past while task is incomplete.
 */
export function detectInfeasibleDeadlines(
  items: TimelineItem[],
  eventAt?: string | Date | null,
  now: Date = new Date(),
): InfeasibleItemFlag[] {
  const flags: InfeasibleItemFlag[] = [];
  const itemMap = new Map<string, TimelineItem>(items.map((i) => [i.id, i]));
  const eventTime = eventAt ? new Date(eventAt).getTime() : null;

  for (const item of items) {
    if (item.status === "done" || item.status === "skipped") {
      continue;
    }

    if (!item.due_at) continue;
    const itemDueTime = new Date(item.due_at).getTime();

    // 1. Task scheduled after the celebration
    if (eventTime !== null && itemDueTime > eventTime) {
      flags.push({
        itemId: item.id,
        itemTitle: item.title,
        reason: "due_after_event",
        message: `Task "${item.title}" is scheduled after the celebration event.`,
      });
    }

    // 2. Prerequisite sequencing violation: task due before or equal to prerequisite
    for (const depId of item.depends_on || []) {
      const dep = itemMap.get(depId);
      if (dep?.due_at) {
        const depDueTime = new Date(dep.due_at).getTime();
        if (itemDueTime <= depDueTime) {
          flags.push({
            itemId: item.id,
            itemTitle: item.title,
            reason: "due_before_prerequisite",
            conflictWithId: dep.id,
            message: `Task "${item.title}" is due before or at the same time as prerequisite "${dep.title}".`,
          });
        }
      }
    }

    // 3. Past due date
    if (itemDueTime < now.getTime()) {
      flags.push({
        itemId: item.id,
        itemTitle: item.title,
        reason: "overdue",
        message: `Task "${item.title}" deadline has already passed.`,
      });
    }
  }

  return flags;
}


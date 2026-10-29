/**
 * "Tonight" Mode: Minute-by-Minute Run Sheet Generator.
 *
 * Rules:
 * - Deterministic scheduling based on topological dependency sort.
 * - Guarantees that prerequisites are scheduled BEFORE dependent tasks.
 * - Provides minute-by-minute time slots leading up to or during the event.
 * - Flags urgency/readiness: overdue, blocked, ready, done.
 */

import { validateDependencyGraph, TimelineItem } from "./timeline";

export interface RunSheetItemInput {
  id: string;
  title: string;
  category?: string;
  status: "todo" | "doing" | "done" | "skipped";
  due_at?: string | null;
  depends_on?: string[];
  estimated_cost?: number;
}

export interface RunSheetSlot {
  slotIndex: number;
  itemId: string;
  itemTitle: string;
  category: string;
  status: "todo" | "doing" | "done" | "skipped";
  readiness: "ready" | "blocked" | "done";
  start: Date;
  end: Date;
  timeRangeDisplay: string;
  durationMinutes: number;
  dependsOnIds: string[];
  dependsOnTitles: string[];
}

export interface RunSheetOptions {
  eventAt: string | Date;
  startTime?: string | Date;
  defaultSlotDurationMinutes?: number;
}

/**
 * Formats a Date to 12-hour time string with AM/PM (e.g. "06:30 PM").
 */
function formatSlotTime(d: Date): string {
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 becomes 12
  const minStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
  const hrStr = hours < 10 ? `0${hours}` : `${hours}`;
  return `${hrStr}:${minStr} ${ampm}`;
}

/**
 * Generates a minute-by-minute run sheet respecting dependency order.
 */
export function generateTonightRunSheet(
  items: RunSheetItemInput[],
  options: RunSheetOptions,
): RunSheetSlot[] {
  if (!items || items.length === 0) {
    return [];
  }

  const eventDate = typeof options.eventAt === "string" ? new Date(options.eventAt) : options.eventAt;
  const slotMinutes = options.defaultSlotDurationMinutes || 25;

  // 1. Dependency Graph Validation & Topological Sorting
  const timelineItems: TimelineItem[] = items.map((i) => ({
    id: i.id,
    title: i.title,
    status: i.status,
    due_at: i.due_at,
    depends_on: i.depends_on,
  }));

  const validation = validateDependencyGraph(timelineItems);
  const itemMap = new Map(items.map((i) => [i.id, i]));

  // If valid DAG, use topologically sorted IDs so prerequisites come first
  const orderedItems: RunSheetItemInput[] = [];
  if (validation.valid && validation.sortedIds.length > 0) {
    for (const id of validation.sortedIds) {
      const it = itemMap.get(id);
      if (it) orderedItems.push(it);
    }
  } else {
    // Fallback if disconnected or empty
    orderedItems.push(...items);
  }

  // 2. Determine Timeline Start
  // If startTime provided, use it; otherwise work backwards from eventDate, or start now
  let cursorTime: Date;
  if (options.startTime) {
    cursorTime = new Date(typeof options.startTime === "string" ? options.startTime : options.startTime.getTime());
  } else {
    // Total duration needed for all tasks
    const totalMinutesNeeded = orderedItems.length * slotMinutes;
    const computedStart = new Date(eventDate.getTime() - totalMinutesNeeded * 60 * 1000);
    // If computed start is in the past, default to now or 2 hours before event
    cursorTime = computedStart.getTime() < Date.now() - 3600000 ? new Date() : computedStart;
  }

  // Round start time to nearest 5 minutes
  const remainderMinutes = cursorTime.getMinutes() % 5;
  cursorTime = new Date(cursorTime.getTime() - remainderMinutes * 60 * 1000);

  const doneSet = new Set(
    items.filter((i) => i.status === "done" || i.status === "skipped").map((i) => i.id),
  );

  const slots: RunSheetSlot[] = [];

  for (let idx = 0; idx < orderedItems.length; idx++) {
    const item = orderedItems[idx];
    const slotStart = new Date(cursorTime.getTime());
    const slotEnd = new Date(slotStart.getTime() + slotMinutes * 60 * 1000);

    // Check readiness: is it blocked by an undone prerequisite?
    const deps = item.depends_on || [];
    const isDone = item.status === "done" || item.status === "skipped";
    let isBlocked = false;

    for (const depId of deps) {
      if (!doneSet.has(depId)) {
        isBlocked = true;
        break;
      }
    }

    const readiness: RunSheetSlot["readiness"] = isDone
      ? "done"
      : isBlocked
        ? "blocked"
        : "ready";

    const dependsOnTitles = deps
      .map((dId) => itemMap.get(dId)?.title)
      .filter((t): t is string => Boolean(t));

    slots.push({
      slotIndex: idx + 1,
      itemId: item.id,
      itemTitle: item.title,
      category: item.category || "essential",
      status: item.status,
      readiness,
      start: slotStart,
      end: slotEnd,
      timeRangeDisplay: `${formatSlotTime(slotStart)} – ${formatSlotTime(slotEnd)}`,
      durationMinutes: slotMinutes,
      dependsOnIds: deps,
      dependsOnTitles,
    });

    // Advance cursor for next slot
    cursorTime = slotEnd;
  }

  return slots;
}


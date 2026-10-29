import { describe, it, expect } from "vitest";
import {
  validateDependencyGraph,
  calculateUrgencyMode,
  categorizeTaskReadiness,
  detectInfeasibleDeadlines,
  TimelineItem,
} from "../../src/lib/engine/timeline";

describe("engine/timeline: dependency ordering, cycle detection & deadline checks", () => {
  it("rejects cyclic depends_on graphs (e.g. A -> B -> C -> A)", () => {
    const cyclicItems: TimelineItem[] = [
      { id: "A", title: "Task A", status: "todo", depends_on: ["C"] },
      { id: "B", title: "Task B", status: "todo", depends_on: ["A"] },
      { id: "C", title: "Task C", status: "todo", depends_on: ["B"] },
    ];

    const result = validateDependencyGraph(cyclicItems);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Cyclic dependency detected");
  });

  it("rejects 2-item cycles (A -> B -> A)", () => {
    const cyclicItems: TimelineItem[] = [
      { id: "A", title: "Task A", status: "todo", depends_on: ["B"] },
      { id: "B", title: "Task B", status: "todo", depends_on: ["A"] },
    ];

    const result = validateDependencyGraph(cyclicItems);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Cyclic dependency detected");
  });

  it("rejects self-dependencies (A -> A)", () => {
    const selfItem: TimelineItem[] = [
      { id: "A", title: "Task A", status: "todo", depends_on: ["A"] },
    ];

    const result = validateDependencyGraph(selfItem);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("cannot depend on itself");
  });

  it("rejects dependencies referencing missing IDs", () => {
    const items: TimelineItem[] = [
      { id: "1", title: "Send Invites", status: "todo", depends_on: ["non-existent-id"] },
    ];

    const result = validateDependencyGraph(items);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("depends on non-existent item");
  });

  it("produces correct topological order for a valid DAG (prerequisites first)", () => {
    // 1: Book Venue -> 2: Send Invites (depends on 1) -> 3: Final Guest List (depends on 2)
    const items: TimelineItem[] = [
      { id: "3", title: "Final Guest List", status: "todo", depends_on: ["2"] },
      { id: "1", title: "Book Venue", status: "todo", depends_on: [] },
      { id: "2", title: "Send Invites", status: "todo", depends_on: ["1"] },
    ];

    const result = validateDependencyGraph(items);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);

    // Prerequisites must precede dependents in sorted order
    const idx1 = result.sortedIds.indexOf("1");
    const idx2 = result.sortedIds.indexOf("2");
    const idx3 = result.sortedIds.indexOf("3");

    expect(idx1).toBeLessThan(idx2);
    expect(idx2).toBeLessThan(idx3);
  });

  it("categorizes tasks into ready, blocked, and completed", () => {
    const items: TimelineItem[] = [
      { id: "1", title: "Book Venue", status: "done", depends_on: [] },
      { id: "2", title: "Send Invites", status: "todo", depends_on: ["1"] }, // ready because 1 is done
      { id: "3", title: "Catering Menu", status: "todo", depends_on: ["2"] }, // blocked because 2 is not done
      { id: "4", title: "Order Cake", status: "skipped", depends_on: [] },
    ];

    const { ready, blocked, completed } = categorizeTaskReadiness(items);

    expect(ready.map((i) => i.id)).toEqual(["2"]);
    expect(blocked.map((i) => i.id)).toEqual(["3"]);
    expect(completed.map((i) => i.id).sort()).toEqual(["1", "4"]);
  });

  it("calculates urgency mode correctly from event_at", () => {
    const now = new Date("2026-11-01T10:00:00Z");

    // Tonight: event in 6 hours
    const tonightEvent = new Date("2026-11-01T16:00:00Z");
    expect(calculateUrgencyMode(tonightEvent, now)).toBe("tonight");

    // This week: event in 4 days
    const thisWeekEvent = new Date("2026-11-05T10:00:00Z");
    expect(calculateUrgencyMode(thisWeekEvent, now)).toBe("this_week");

    // Weeks away: event in 20 days
    const weeksAwayEvent = new Date("2026-11-21T10:00:00Z");
    expect(calculateUrgencyMode(weeksAwayEvent, now)).toBe("weeks_away");

    // Null/undefined defaults to weeks_away
    expect(calculateUrgencyMode(null, now)).toBe("weeks_away");
  });

  it("flags infeasible deadlines when date is moved earlier or deadlines conflict", () => {
    const eventDate = "2026-11-05T18:00:00Z";
    const now = new Date("2026-11-01T10:00:00Z");

    const items: TimelineItem[] = [
      // 1. Task scheduled after the celebration event itself
      {
        id: "1",
        title: "Late DJ Setup",
        status: "todo",
        due_at: "2026-11-06T10:00:00Z", // AFTER eventDate!
        depends_on: [],
      },
      // 2. Task due before or at the same time as prerequisite
      {
        id: "2",
        title: "Design Invitation",
        status: "todo",
        due_at: "2026-11-03T12:00:00Z",
        depends_on: [],
      },
      {
        id: "3",
        title: "Print Invitation",
        status: "todo",
        due_at: "2026-11-02T12:00:00Z", // DUE BEFORE PREREQUISITE!
        depends_on: ["2"],
      },
      // 3. Task in the past
      {
        id: "4",
        title: "Overdue Task",
        status: "todo",
        due_at: "2026-10-30T10:00:00Z", // in the past relative to now
        depends_on: [],
      },
    ];

    const flags = detectInfeasibleDeadlines(items, eventDate, now);

    expect(flags.some((f) => f.itemId === "1" && f.reason === "due_after_event")).toBe(true);
    expect(flags.some((f) => f.itemId === "3" && f.reason === "due_before_prerequisite")).toBe(true);
    expect(flags.some((f) => f.itemId === "4" && f.reason === "overdue")).toBe(true);
  });
});


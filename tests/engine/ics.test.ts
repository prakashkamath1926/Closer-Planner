import { describe, it, expect } from "vitest";
import { generateOccasionIcs, escapeIcsText, formatIcsDateTime } from "@/lib/engine/ics";
import { calculateEventCountdown } from "@/lib/engine/countdown";
import { generateTonightRunSheet } from "@/lib/engine/run-sheet";

describe("engine/ics.ts: iCalendar RFC 5545 Generation", () => {
  it("generates valid RFC 5545 wrapper with UID, DTSTART, DTEND, and DTSTAMP in UTC", () => {
    const ics = generateOccasionIcs({
      occasion: {
        id: "occ-12345",
        title: "Mom's 60th Golden Jubilee",
        recipient_name: "Mom",
        event_at: "2026-11-15T18:30:00Z",
        is_surprise: false,
      },
      now: new Date("2026-10-29T12:00:00Z"),
    });

    expect(formatIcsDateTime("2026-11-15T18:30:00Z")).toBe("20261115T183000Z");
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("VERSION:2.0\r\n");
    expect(ics).toContain("PRODID:-//Closer//EN\r\n");
    expect(ics).toContain("BEGIN:VEVENT\r\n");
    expect(ics).toContain("UID:occasion-occ-12345@closer.app\r\n");
    expect(ics).toContain("DTSTAMP:20261029T120000Z\r\n");
    expect(ics).toContain("DTSTART:20261115T183000Z\r\n");
    expect(ics).toContain("DTEND:20261115T203000Z\r\n");
    expect(ics).toContain("SUMMARY:Mom's 60th Golden Jubilee\r\n");
    expect(ics).toContain("END:VEVENT\r\n");
    expect(ics).toContain("END:VCALENDAR\r\n");
  });

  it("includes all three VALARM reminders: 1 day, 1 hour, and 10 minutes before", () => {
    const ics = generateOccasionIcs({
      occasion: {
        id: "occ-999",
        title: "Anniversary Dinner",
        event_at: "2026-12-01T19:00:00Z",
        is_surprise: false,
      },
    });

    expect(ics).toContain("TRIGGER:-P1D\r\n");
    expect(ics).toContain("TRIGGER:-PT1H\r\n");
    expect(ics).toContain("TRIGGER:-PT10M\r\n");

    const valarmCount = (ics.match(/BEGIN:VALARM/g) || []).length;
    expect(valarmCount).toBe(3);
  });

  it("escapes special characters: backslashes, semicolons, commas, and newlines per RFC 5545", () => {
    const textWithSpecials = "Dinner, drinks; & gifts\\notes\nSurprise line 2";
    const escaped = escapeIcsText(textWithSpecials);

    expect(escaped).toBe("Dinner\\, drinks\\; & gifts\\\\notes\\nSurprise line 2");

    const ics = generateOccasionIcs({
      occasion: {
        id: "occ-specials",
        title: "Party; with cake, candles & lights\\music\nDress code: semi-formal",
        event_at: "2026-11-20T17:00:00Z",
        is_surprise: false,
      },
    });

    expect(ics).toContain("SUMMARY:Party\\; with cake\\, candles & lights\\\\music\\nDress code: semi-formal");
  });

  it("protects surprise occasions by using generic text ('Something special') unless organizer opts in", () => {
    // 1. Surprise without opt-in -> Generic text
    const surpriseIcs = generateOccasionIcs({
      occasion: {
        id: "occ-secret",
        title: "TOP SECRET: Flash Mob & Rooftop Dinner",
        recipient_name: "Maya",
        event_at: "2026-11-25T18:00:00Z",
        is_surprise: true,
      },
      optInSecretTitle: false,
    });

    expect(surpriseIcs).not.toContain("TOP SECRET");
    expect(surpriseIcs).not.toContain("Flash Mob");
    expect(surpriseIcs).toContain("SUMMARY:Something special for Maya\r\n");
    expect(surpriseIcs).toContain("DESCRIPTION:A celebration is scheduled. Private details are shielded.\r\n");

    // 2. Surprise with opt-in -> Full secret title
    const optedInIcs = generateOccasionIcs({
      occasion: {
        id: "occ-secret",
        title: "TOP SECRET: Flash Mob & Rooftop Dinner",
        recipient_name: "Maya",
        event_at: "2026-11-25T18:00:00Z",
        is_surprise: true,
      },
      optInSecretTitle: true,
    });

    expect(optedInIcs).toContain("SUMMARY:TOP SECRET: Flash Mob & Rooftop Dinner\r\n");
  });

  it("includes due plan items as linked sub-events with 30m reminders", () => {
    const ics = generateOccasionIcs({
      occasion: {
        id: "occ-tasks",
        title: "Weekend Getaway",
        event_at: "2026-11-30T10:00:00Z",
        is_surprise: false,
      },
      items: [
        { id: "task-1", title: "Pick up celebratory cake", due_at: "2026-11-30T08:00:00Z" },
        { id: "task-2", title: "Confirm venue access", due_at: "2026-11-29T16:00:00Z" },
      ],
    });

    expect(ics).toContain("UID:task-task-1@celebrationcompanion.app\r\n");
    expect(ics).toContain("SUMMARY:Pick up celebratory cake\r\n");
    expect(ics).toContain("UID:task-task-2@celebrationcompanion.app\r\n");
    expect(ics).toContain("SUMMARY:Confirm venue access\r\n");
    expect(ics).toContain("TRIGGER:-PT30M\r\n");
  });
});

describe("engine/countdown.ts: Timezone & Date Change Calculations", () => {
  it("calculates accurate countdown units (days, hours, minutes, seconds)", () => {
    const now = new Date("2026-10-29T10:00:00Z");
    const target = new Date("2026-10-31T14:30:15Z");

    const cd = calculateEventCountdown(target, now);

    expect(cd.days).toBe(2);
    expect(cd.hours).toBe(4);
    expect(cd.minutes).toBe(30);
    expect(cd.seconds).toBe(15);
    expect(cd.isPast).toBe(false);
    expect(cd.isToday).toBe(false);
  });

  it("handles event date moving earlier or later dynamically", () => {
    const now = new Date("2026-10-29T12:00:00Z");
    const originalDate = "2026-11-05T12:00:00Z"; // 7 days away
    const earlierDate = "2026-10-30T18:00:00Z"; // 1 day 6 hours away
    const laterDate = "2026-11-15T12:00:00Z"; // 17 days away

    const cdOriginal = calculateEventCountdown(originalDate, now);
    expect(cdOriginal.days).toBe(7);
    expect(cdOriginal.hours).toBe(0);

    const cdEarlier = calculateEventCountdown(earlierDate, now);
    expect(cdEarlier.days).toBe(1);
    expect(cdEarlier.hours).toBe(6);

    const cdLater = calculateEventCountdown(laterDate, now);
    expect(cdLater.days).toBe(17);
    expect(cdLater.hours).toBe(0);
  });

  it("correctly identifies same-day (isToday) and past events (isPast)", () => {
    const now = new Date("2026-10-29T10:00:00Z");
    const todayTarget = new Date("2026-10-29T18:00:00Z"); // 8 hours away today
    const pastTarget = new Date("2026-10-28T10:00:00Z"); // 1 day ago

    const cdToday = calculateEventCountdown(todayTarget, now);
    expect(cdToday.isToday).toBe(true);
    expect(cdToday.isPast).toBe(false);
    expect(cdToday.hours).toBe(8);

    const cdPast = calculateEventCountdown(pastTarget, now);
    expect(cdPast.isPast).toBe(true);
    expect(cdPast.totalSecondsRemaining).toBe(0);
  });
});

describe("engine/run-sheet.ts: 'Tonight' Mode Dependency-Ordered Run Sheet", () => {
  it("strictly orders tasks so that prerequisites precede dependent tasks", () => {
    // Setup tasks with dependencies:
    // Task 3 depends on Task 2; Task 2 depends on Task 1
    const rawItems = [
      { id: "task-3", title: "Toast & Cake Reveal", status: "todo" as const, depends_on: ["task-2"] },
      { id: "task-1", title: "Pick up food & decor", status: "todo" as const, depends_on: [] },
      { id: "task-2", title: "Set up venue & playlist", status: "todo" as const, depends_on: ["task-1"] },
    ];

    const slots = generateTonightRunSheet(rawItems, {
      eventAt: "2026-10-29T21:00:00Z",
      startTime: "2026-10-29T18:00:00Z",
      defaultSlotDurationMinutes: 30,
    });

    expect(slots.length).toBe(3);

    // Verify ordering
    expect(slots[0].itemId).toBe("task-1");
    expect(slots[0].itemTitle).toBe("Pick up food & decor");

    expect(slots[1].itemId).toBe("task-2");
    expect(slots[1].itemTitle).toBe("Set up venue & playlist");
    expect(slots[1].dependsOnIds).toContain("task-1");

    expect(slots[2].itemId).toBe("task-3");
    expect(slots[2].itemTitle).toBe("Toast & Cake Reveal");
    expect(slots[2].dependsOnIds).toContain("task-2");

    // Verify chronological slots
    expect(slots[0].start.getTime()).toBeLessThan(slots[1].start.getTime());
    expect(slots[1].start.getTime()).toBeLessThan(slots[2].start.getTime());
  });

  it("marks tasks with uncompleted prerequisites as 'blocked'", () => {
    const rawItems = [
      { id: "dep-a", title: "Prerequisite Task A", status: "todo" as const, depends_on: [] },
      { id: "task-b", title: "Dependent Task B", status: "todo" as const, depends_on: ["dep-a"] },
    ];

    const slots = generateTonightRunSheet(rawItems, {
      eventAt: "2026-10-29T20:00:00Z",
      startTime: "2026-10-29T18:00:00Z",
    });

    const slotA = slots.find((s) => s.itemId === "dep-a");
    const slotB = slots.find((s) => s.itemId === "task-b");

    expect(slotA?.readiness).toBe("ready");
    expect(slotB?.readiness).toBe("blocked");
  });

  it("marks tasks with completed prerequisites as 'ready' and done tasks as 'done'", () => {
    const rawItems = [
      { id: "dep-done", title: "Completed Task A", status: "done" as const, depends_on: [] },
      { id: "task-ready", title: "Ready Task B", status: "todo" as const, depends_on: ["dep-done"] },
    ];

    const slots = generateTonightRunSheet(rawItems, {
      eventAt: "2026-10-29T20:00:00Z",
      startTime: "2026-10-29T18:00:00Z",
    });

    const slotA = slots.find((s) => s.itemId === "dep-done");
    const slotB = slots.find((s) => s.itemId === "task-ready");

    expect(slotA?.readiness).toBe("done");
    expect(slotB?.readiness).toBe("ready");
  });
});


"use client";

import React, { useState, useMemo, useSyncExternalStore } from "react";
import { Calendar as CalendarIcon, Clock, Download, ListOrdered, CalendarDays, ShieldAlert, CheckCircle2, AlertCircle, AlertTriangle } from "lucide-react";
import { calculateEventCountdown } from "@/lib/engine/countdown";
import { generateOccasionIcs } from "@/lib/engine/ics";
import { generateTonightRunSheet, RunSheetSlot } from "@/lib/engine/run-sheet";
import { PlanItemRecord, OccasionRecord } from "./plan-view";

// Managed store that caches the timestamp and updates listeners on a 1-second interval
let currentNow = Date.now();
const listeners = new Set<() => void>();
let timerIntervalId: ReturnType<typeof setInterval> | null = null;

const timeStore = {
  subscribe(callback: () => void) {
    listeners.add(callback);
    if (listeners.size === 1) {
      timerIntervalId = setInterval(() => {
        currentNow = Date.now();
        listeners.forEach((listener) => listener());
      }, 1000);
    }
    return () => {
      listeners.delete(callback);
      if (listeners.size === 0 && timerIntervalId) {
        clearInterval(timerIntervalId);
        timerIntervalId = null;
      }
    };
  },
  getSnapshot() {
    return currentNow;
  },
  getServerSnapshot() {
    return 0;
  },
};

const emptySubscribe = () => () => {};

function useHasNotificationSupport() {
  return useSyncExternalStore(
    emptySubscribe,
    () => typeof window !== "undefined" && "Notification" in window,
    () => false,
  );
}

interface CalendarViewProps {
  occasion: OccasionRecord;
  items: PlanItemRecord[];
}

export function CalendarView({ occasion, items }: CalendarViewProps) {
  const [activeTab, setActiveTab] = useState<"agenda" | "month" | "runsheet">("agenda");
  const [optInSecretTitle, setOptInSecretTitle] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<string>("default");
  const hasNotificationSupport = useHasNotificationSupport();

  const nowMs = useSyncExternalStore(timeStore.subscribe, timeStore.getSnapshot, timeStore.getServerSnapshot);

  // Countdown derived cleanly from subscribed time
  const countdown = useMemo(() => {
    return calculateEventCountdown(occasion.event_at, nowMs > 0 ? new Date(nowMs) : new Date(occasion.event_at || 0));
  }, [occasion.event_at, nowMs]);

  // Request browser notification permission if requested
  const requestNotificationPermission = async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        const perm = await Notification.requestPermission();
        setNotificationStatus(perm);
      } catch {
        setNotificationStatus("denied");
      }
    }
  };

  // Download .ics handler
  const handleDownloadIcs = () => {
    const icsString = generateOccasionIcs({
      occasion: {
        id: occasion.id,
        title: occasion.title,
        recipient_name: occasion.recipient_name,
        event_at: occasion.event_at,
        is_surprise: occasion.urgency_mode === "tonight" ? false : Boolean(occasion.is_surprise),
      },
      items: items.map((i) => ({
        id: i.id,
        title: i.title,
        due_at: i.due_at,
        status: i.status,
      })),
      optInSecretTitle,
    });

    const blob = new Blob([icsString], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${occasion.title.replace(/[^a-z0-9]/gi, "_").toLowerCase() || "celebration"}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // "Tonight" run sheet calculation
  const runSheetSlots: RunSheetSlot[] = useMemo(() => {
    if (!occasion.event_at) return [];
    return generateTonightRunSheet(
      items.map((i) => ({
        id: i.id,
        title: i.title,
        category: i.category,
        status: i.status,
        due_at: i.due_at,
        depends_on: i.depends_on,
        estimated_cost: i.estimated_cost || 0,
      })),
      {
        eventAt: occasion.event_at,
        defaultSlotDurationMinutes: 25,
      }
    );
  }, [items, occasion.event_at]);

  // Sorted tasks with due dates for Agenda view
  const datedTasks = useMemo(() => {
    return items
      .filter((i) => Boolean(i.due_at))
      .map((i) => {
        const dueMs = new Date(i.due_at!).getTime();
        const isDone = i.status === "done" || i.status === "skipped";
        const isOverdue = !isDone && nowMs > 0 && dueMs < nowMs;
        return {
          ...i,
          dueMs,
          isDone,
          isOverdue,
        };
      })
      .sort((a, b) => a.dueMs - b.dueMs);
  }, [items, nowMs]);

  // Month grid calculation
  const eventDate = occasion.event_at ? new Date(occasion.event_at) : new Date();
  const [viewMonthYear, setViewMonthYear] = useState(() => ({
    year: eventDate.getFullYear(),
    month: eventDate.getMonth(), // 0-indexed
  }));

  const monthGridDays = useMemo(() => {
    const { year, month } = viewMonthYear;
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const startDayIndex = firstDayOfMonth.getDay(); // 0 is Sunday
    const totalDays = lastDayOfMonth.getDate();

    const days: Array<{
      dateNumber: number;
      fullDateStr: string;
      isEventDay: boolean;
      tasks: typeof items;
    }> = [];

    for (let d = 1; d <= totalDays; d++) {
      const cur = new Date(year, month, d);
      const curStr = cur.toISOString().split("T")[0];

      const isEventDay = occasion.event_at
        ? new Date(occasion.event_at).toISOString().split("T")[0] === curStr
        : false;

      const tasksOnDay = items.filter((i) => {
        if (!i.due_at) return false;
        return new Date(i.due_at).toISOString().split("T")[0] === curStr;
      });

      days.push({
        dateNumber: d,
        fullDateStr: curStr,
        isEventDay,
        tasks: tasksOnDay,
      });
    }

    return { startDayIndex, days, monthName: firstDayOfMonth.toLocaleString("default", { month: "long" }) };
  }, [viewMonthYear, occasion.event_at, items]);

  return (
    <section
      aria-labelledby="calendar-heading"
      className="rounded-2xl border border-blush bg-sand/30 p-5 shadow-xs sm:p-6"
    >
      {/* Header and Countdown */}
      <div className="flex flex-col justify-between gap-4 border-b border-blush pb-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-rose" aria-hidden="true" />
            <h2 id="calendar-heading" className="font-serif text-xl font-bold text-plum sm:text-2xl">
              Timeline, Countdown & Calendar
            </h2>
          </div>
          <p className="mt-1 text-xs text-mauve">
            Track milestones, minute-by-minute Tonight schedules, and export to Google Calendar or Apple iCal.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadIcs}
            className="inline-flex items-center gap-2 rounded-xl border border-rose bg-white px-3.5 py-2 text-xs font-medium text-rose shadow-xs hover:bg-blush focus:outline-hidden focus:ring-2 focus:ring-rose/40"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export .ics Calendar
          </button>

          {hasNotificationSupport && (
            <button
              type="button"
              onClick={requestNotificationPermission}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-white px-3 py-2 text-xs font-medium text-plum/80 hover:bg-sand/60 focus:outline-hidden focus:ring-2 focus:ring-rose/40"
            >
              <Clock className="h-3.5 w-3.5 text-mauve" aria-hidden="true" />
              {notificationStatus === "granted" ? "Alerts Enabled" : "Enable Browser Alerts"}
            </button>
          )}
        </div>
      </div>

      {/* Countdown Card (Respects prefers-reduced-motion) */}
      {occasion.event_at && (
        <div className="mt-5 rounded-xl border border-blush bg-white p-4 shadow-xs">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-mauve">
                Countdown to {occasion.title}
              </span>
              <p className="text-xs text-mauve/80" suppressHydrationWarning>
                {countdown.isPast ? "Event has arrived!" : "Time remaining to the celebration"}
              </p>
            </div>

            {/* Countdown Digits */}
            <div
              className="flex items-center gap-2 sm:gap-3"
              role="timer"
              aria-live="polite"
              aria-label={`Countdown: ${countdown.days} days, ${countdown.hours} hours, ${countdown.minutes} minutes, ${countdown.seconds} seconds`}
              suppressHydrationWarning
            >
              <div className="flex min-w-[50px] flex-col items-center rounded-lg bg-sand/60 px-2.5 py-1.5 text-center">
                <span className="font-mono text-xl font-bold text-plum transition-none motion-reduce:transition-none sm:text-2xl">
                  {countdown.days}
                </span>
                <span className="text-[10px] font-medium uppercase text-mauve">Days</span>
              </div>
              <span className="text-base font-bold text-mauve">:</span>

              <div className="flex min-w-[50px] flex-col items-center rounded-lg bg-sand/60 px-2.5 py-1.5 text-center">
                <span className="font-mono text-xl font-bold text-plum transition-none motion-reduce:transition-none sm:text-2xl">
                  {countdown.hours}
                </span>
                <span className="text-[10px] font-medium uppercase text-mauve">Hours</span>
              </div>
              <span className="text-base font-bold text-mauve">:</span>

              <div className="flex min-w-[50px] flex-col items-center rounded-lg bg-sand/60 px-2.5 py-1.5 text-center">
                <span className="font-mono text-xl font-bold text-plum transition-none motion-reduce:transition-none sm:text-2xl">
                  {countdown.minutes}
                </span>
                <span className="text-[10px] font-medium uppercase text-mauve">Mins</span>
              </div>
              <span className="text-base font-bold text-mauve">:</span>

              <div className="flex min-w-[50px] flex-col items-center rounded-lg bg-sand/60 px-2.5 py-1.5 text-center">
                <span className="font-mono text-xl font-bold text-rose transition-none motion-reduce:transition-none sm:text-2xl">
                  {countdown.seconds}
                </span>
                <span className="text-[10px] font-medium uppercase text-mauve">Secs</span>
              </div>
            </div>
          </div>

          {/* Surprise Shield ICS toggle */}
          {Boolean(occasion.is_surprise) && (
            <div className="mt-3 flex items-center gap-2 border-t border-blush/60 pt-3 text-xs text-mauve">
              <ShieldAlert className="h-4 w-4 text-peach" aria-hidden="true" />
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={optInSecretTitle}
                  onChange={(e) => setOptInSecretTitle(e.target.checked)}
                  className="rounded border-mauve/40 text-rose focus:ring-rose"
                />
                <span>Include secret event title in .ics export (unchecked uses generic &quot;Something special&quot;)</span>
              </label>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="mt-6 flex flex-wrap gap-2 border-b border-blush pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("agenda")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === "agenda"
              ? "bg-rose text-white shadow-xs"
              : "bg-white text-plum hover:bg-sand/60"
          }`}
        >
          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
          Agenda View ({datedTasks.length} Due Tasks)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("month")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === "month"
              ? "bg-rose text-white shadow-xs"
              : "bg-white text-plum hover:bg-sand/60"
          }`}
        >
          <CalendarIcon className="h-3.5 w-3.5" aria-hidden="true" />
          Month View
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("runsheet")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === "runsheet"
              ? "bg-rose text-white shadow-xs"
              : "bg-white text-plum hover:bg-sand/60"
          }`}
        >
          <ListOrdered className="h-3.5 w-3.5" aria-hidden="true" />
          &quot;Tonight&quot; Run Sheet ({runSheetSlots.length} Slots)
        </button>
      </div>

      {/* Tab 1: Agenda View */}
      {activeTab === "agenda" && (
        <div className="mt-4 space-y-3">
          {/* Main Celebration Row */}
          {occasion.event_at && (
            <div className="flex flex-col justify-between gap-2 rounded-xl border-2 border-rose/40 bg-peach/20 p-3.5 sm:flex-row sm:items-center">
              <div>
                <span className="rounded-md bg-rose px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  Main Event
                </span>
                <h4 className="mt-1 font-serif text-base font-bold text-plum">{occasion.title}</h4>
                <p className="text-xs text-mauve">
                  📅 {new Date(occasion.event_at).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}
                </p>
              </div>
              <span className="self-start rounded-full bg-peach/50 px-3 py-1 text-xs font-semibold text-plum sm:self-center">
                Celebration Target
              </span>
            </div>
          )}

          {/* Task Due Dates */}
          {datedTasks.length === 0 ? (
            <p className="py-6 text-center text-xs text-mauve">
              No tasks currently have assigned due dates. Add due dates to tasks to see them in the chronological agenda.
            </p>
          ) : (
            datedTasks.map((t) => (
              <div
                key={t.id}
                className="flex flex-col justify-between gap-2 rounded-xl border border-blush bg-white p-3 shadow-2xs sm:flex-row sm:items-center"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-plum">
                      {new Date(t.due_at!).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="text-xs font-medium text-mauve capitalize">({t.category})</span>
                  </div>
                  <h4 className="text-sm font-semibold text-plum">{t.title}</h4>
                  {t.depends_on && t.depends_on.length > 0 && (
                    <p className="text-[11px] text-mauve">Prerequisites: {t.depends_on.length} task(s)</p>
                  )}
                </div>

                {/* Urgency and Status Labels (Labels, not color alone, Rule 27) */}
                <div className="flex items-center gap-2">
                  {t.isDone ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      DONE
                    </span>
                  ) : t.isOverdue ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">
                      <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      OVERDUE
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-sand px-2 py-0.5 text-xs font-medium text-plum">
                      <Clock className="h-3.5 w-3.5 text-mauve" aria-hidden="true" />
                      UPCOMING
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 2: Month View */}
      {activeTab === "month" && (
        <div className="mt-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="font-serif text-base font-bold text-plum">
              {monthGridDays.monthName} {viewMonthYear.year}
            </h4>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setViewMonthYear((prev) => ({
                    year: prev.month === 0 ? prev.year - 1 : prev.year,
                    month: prev.month === 0 ? 11 : prev.month - 1,
                  }))
                }
                className="rounded-lg border border-border bg-white px-2.5 py-1 text-xs font-semibold text-plum hover:bg-sand/60"
              >
                &larr; Prev
              </button>
              <button
                type="button"
                onClick={() =>
                  setViewMonthYear((prev) => ({
                    year: prev.month === 11 ? prev.year + 1 : prev.year,
                    month: prev.month === 11 ? 0 : prev.month + 1,
                  }))
                }
                className="rounded-lg border border-border bg-white px-2.5 py-1 text-xs font-semibold text-plum hover:bg-sand/60"
              >
                Next &rarr;
              </button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1 text-center font-mono text-[11px] font-semibold text-mauve">
            <span>Sun</span>
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1">
            {/* Empty cells before 1st of month */}
            {Array.from({ length: monthGridDays.startDayIndex }).map((_, i) => (
              <div key={`empty-${i}`} className="h-16 rounded-lg bg-sand/20" />
            ))}

            {/* Month Days */}
            {monthGridDays.days.map((day) => (
              <div
                key={day.fullDateStr}
                className={`flex h-16 flex-col justify-between rounded-lg p-1 text-left text-xs ${
                  day.isEventDay
                    ? "border-2 border-rose bg-peach/30 font-bold text-plum"
                    : day.tasks.length > 0
                      ? "border border-blush bg-white"
                      : "bg-white/60 text-mauve"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold">{day.dateNumber}</span>
                  {day.isEventDay && (
                    <span className="rounded-full bg-rose px-1 py-0.2 text-[9px] text-white">★ EVENT</span>
                  )}
                </div>

                {day.tasks.length > 0 && (
                  <div className="truncate text-[10px] text-rose">
                    {day.tasks.length} task{day.tasks.length > 1 ? "s" : ""}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Tonight Mode Run Sheet */}
      {activeTab === "runsheet" && (
        <div className="mt-4">
          <div className="mb-3 rounded-lg bg-sand/60 p-3 text-xs text-mauve">
            <span className="font-semibold text-plum">Minute-by-minute execution schedule:</span> Tasks are
            ordered by dependency constraints so prerequisites always precede dependent tasks.
          </div>

          {runSheetSlots.length === 0 ? (
            <p className="py-6 text-center text-xs text-mauve">
              No plan tasks available to generate the Tonight run sheet.
            </p>
          ) : (
            <div className="space-y-2.5">
              {runSheetSlots.map((slot) => (
                <div
                  key={slot.itemId}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-blush bg-white p-3.5 shadow-2xs sm:flex-row sm:items-center"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 font-mono text-xs font-bold text-rose">
                      #{slot.slotIndex}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-plum">
                          ⏱️ {slot.timeRangeDisplay}
                        </span>
                        <span className="text-[11px] text-mauve">({slot.durationMinutes}m)</span>
                      </div>
                      <h4 className="mt-0.5 text-sm font-semibold text-plum">{slot.itemTitle}</h4>
                      {slot.dependsOnTitles.length > 0 && (
                        <p className="mt-0.5 text-[11px] text-mauve">
                          Depends on: {slot.dependsOnTitles.join(", ")}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Readiness Label (Labels, not color alone, Rule 27) */}
                  <div className="self-end sm:self-center">
                    {slot.readiness === "done" ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        DONE
                      </span>
                    ) : slot.readiness === "blocked" ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                        BLOCKED (Prereq undone)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-peach/40 px-2.5 py-1 text-xs font-semibold text-plum">
                        <Clock className="h-3.5 w-3.5 text-rose" aria-hidden="true" />
                        READY TO EXECUTE
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}


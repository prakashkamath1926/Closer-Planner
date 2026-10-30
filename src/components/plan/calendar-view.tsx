"use client";

import React, { useState, useMemo, useSyncExternalStore } from "react";
import { Clock, Download, ListOrdered, CalendarDays, ShieldAlert, CheckCircle2, AlertCircle, AlertTriangle } from "lucide-react";
import { calculateEventCountdown } from "@/lib/engine/countdown";
import { generateOccasionIcs } from "@/lib/engine/ics";
import { generateTonightRunSheet, RunSheetSlot } from "@/lib/engine/run-sheet";
import { PlanItemRecord, OccasionRecord } from "./plan-view";
import { ClientDateTime } from "@/components/client-date-time";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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

    return { startDayIndex, days, monthName: MONTH_NAMES[month] || "Month" };
  }, [viewMonthYear, occasion.event_at, items]);

  return (
    <section aria-labelledby="calendar-heading" className="space-y-6">
      {/* 1. Countdown Hero Card - Largest visual weight on Timeline tab */}
      {occasion.event_at ? (
        <div className="rounded-3xl border border-blush bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-rose" aria-hidden="true" />
                <span className="text-xs font-semibold tracking-wider text-mauve uppercase">
                  Celebration Countdown
                </span>
              </div>
              <h2 id="calendar-heading" className="font-serif text-2xl font-bold text-plum sm:text-3xl">
                {occasion.title}
              </h2>
              <p className="text-sm text-mauve" suppressHydrationWarning>
                {countdown.isPast
                  ? "The celebration moment has arrived!"
                  : "Time remaining until the celebration begins"}
              </p>
            </div>

            {/* Large Hero Countdown Digits */}
            <div
              className="flex items-center justify-center gap-2 sm:gap-4"
              role="timer"
              aria-live="polite"
              aria-label={`Countdown: ${countdown.days} days, ${countdown.hours} hours, ${countdown.minutes} minutes, ${countdown.seconds} seconds`}
              suppressHydrationWarning
            >
              <div className="flex min-w-[64px] flex-col items-center rounded-2xl bg-sand/60 px-3 py-2.5 text-center sm:min-w-[80px] sm:px-4 sm:py-3.5 shadow-2xs">
                <span className="font-mono text-3xl font-bold text-plum transition-none motion-reduce:transition-none sm:text-5xl">
                  {countdown.days}
                </span>
                <span className="mt-1 text-xs font-semibold uppercase tracking-wider text-mauve">Days</span>
              </div>
              <span className="text-xl font-bold text-mauve/60 sm:text-2xl">:</span>

              <div className="flex min-w-[64px] flex-col items-center rounded-2xl bg-sand/60 px-3 py-2.5 text-center sm:min-w-[80px] sm:px-4 sm:py-3.5 shadow-2xs">
                <span className="font-mono text-3xl font-bold text-plum transition-none motion-reduce:transition-none sm:text-5xl">
                  {countdown.hours}
                </span>
                <span className="mt-1 text-xs font-semibold uppercase tracking-wider text-mauve">Hours</span>
              </div>
              <span className="text-xl font-bold text-mauve/60 sm:text-2xl">:</span>

              <div className="flex min-w-[64px] flex-col items-center rounded-2xl bg-sand/60 px-3 py-2.5 text-center sm:min-w-[80px] sm:px-4 sm:py-3.5 shadow-2xs">
                <span className="font-mono text-3xl font-bold text-plum transition-none motion-reduce:transition-none sm:text-5xl">
                  {countdown.minutes}
                </span>
                <span className="mt-1 text-xs font-semibold uppercase tracking-wider text-mauve">Mins</span>
              </div>
              <span className="text-xl font-bold text-mauve/60 sm:text-2xl">:</span>

              <div className="flex min-w-[64px] flex-col items-center rounded-2xl bg-sand/60 px-3 py-2.5 text-center sm:min-w-[80px] sm:px-4 sm:py-3.5 shadow-2xs">
                <span className="font-mono text-3xl font-bold text-rose transition-none motion-reduce:transition-none sm:text-5xl">
                  {countdown.seconds}
                </span>
                <span className="mt-1 text-xs font-semibold uppercase tracking-wider text-rose">Secs</span>
              </div>
            </div>
          </div>

          {/* Surprise Shield ICS toggle */}
          {Boolean(occasion.is_surprise) && (
            <div className="mt-5 flex items-center gap-2 border-t border-blush/60 pt-4 text-xs text-mauve sm:text-sm">
              <ShieldAlert className="h-4 w-4 shrink-0 text-peach" aria-hidden="true" />
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
      ) : (
        <div className="rounded-3xl border border-dashed border-mauve/20 bg-white p-6 text-center text-sm text-mauve">
          Target date not set yet. Adjust the plan date to enable the live countdown.
        </div>
      )}

      {/* 2. Timeline Controls & Schedule View Switcher */}
      <div className="flex flex-col justify-between gap-4 border-b border-blush pb-4 sm:flex-row sm:items-center">
        {/* View Switcher Pills */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("agenda")}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose ${
              activeTab === "agenda"
                ? "bg-rose text-white shadow-xs"
                : "bg-white text-mauve hover:text-plum hover:bg-blush border border-mauve/20"
            }`}
          >
            <ListOrdered className="h-4 w-4" aria-hidden="true" />
            <span>Agenda View</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("month")}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose ${
              activeTab === "month"
                ? "bg-rose text-white shadow-xs"
                : "bg-white text-mauve hover:text-plum hover:bg-blush border border-mauve/20"
            }`}
          >
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            <span>Month View</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("runsheet")}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose ${
              activeTab === "runsheet"
                ? "bg-rose text-white shadow-xs"
                : "bg-white text-mauve hover:text-plum hover:bg-blush border border-mauve/20"
            }`}
          >
            <Clock className="h-4 w-4" aria-hidden="true" />
            <span>&ldquo;Tonight&rdquo; Run Sheet</span>
          </button>
        </div>

        {/* Calendar Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadIcs}
            className="inline-flex items-center gap-2 rounded-xl border border-rose bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-rose shadow-xs hover:bg-blush focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose transition-colors"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>Export .ics Calendar</span>
          </button>

          {hasNotificationSupport && (
            <button
              type="button"
              onClick={requestNotificationPermission}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-white px-3 py-2 text-xs sm:text-sm font-medium text-plum/80 hover:bg-sand/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose transition-colors"
            >
              <Clock className="h-3.5 w-3.5 text-mauve" aria-hidden="true" />
              <span>{notificationStatus === "granted" ? "Alerts Enabled" : "Enable Browser Alerts"}</span>
            </button>
          )}
        </div>
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
                  <ClientDateTime
                    date={occasion.event_at}
                    options={{ dateStyle: "full", timeStyle: "short" }}
                    prefix="📅 "
                  />
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
                      <ClientDateTime
                        date={t.due_at!}
                        options={{
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }}
                      />
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


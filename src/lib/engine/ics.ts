/**
 * RFC 5545 iCalendar (.ics) Generator.
 *
 * Rules:
 * - RFC 5545 compliant format.
 * - Deterministic, pure engine logic; zero external AI/network dependencies.
 * - Text escaping: backslashes, commas, semicolons, and newlines must be escaped.
 * - VALARMs: 1 day before (-P1D), 1 hour before (-PT1H), 10 minutes before (-PT10M).
 * - Surprise protection: generic title ("Something special") unless organizer opts in.
 */

import { APP_NAME } from "@/lib/brand";

export interface IcsEventParams {
  occasion: {
    id: string;
    title: string;
    recipient_name?: string | null;
    event_at?: string | null;
    is_surprise?: boolean;
    occasion_type?: string | null;
  };
  items?: Array<{
    id: string;
    title: string;
    due_at?: string | null;
    status?: string;
  }>;
  /** Whether the organizer explicitly opts in to include the secret title for surprises */
  optInSecretTitle?: boolean;
  now?: Date;
}

/**
 * Escapes characters for iCalendar text values per RFC 5545 §3.3.11.
 * Must escape: backslash (\), semicolon (;), comma (,), and newline (\n).
 */
export function escapeIcsText(text: string): string {
  if (!text) return "";
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Formats a Date or ISO date string into iCalendar UTC datetime: YYYYMMDDTHHMMSSZ.
 */
export function formatIcsDateTime(dateInput: Date | string): string {
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date input for ICS: ${dateInput}`);
  }

  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

  const year = d.getUTCFullYear();
  const month = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const hours = pad(d.getUTCHours());
  const minutes = pad(d.getUTCMinutes());
  const seconds = pad(d.getUTCSeconds());

  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * Generates an RFC 5545 .ics calendar string.
 */
export function generateOccasionIcs(params: IcsEventParams): string {
  const { occasion, items = [], optInSecretTitle = false, now = new Date() } = params;
  const nowUtc = formatIcsDateTime(now);

  const isSurprise = Boolean(occasion.is_surprise);
  const useGeneric = isSurprise && !optInSecretTitle;

  // Title selection per Surprise Shield rules
  const summaryText = useGeneric
    ? occasion.recipient_name
      ? `Something special for ${occasion.recipient_name}`
      : "Something special"
    : occasion.title;

  const descriptionText = useGeneric
    ? "A celebration is scheduled. Private details are shielded."
    : `Celebration for ${occasion.recipient_name || "a loved one"}.\nScheduled via ${APP_NAME}.`;

  const eventDate = occasion.event_at ? new Date(occasion.event_at) : new Date(now.getTime() + 86400000);
  const dtStart = formatIcsDateTime(eventDate);
  // Default duration: 2 hours
  const eventEndDate = new Date(eventDate.getTime() + 2 * 60 * 60 * 1000);
  const dtEnd = formatIcsDateTime(eventEndDate);

  const uid = `occasion-${occasion.id}@closer.app`;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${APP_NAME}//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${nowUtc}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(summaryText)}`,
    `DESCRIPTION:${escapeIcsText(descriptionText)}`,
    "STATUS:CONFIRMED",
    // Reminder 1: 1 day before
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    `DESCRIPTION:Reminder: ${escapeIcsText(summaryText)} is tomorrow`,
    "END:VALARM",
    // Reminder 2: 1 hour before
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    `DESCRIPTION:Reminder: ${escapeIcsText(summaryText)} begins in 1 hour`,
    "END:VALARM",
    // Reminder 3: 10 minutes before
    "BEGIN:VALARM",
    "TRIGGER:-PT10M",
    "ACTION:DISPLAY",
    `DESCRIPTION:Reminder: ${escapeIcsText(summaryText)} begins in 10 minutes`,
    "END:VALARM",
    "END:VEVENT",
  ];

  // Optional: add due tasks as separate calendar events or VTODOs
  for (const item of items) {
    if (item.due_at) {
      const taskStart = formatIcsDateTime(new Date(item.due_at));
      const taskEnd = formatIcsDateTime(new Date(new Date(item.due_at).getTime() + 30 * 60 * 1000));
      const taskUid = `task-${item.id}@celebrationcompanion.app`;
      const taskSummary = useGeneric ? "Celebration prep task" : item.title;

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${taskUid}`);
      lines.push(`DTSTAMP:${nowUtc}`);
      lines.push(`DTSTART:${taskStart}`);
      lines.push(`DTEND:${taskEnd}`);
      lines.push(`SUMMARY:${escapeIcsText(taskSummary)}`);
      lines.push(`DESCRIPTION:Preparation task for ${escapeIcsText(summaryText)}`);
      lines.push("STATUS:CONFIRMED");
      lines.push("BEGIN:VALARM");
      lines.push("TRIGGER:-PT30M");
      lines.push("ACTION:DISPLAY");
      lines.push(`DESCRIPTION:Due soon: ${escapeIcsText(taskSummary)}`);
      lines.push("END:VALARM");
      lines.push("END:VEVENT");
    }
  }

  lines.push("END:VCALENDAR");

  // RFC 5545 requires CRLF line endings
  return lines.join("\r\n") + "\r\n";
}


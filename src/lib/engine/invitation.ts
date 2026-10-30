/**
 * Invitation Payload Builder & Deliverable Engine (prd.md 6.10 & Task 9).
 *
 * Rules:
 * - Generates invitation data strictly from recipient-approved fields.
 * - HARD NEGATIVE REQUIREMENT: Never includes plan items, budget, vendors, or private notes.
 * - Formats reviewed `mailto:` email drafts with URL-encoded fields (no autonomous sending).
 * - Fixed layout template uses design tokens and SVG botanicals.
 */

export interface InvitationInputOccasion {
  id: string;
  title: string;
  recipient_name?: string | null;
  occasion_type?: string | null;
  event_at?: string | null;
  is_surprise?: boolean;
  // Organiser-only fields that must NEVER be passed through:
  budget_total?: unknown;
  avoid_notes?: unknown;
  owner_id?: unknown;
  plan_items?: unknown;
  vendors?: unknown;
  notes?: unknown;
  [key: string]: unknown;
}

export interface InvitationRecipientView {
  headline?: string | null;
  message?: string | null;
  reveal_at?: string | null;
  [key: string]: unknown;
}

export interface PublicInvitationPayload {
  headline: string;
  recipientName: string;
  occasionType: string;
  eventDate: string | null;
  warmMessage: string;
  dressCodeNote?: string;
  locationNote?: string;
}

/**
 * Builds the strictly allowlisted public invitation payload.
 * Completely excludes internal organizer fields.
 */
export function buildInvitationPayload(
  occasion: InvitationInputOccasion,
  recipientView?: InvitationRecipientView | null,
  options?: {
    dressCodeNote?: string;
    locationNote?: string;
  },
): PublicInvitationPayload {
  const recipientName = occasion.recipient_name?.trim() || "our guest of honor";
  const occasionType = occasion.occasion_type?.trim() || "Celebration";

  // Use recipient_view headline/message if published/approved, otherwise warm default
  const headline =
    recipientView?.headline?.trim() ||
    `Join us in celebrating ${recipientName}`;

  const warmMessage =
    recipientView?.message?.trim() ||
    `We are gathering together for a meaningful and memorable ${occasionType.toLowerCase()} honoring ${recipientName}. Your presence would mean the world to us.`;

  return {
    headline,
    recipientName,
    occasionType,
    eventDate: occasion.event_at || null,
    warmMessage,
    dressCodeNote: options?.dressCodeNote || "Comfortable & celebratory attire",
    locationNote: options?.locationNote || "Details shared directly with guests",
  };
}

/**
 * Generates a static, standalone HTML string for download.
 * Fixed template styled with locked design tokens (palette from design.md)
 * and inline SVG botanical decorations.
 */
export function generateInvitationHtml(payload: PublicInvitationPayload): string {
  const formattedDate = payload.eventDate
    ? new Date(payload.eventDate).toLocaleDateString(undefined, {
        dateStyle: "full",
      })
    : "Date to be announced";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeXml(payload.headline)}</title>
  <style>
    body {
      margin: 0;
      padding: 40px 16px;
      background-color: #FAF6F0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #2E1A2B;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      box-sizing: border-box;
    }
    .card {
      max-width: 500px;
      width: 100%;
      background-color: #FFFFFF;
      border: 1px solid #F0D4CE;
      border-radius: 24px;
      padding: 36px 32px;
      text-align: center;
      box-shadow: 0 4px 24px rgba(46, 26, 43, 0.06);
      box-sizing: border-box;
    }
    .botanical {
      width: 32px;
      height: 32px;
      margin: 0 auto 12px;
      color: #9E526B;
      display: block;
    }
    .tagline {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: #9E526B;
      margin-bottom: 8px;
    }
    h1 {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 24px;
      font-weight: 700;
      color: #2E1A2B;
      margin: 0 0 14px;
      line-height: 1.35;
    }
    .date-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background-color: #FFE9DF;
      color: #A63A5C;
      padding: 6px 16px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 600;
      margin: 0 auto 20px;
    }
    .message {
      font-size: 15px;
      line-height: 1.6;
      color: #7A5C6B;
      margin: 0 0 24px;
    }
    .details {
      border-top: 1px solid #F0D4CE;
      padding-top: 18px;
      font-size: 13px;
      color: #7A5C6B;
      display: flex;
      flex-direction: column;
      gap: 8px;
      text-align: left;
    }
    .details strong {
      color: #2E1A2B;
    }
  </style>
</head>
<body>
  <div class="card">
    <svg class="botanical" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2L12 22M12 6C14 4 17 4 19 6C19 9 16 11 12 11M12 13C10 11 7 11 5 13C5 16 8 18 12 18"/>
    </svg>
    <div class="tagline">A Celebration of Joy</div>
    <h1>${escapeXml(payload.headline)}</h1>
    <div class="date-badge">📅 ${escapeXml(formattedDate)}</div>
    <p class="message">${escapeXml(payload.warmMessage)}</p>
    <div class="details">
      <div><strong>Attire:</strong> ${escapeXml(payload.dressCodeNote || "Celebratory attire")}</div>
      <div><strong>Location:</strong> ${escapeXml(payload.locationNote || "Shared upon RSVP")}</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Builds a reviewed mailto: email draft (Rule 17: no autonomous sending).
 */
export function buildMailtoDraft(
  payload: PublicInvitationPayload,
  additionalPersonalNote?: string,
): string {
  const subject = `Invitation: Celebration for ${payload.recipientName}`;

  const bodyParts = [
    `Dear friends,`,
    ``,
    payload.headline,
    ``,
    payload.warmMessage,
    ``,
    `📅 Date: ${payload.eventDate ? new Date(payload.eventDate).toLocaleDateString(undefined, { dateStyle: "full" }) : "Coming Soon"}`,
    `👗 Dress Code: ${payload.dressCodeNote || "Comfortable and celebratory"}`,
    `📍 Location: ${payload.locationNote || "Details to follow"}`,
  ];

  if (additionalPersonalNote?.trim()) {
    bodyParts.push(``, `Note from organizer:`, additionalPersonalNote.trim());
  }

  bodyParts.push(``, `Warmly,`, `The Organizing Team`);

  const body = bodyParts.join("\n");

  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}


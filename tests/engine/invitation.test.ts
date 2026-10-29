import { describe, it, expect } from "vitest";
import { sanitizeHtml, sanitizeHtmlServer } from "@/lib/engine/sanitizer";
import {
  buildInvitationPayload,
  generateInvitationHtml,
  buildMailtoDraft,
} from "@/lib/engine/invitation";
import {
  createDeterministicFallbackInvitationCopy,
  createDeterministicFallbackLetterHelper,
} from "@/lib/ai/orchestrator";

describe("engine/sanitizer.ts: HTML & SVG Security Sanitization (Rule 23 & Task 9)", () => {
  it("strips <script> tags and malicious embedded script content", () => {
    const dirty = `<div><h1>Celebration</h1><script>alert("pwned")</script><p>Welcome!</p></div>`;
    const clean = sanitizeHtml(dirty);

    expect(clean).not.toContain("<script");
    expect(clean).not.toContain("alert");
    expect(clean).toContain("Celebration");
    expect(clean).toContain("Welcome!");
  });

  it("strips inline event handlers like onerror=, onclick=, onload=", () => {
    const dirty = `<img src="nonexistent.jpg" onerror="alert('xss')" /><p onclick="doEvil()">Click me</p><svg onload="stealCookies()"></svg>`;
    const clean = sanitizeHtml(dirty);

    expect(clean).not.toContain("onerror");
    expect(clean).not.toContain("onclick");
    expect(clean).not.toContain("onload");
    expect(clean).not.toContain("stealCookies");
  });

  it("strips javascript: pseudo-protocols from attributes", () => {
    const dirty = `<a href="javascript:void(document.cookie)">Special Link</a><iframe src="javascript:alert(1)"></iframe>`;
    const clean = sanitizeHtml(dirty);

    expect(clean).not.toContain("javascript:");
    expect(clean).not.toContain("<iframe");
  });

  it("strips external image URLs (http:// and https://) preventing tracking and exfiltration", () => {
    const dirty = `<div><p>Check this photo:</p><img src="https://tracker.evil.com/pixel.png" /><img src="http://insecure.site/image.jpg" /></div>`;
    const clean = sanitizeHtml(dirty);

    expect(clean).not.toContain("https://tracker.evil.com/pixel.png");
    expect(clean).not.toContain("http://insecure.site/image.jpg");
    expect(clean).not.toContain("<img");
  });

  it("sanitizes directly via server sanitizer in headless / Node environment", () => {
    const dirty = `<div onmouseover="evil()"><script src="https://evil.com/xss.js"></script><p>Safe content</p></div>`;
    const clean = sanitizeHtmlServer(dirty);

    expect(clean).not.toContain("onmouseover");
    expect(clean).not.toContain("<script");
    expect(clean).toContain("Safe content");
  });
});

describe("engine/invitation.ts: Recipient-Approved Invitation Payload & Export (prd.md 6.10)", () => {
  it("builds invitation payload from recipient-approved fields only, never organizer-only fields", () => {
    const dirtyOccasion = {
      id: "occ-secret-777",
      title: "Secret Birthday Fiesta",
      recipient_name: "Anita",
      occasion_type: "Birthday",
      event_at: "2026-12-10T19:00:00Z",
      is_surprise: true,
      // Organizer-only fields:
      budget_total: 75000,
      avoid_notes: "Gluten intolerance, dislikes loud fireworks",
      owner_id: "user-12345",
      plan_items: [{ title: "Confetti cannon", cost: 5000 }],
      vendors: [{ name: "Secret Baker", quote: 12000 }],
      notes: "Do not let Anita's brother know the time until 6pm",
    };

    const recipientView = {
      headline: "A Golden Gathering for Anita",
      message: "Join us for an evening of warmth and shared stories.",
    };

    const payload = buildInvitationPayload(dirtyOccasion, recipientView);

    // Assert approved fields present
    expect(payload.headline).toBe("A Golden Gathering for Anita");
    expect(payload.recipientName).toBe("Anita");
    expect(payload.occasionType).toBe("Birthday");
    expect(payload.eventDate).toBe("2026-12-10T19:00:00Z");
    expect(payload.warmMessage).toBe("Join us for an evening of warmth and shared stories.");

    // HARD NEGATIVE ASSERTIONS: Confirm absolute absence of internal organizer data
    const payloadKeys = Object.keys(payload);
    expect(payloadKeys).not.toContain("budget_total");
    expect(payloadKeys).not.toContain("avoid_notes");
    expect(payloadKeys).not.toContain("owner_id");
    expect(payloadKeys).not.toContain("plan_items");
    expect(payloadKeys).not.toContain("vendors");
    expect(payloadKeys).not.toContain("notes");

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("75000");
    expect(serialized).not.toContain("Gluten");
    expect(serialized).not.toContain("fireworks");
    expect(serialized).not.toContain("Secret Baker");
    expect(serialized).not.toContain("Confetti cannon");
    expect(serialized).not.toContain("brother");
  });

  it("generates standalone HTML deliverable styled with design tokens and SVG botanicals", () => {
    const payload = {
      headline: "Celebrating Rohan",
      recipientName: "Rohan",
      occasionType: "Farewell",
      eventDate: "2026-11-20T18:00:00Z",
      warmMessage: "We are gathering to bid farewell and wish Rohan the best in his next adventure.",
      dressCodeNote: "Casual smart",
      locationNote: "Sent privately upon RSVP",
    };

    const html = generateInvitationHtml(payload);

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Celebrating Rohan");
    expect(html).toContain("#FAF6F0"); // sand token
    expect(html).toContain("#9E526B"); // rose token
    expect(html).toContain("#2E1A2B"); // plum token
    expect(html).toContain("<svg class=\"botanical\""); // SVG botanical motif
    expect(html).toContain("Casual smart");
  });

  it("builds a reviewed mailto: draft with URL-encoded subject and body (Rule 17: no autonomous sending)", () => {
    const payload = {
      headline: "Warm Celebration for Maya",
      recipientName: "Maya",
      occasionType: "Birthday",
      eventDate: "2026-11-30T19:00:00Z",
      warmMessage: "Please join us for dinner & memories.",
      dressCodeNote: "Comfortable festive",
      locationNote: "Downtown garden pavilion",
    };

    const mailto = buildMailtoDraft(payload, "Looking forward to seeing everyone!");

    expect(mailto.startsWith("mailto:?")).toBe(true);
    expect(mailto).toContain("subject=");
    expect(mailto).toContain("body=");

    const decoded = decodeURIComponent(mailto);
    expect(decoded).toContain("Invitation: Celebration for Maya");
    expect(decoded).toContain("Warm Celebration for Maya");
    expect(decoded).toContain("Please join us for dinner & memories.");
    expect(decoded).toContain("Downtown garden pavilion");
    expect(decoded).toContain("Looking forward to seeing everyone!");
  });
});

describe("ai/orchestrator: Invitation Copy & Personal Letter Helper (Task 9)", () => {
  it("provides deterministic fallback invitation copy preserving recipient name", () => {
    const copy = createDeterministicFallbackInvitationCopy({
      recipientName: "Grandpa Joseph",
      occasionType: "80th Birthday",
      intentSummary: "Nostalgic family gathering",
    });

    expect(copy.headline).toContain("Grandpa Joseph");
    expect(copy.invitationBody).toContain("Grandpa Joseph");
    expect(copy.dressCodeNote).toBeDefined();
  });

  it("provides structured letter helper prompts ensuring user writes personal lines", () => {
    const helper = createDeterministicFallbackLetterHelper({
      recipientName: "Siddharth",
      relationship: "Brother",
      occasionType: "Graduation",
    });

    expect(helper.source).toBe("fallback");
    expect(helper.structureOutline.length).toBe(3);

    // Section 1: memory prompt
    expect(helper.structureOutline[0].sectionTitle).toBe("A Specific Memory or Moment");
    expect(helper.structureOutline[0].guidancePrompt).toContain("Siddharth");
    expect(helper.structureOutline[0].exampleStarter).toContain("I still remember");

    // Section 2: qualities prompt
    expect(helper.structureOutline[1].sectionTitle).toBe("What You Admire or Cherish");

    // Closing
    expect(helper.suggestedClosing).toBeDefined();
  });
});


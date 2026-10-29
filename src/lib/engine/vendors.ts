/**
 * Vendor Engine (DETERMINISTIC, no AI imports).
 *
 * Rules:
 * - integer minor units for monetary amounts.
 * - Status ladder: suggested -> verified -> contacted -> confirmed (+ declined).
 * - Status changes ONLY by explicit organizer action.
 * - Pasted quotes are QUOTED data, never verified facts.
 * - Side-by-side comparison highlighting missing and incomparable fields.
 * - Message drafts (wa.me and mailto:); never sent automatically.
 */

import { toMinorUnits, formatMoney } from "./money";

export type VendorStatus = "suggested" | "verified" | "contacted" | "confirmed" | "declined";

export interface ParsedQuoteFields {
  price: number | null; // In major currency units (or null if missing)
  currency: string;
  included: string[];
  extra_fees: string[];
  availability_claim: string | null;
  cancellation_terms: string | null;
  payment_terms: string | null;
  missing: string[];
  questions: string[];
}

export interface VendorRecord {
  id: string;
  occasion_id: string;
  name: string;
  category: string;
  contact: string | null;
  status: VendorStatus;
  quote_amount: number | null;
  quote_notes: string | null;
  quote_fields: ParsedQuoteFields | Record<string, unknown>;
  priority: number;
  created_at?: string;
}

export const VALID_STATUS_TRANSITIONS: Record<VendorStatus, VendorStatus[]> = {
  suggested: ["verified", "contacted", "declined"],
  verified: ["contacted", "confirmed", "declined"],
  contacted: ["confirmed", "declined", "verified"],
  confirmed: ["declined", "contacted"],
  declined: ["suggested", "verified", "contacted"],
};

/**
 * Validates whether a proposed vendor status transition is allowed.
 * Prevents invalid or accidental status jumps.
 */
export function isValidStatusTransition(current: VendorStatus, next: VendorStatus): boolean {
  if (current === next) return true;
  return VALID_STATUS_TRANSITIONS[current]?.includes(next) ?? false;
}

/**
 * Finds the next available fallback vendor when a vendor is marked 'declined'.
 * Selects the highest priority (lowest priority number) vendor in the same category
 * that is not declined.
 */
export function findNextFallbackVendor(
  vendors: VendorRecord[],
  category: string,
  declinedVendorId: string,
): VendorRecord | null {
  const candidates = vendors
    .filter(
      (v) =>
        v.category.toLowerCase() === category.toLowerCase() &&
        v.id !== declinedVendorId &&
        v.status !== "declined",
    )
    .sort((a, b) => a.priority - b.priority);

  return candidates[0] || null;
}

export interface VendorComparisonRow {
  vendorId: string;
  name: string;
  status: VendorStatus;
  priority: number;
  quotedPriceFormatted: string;
  priceMinorUnits: number | null;
  includedCount: number;
  includedItems: string[];
  extraFeesCount: number;
  extraFeesItems: string[];
  hasAvailabilityClaim: boolean;
  availabilityClaimText: string | null;
  hasCancellationTerms: boolean;
  cancellationTermsText: string | null;
  hasPaymentTerms: boolean;
  paymentTermsText: string | null;
  missingFields: string[];
  suggestedQuestions: string[];
}

export interface CategoryComparisonMatrix {
  category: string;
  vendors: VendorComparisonRow[];
  hasIncomparablePrices: boolean;
  currencies: string[];
}

/**
 * Generates a side-by-side comparison matrix for vendors in a given category.
 * Flags missing and incomparable fields (e.g. differing currencies or unstated cancellation terms).
 */
export function compareCategoryVendors(
  vendors: VendorRecord[],
  category: string,
  defaultCurrency: string = "INR",
): CategoryComparisonMatrix {
  const categoryVendors = vendors.filter(
    (v) => v.category.toLowerCase() === category.toLowerCase(),
  );

  const currenciesFound = new Set<string>();

  const rows: VendorComparisonRow[] = categoryVendors.map((v) => {
    const qf = (v.quote_fields || {}) as Partial<ParsedQuoteFields>;
    const currency = qf.currency || defaultCurrency;
    currenciesFound.add(currency);

    const price = typeof qf.price === "number" ? qf.price : v.quote_amount ?? null;
    const priceMinorUnits = price !== null ? toMinorUnits(price) : null;
    const priceFormatted =
      priceMinorUnits !== null ? formatMoney(priceMinorUnits, currency) : "Not quoted";

    const missing: string[] = [];
    if (price === null) missing.push("Price");
    if (!qf.cancellation_terms || qf.cancellation_terms.trim().length === 0) {
      missing.push("Cancellation terms");
    }
    if (!qf.payment_terms || qf.payment_terms.trim().length === 0) {
      missing.push("Payment terms");
    }
    if (!qf.availability_claim || qf.availability_claim.trim().length === 0) {
      missing.push("Availability statement");
    }
    if (Array.isArray(qf.missing) && qf.missing.length > 0) {
      for (const m of qf.missing) {
        if (!missing.includes(m)) missing.push(m);
      }
    }

    return {
      vendorId: v.id,
      name: v.name,
      status: v.status,
      priority: v.priority,
      quotedPriceFormatted: priceFormatted,
      priceMinorUnits,
      includedCount: Array.isArray(qf.included) ? qf.included.length : 0,
      includedItems: Array.isArray(qf.included) ? qf.included : [],
      extraFeesCount: Array.isArray(qf.extra_fees) ? qf.extra_fees.length : 0,
      extraFeesItems: Array.isArray(qf.extra_fees) ? qf.extra_fees : [],
      hasAvailabilityClaim: Boolean(qf.availability_claim),
      availabilityClaimText: qf.availability_claim ?? null,
      hasCancellationTerms: Boolean(qf.cancellation_terms),
      cancellationTermsText: qf.cancellation_terms ?? null,
      hasPaymentTerms: Boolean(qf.payment_terms),
      paymentTermsText: qf.payment_terms ?? null,
      missingFields: missing,
      suggestedQuestions: Array.isArray(qf.questions) ? qf.questions : [],
    };
  });

  return {
    category,
    vendors: rows.sort((a, b) => a.priority - b.priority),
    hasIncomparablePrices: currenciesFound.size > 1,
    currencies: Array.from(currenciesFound),
  };
}

export interface VendorDraftMessageInput {
  vendorName: string;
  category: string;
  occasionTitle: string;
  eventDate?: string | null;
  guestCount?: number | null;
  questions?: string[];
  contact?: string | null;
}

export interface VendorDraftMessageResult {
  bodyText: string;
  subject: string;
  whatsappUrl: string | null;
  mailtoUrl: string | null;
}

/**
 * Drafts an inquiry message for a vendor.
 * Generates ready-to-click wa.me and mailto: links.
 * HARD RULE: Never sends messages automatically. The organizer must review and click.
 */
export function draftVendorInquiry(input: VendorDraftMessageInput): VendorDraftMessageResult {
  const dateFormatted = input.eventDate
    ? new Date(input.eventDate).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "a date to be confirmed";

  const guestText = input.guestCount ? ` for approximately ${input.guestCount} guests` : "";

  const questionsList =
    input.questions && input.questions.length > 0
      ? "\n\nA few questions I'd appreciate clarity on:\n" +
        input.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")
      : "";

  const subject = `Inquiry: ${input.category} for ${input.occasionTitle}`;
  const bodyText =
    `Hello ${input.vendorName},\n\n` +
    `I am organizing a celebration ("${input.occasionTitle}") planned for ${dateFormatted}${guestText}, and I am interested in your ${input.category} services.\n\n` +
    `Could you please let me know your availability and provide a detailed quote including what is covered?` +
    `${questionsList}\n\n` +
    `Looking forward to hearing from you.\nBest regards.`;

  // Parse phone number for WhatsApp
  let whatsappUrl: string | null = null;
  if (input.contact) {
    const digits = input.contact.replace(/[^0-9]/g, "");
    if (digits.length >= 10) {
      whatsappUrl = `https://wa.me/${digits}?text=${encodeURIComponent(bodyText)}`;
    }
  }

  // Parse email for mailto:
  let mailtoUrl: string | null = null;
  if (input.contact && input.contact.includes("@")) {
    const emailMatch = input.contact.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
      mailtoUrl = `mailto:${emailMatch[0]}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
    }
  }

  return {
    bodyText,
    subject,
    whatsappUrl,
    mailtoUrl,
  };
}

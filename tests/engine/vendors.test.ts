import { describe, it, expect } from "vitest";
import {
  VendorRecord,
  isValidStatusTransition,
  findNextFallbackVendor,
  compareCategoryVendors,
  draftVendorInquiry,
} from "../../src/lib/engine/vendors";

describe("engine/vendors: Vendor Checklist & Quote Comparison Engine", () => {
  const dummyVendors: VendorRecord[] = [
    {
      id: "v-venue-1",
      occasion_id: "occ-1",
      name: "Heritage Palace Banquet",
      category: "Venue",
      contact: "+91 9876543210",
      status: "suggested",
      quote_amount: 150000,
      quote_notes: "Grand lawn with banquet hall",
      quote_fields: {
        price: 150000,
        currency: "INR",
        included: ["Hall rental for 6 hours", "Chairs and round tables", "Security staff"],
        extra_fees: ["Generator fuel charges", "Cleaning deposit ₹10,000"],
        availability_claim: "Available on Nov 20th",
        cancellation_terms: "50% refund if cancelled 14 days prior",
        payment_terms: "25% advance to book",
        missing: [],
        questions: ["What is the exact noise curfew?"],
      },
      priority: 1,
    },
    {
      id: "v-venue-2",
      occasion_id: "occ-1",
      name: "Lakeview Terrace",
      category: "Venue",
      contact: "lakeview@banquets.com",
      status: "verified",
      quote_amount: 120000,
      quote_notes: null,
      quote_fields: {
        price: 120000,
        currency: "INR",
        included: ["Rooftop terrace"],
        extra_fees: [],
        availability_claim: null, // Missing availability
        cancellation_terms: null, // Missing cancellation
        payment_terms: null,      // Missing payment terms
        missing: ["Cancellation policy", "Payment terms"],
        questions: ["What happens in case of rain?"],
      },
      priority: 2,
    },
    {
      id: "v-venue-3",
      occasion_id: "occ-1",
      name: "Boutique Garden Courtyard",
      category: "Venue",
      contact: null,
      status: "declined",
      quote_amount: 200000,
      quote_notes: null,
      quote_fields: {},
      priority: 3,
    },
    {
      id: "v-venue-4",
      occasion_id: "occ-1",
      name: "Riverside Resort",
      category: "Venue",
      contact: "+91 9999888877",
      status: "suggested",
      quote_amount: 175000,
      quote_notes: null,
      quote_fields: {
        price: 175000,
        currency: "INR",
        included: ["Lawn and pool area"],
        extra_fees: ["Corkage fee ₹500/bottle"],
        availability_claim: "Tentatively open",
        cancellation_terms: "Non-refundable deposit",
        payment_terms: "Full payment 7 days before",
        missing: [],
        questions: [],
      },
      priority: 4,
    },
  ];

  it("validates status ladder transitions strictly", () => {
    // suggested -> verified, contacted, declined are valid
    expect(isValidStatusTransition("suggested", "verified")).toBe(true);
    expect(isValidStatusTransition("suggested", "contacted")).toBe(true);
    expect(isValidStatusTransition("suggested", "declined")).toBe(true);

    // cannot jump directly from suggested -> confirmed
    expect(isValidStatusTransition("suggested", "confirmed")).toBe(false);

    // verified -> contacted, confirmed, declined
    expect(isValidStatusTransition("verified", "confirmed")).toBe(true);
    expect(isValidStatusTransition("verified", "contacted")).toBe(true);

    // confirmed -> declined, contacted
    expect(isValidStatusTransition("confirmed", "declined")).toBe(true);
  });

  it("finds next fallback vendor by priority order when a vendor is declined", () => {
    // If Priority 1 is declined, Priority 2 (Lakeview Terrace) is selected
    const nextFallback = findNextFallbackVendor(dummyVendors, "Venue", "v-venue-1");
    expect(nextFallback).not.toBeNull();
    expect(nextFallback?.id).toBe("v-venue-2");
    expect(nextFallback?.priority).toBe(2);

    // If both Priority 1 and Priority 2 are excluded/declined, Priority 4 (Riverside Resort) is selected
    // (Priority 3 is already declined)
    const activeExcluding2 = dummyVendors.filter((v) => v.id !== "v-venue-2");
    const nextAfter2 = findNextFallbackVendor(activeExcluding2, "Venue", "v-venue-1");
    expect(nextAfter2?.id).toBe("v-venue-4");
    expect(nextAfter2?.priority).toBe(4);
  });

  it("generates side-by-side comparison matrix and highlights missing and incomparable fields", () => {
    const matrix = compareCategoryVendors(dummyVendors, "Venue", "INR");

    expect(matrix.category).toBe("Venue");
    expect(matrix.vendors).toHaveLength(4);

    // Priority 1 vendor has complete fields
    const p1 = matrix.vendors.find((v) => v.priority === 1);
    expect(p1).toBeDefined();
    expect(p1?.quotedPriceFormatted).toBe("₹1,50,000");
    expect(p1?.priceMinorUnits).toBe(15000000); // 1.5 Lakh in paise
    expect(p1?.includedCount).toBe(3);
    expect(p1?.hasCancellationTerms).toBe(true);

    // Priority 2 vendor has missing cancellation terms and availability statement
    const p2 = matrix.vendors.find((v) => v.priority === 2);
    expect(p2).toBeDefined();
    expect(p2?.hasCancellationTerms).toBe(false);
    expect(p2?.hasAvailabilityClaim).toBe(false);
    expect(p2?.missingFields).toContain("Cancellation terms");
    expect(p2?.missingFields).toContain("Availability statement");

    // Incomparable prices false when all use INR
    expect(matrix.hasIncomparablePrices).toBe(false);
    expect(matrix.currencies).toEqual(["INR"]);
  });

  it("detects incomparable prices when currencies differ across vendors", () => {
    const multiCurrencyVendors: VendorRecord[] = [
      dummyVendors[0],
      {
        ...dummyVendors[1],
        quote_fields: {
          price: 1500,
          currency: "USD",
          included: ["International venue"],
          extra_fees: [],
          availability_claim: "Confirmed",
          cancellation_terms: "Full refund",
          payment_terms: "Card",
          missing: [],
          questions: [],
        },
      },
    ];

    const matrix = compareCategoryVendors(multiCurrencyVendors, "Venue", "INR");
    expect(matrix.hasIncomparablePrices).toBe(true);
    expect(matrix.currencies.sort()).toEqual(["INR", "USD"].sort());
  });

  it("drafts vendor inquiry with encoded WhatsApp and mailto links without sending autonomously", () => {
    const inquiry = draftVendorInquiry({
      vendorName: "Heritage Palace Banquet",
      category: "Venue",
      occasionTitle: "30th Birthday Celebration",
      eventDate: "2026-11-20T18:00:00Z",
      guestCount: 50,
      contact: "+91 9876543210",
      questions: ["Is sound system included?", "What is the curfew?"],
    });

    expect(inquiry.subject).toContain("Inquiry: Venue for 30th Birthday Celebration");
    expect(inquiry.bodyText).toContain("Heritage Palace Banquet");
    expect(inquiry.bodyText).toContain("50 guests");
    expect(inquiry.bodyText).toContain("1. Is sound system included?");
    expect(inquiry.bodyText).toContain("2. What is the curfew?");

    // WhatsApp link
    expect(inquiry.whatsappUrl).toContain("https://wa.me/919876543210?text=");
    expect(inquiry.whatsappUrl).toContain(encodeURIComponent("Heritage Palace Banquet"));

    // Mailto link
    const emailInquiry = draftVendorInquiry({
      vendorName: "Heritage Palace Banquet",
      category: "Venue",
      occasionTitle: "30th Birthday Celebration",
      contact: "events@heritagepalace.com",
    });
    expect(emailInquiry.mailtoUrl).toContain("mailto:events@heritagepalace.com?subject=");
  });
});


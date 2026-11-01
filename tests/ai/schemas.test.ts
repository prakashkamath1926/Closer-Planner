import { describe, it, expect } from "vitest";
import {
  intakeRequestSchema,
  proposedPlanItemSchema,
  celebrationIdeaSchema,
  proposeIdeasResponseSchema,
} from "../../src/lib/ai/schemas";

describe("ai/schemas: strict Zod schema validation", () => {
  it("HARD RULE: rejects any proposed plan item where costStatus is 'confirmed'", () => {
    const invalidItem = {
      title: "Venue booking",
      category: "venue",
      estimatedCost: 50000,
      costStatus: "confirmed", // VIOLATION: AI proposals must NEVER be confirmed
    };

    const result = proposedPlanItemSchema.safeParse(invalidItem);
    expect(result.success).toBe(false);
  });

  it("accepts valid proposed plan items with 'estimate' or 'quoted'", () => {
    const estimateItem = {
      title: "Catering",
      category: "catering",
      estimatedCost: 35000,
      costStatus: "estimate",
    };
    expect(proposedPlanItemSchema.safeParse(estimateItem).success).toBe(true);

    const quotedItem = {
      title: "Photographer",
      category: "photo",
      estimatedCost: 20000,
      costStatus: "quoted",
    };
    expect(proposedPlanItemSchema.safeParse(quotedItem).success).toBe(true);
  });

  it("validates all 3 entry paths (have_idea, discover, need_now)", () => {
    expect(
      intakeRequestSchema.safeParse({
        entryPath: "have_idea",
        concept: "Rooftop acoustic dinner",
        occasionType: "Anniversary",
      }).success,
    ).toBe(true);

    expect(
      intakeRequestSchema.safeParse({
        entryPath: "discover",
        knownInterests: ["Jazz", "Espresso", "Books"],
        occasionType: "Birthday",
      }).success,
    ).toBe(true);

    expect(
      intakeRequestSchema.safeParse({
        entryPath: "need_now",
        urgencyMode: "tonight",
        occasionType: "Farewell",
      }).success,
    ).toBe(true);

    // Rejects invalid entry path
    expect(
      intakeRequestSchema.safeParse({
        entryPath: "invalid_path",
        occasionType: "Birthday",
      }).success,
    ).toBe(false);
  });

  it("sanitizes edge-case inputs without failing with HTTP 400", () => {
    // 1. Long string in knownInterests is truncated to <= 100 chars
    const res1 = intakeRequestSchema.safeParse({
      entryPath: "discover",
      knownInterests: ["A".repeat(150), "B".repeat(20)],
    });
    expect(res1.success).toBe(true);
    if (res1.success) {
      expect(res1.data.knownInterests.length).toBe(2);
      expect(res1.data.knownInterests[0].length).toBe(100);
    }

    // 2. Comma-separated string for knownInterests is parsed and capped to 10 items
    const res2 = intakeRequestSchema.safeParse({
      entryPath: "discover",
      knownInterests: "item1, item2, item3, item4, item5, item6, item7, item8, item9, item10, item11, item12",
    });
    expect(res2.success).toBe(true);
    if (res2.success) {
      expect(res2.data.knownInterests.length).toBe(10);
    }

    // 3. String numbers for budgetTotal and guestCount are coerced
    const res3 = intakeRequestSchema.safeParse({
      entryPath: "have_idea",
      budgetTotal: "60000",
      guestCount: "25",
    });
    expect(res3.success).toBe(true);
    if (res3.success) {
      expect(res3.data.budgetTotal).toBe(60000);
      expect(res3.data.guestCount).toBe(25);
    }

    // 4. Currency is sanitized to uppercase 3-letter code
    const res4 = intakeRequestSchema.safeParse({
      entryPath: "have_idea",
      currency: "inr",
    });
    expect(res4.success).toBe(true);
    if (res4.success) {
      expect(res4.data.currency).toBe("INR");
    }

    // 5. Concept longer than 1000 characters is safely truncated
    const res5 = intakeRequestSchema.safeParse({
      entryPath: "have_idea",
      concept: "C".repeat(1200),
    });
    expect(res5.success).toBe(true);
    if (res5.success) {
      expect(res5.data.concept?.length).toBe(1000);
    }
  });

  it("validates fact labels strictly as known, possible, or needs_confirmation", () => {
    const validIdea = {
      id: "idea-1",
      title: "Botanical Garden Picnic",
      description: "A peaceful afternoon in nature with gourmet basket.",
      whyItSuitsThem: "They love outdoor spaces and quiet conversation.",
      activities: ["Unpack picnic", "Stroll through rose garden"],
      estimatedCostMin: 10000,
      estimatedCostMax: 20000,
      currency: "INR",
      requiredTime: "2-3 days",
      urgencyMode: "this_week",
      facts: [
        { key: "Food preference", value: "Vegetarian", status: "known", source: "organizer" },
        { key: "Music taste", value: "Acoustic folk", status: "possible", source: "organizer" },
        { key: "Weather check", value: "Requires clear skies", status: "needs_confirmation", source: "organizer" },
      ],
      items: [
        {
          title: "Artisanal bakery basket",
          category: "catering",
          estimatedCost: 15000,
          costStatus: "estimate",
        },
      ],
    };

    expect(celebrationIdeaSchema.safeParse(validIdea).success).toBe(true);

    // Invalid status rejected
    const invalidFactIdea = {
      ...validIdea,
      facts: [{ key: "Test", value: "Val", status: "guaranteed" }],
    };
    expect(celebrationIdeaSchema.safeParse(invalidFactIdea).success).toBe(false);
  });

  it("requires exactly 3 ideas in proposeIdeasResponseSchema", () => {
    const sampleIdea = {
      id: "1",
      title: "Title",
      description: "Desc",
      whyItSuitsThem: "Why",
      activities: ["Activity 1"],
      estimatedCostMin: 1000,
      estimatedCostMax: 2000,
      currency: "INR",
      requiredTime: "1 day",
      urgencyMode: "this_week",
      facts: [],
      items: [{ title: "Item", category: "other", estimatedCost: 1000, costStatus: "estimate" }],
    };

    // Exactly 3 ideas succeeds
    expect(
      proposeIdeasResponseSchema.safeParse({
        ideas: [
          { ...sampleIdea, id: "1" },
          { ...sampleIdea, id: "2" },
          { ...sampleIdea, id: "3" },
        ],
      }).success,
    ).toBe(true);

    // 2 ideas fails
    expect(
      proposeIdeasResponseSchema.safeParse({
        ideas: [{ ...sampleIdea, id: "1" }, { ...sampleIdea, id: "2" }],
      }).success,
    ).toBe(false);
  });
});


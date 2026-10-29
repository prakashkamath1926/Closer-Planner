/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import {
  proposeIdeas,
  proposeTradeoffs,
  createDeterministicFallbackIdeas,
} from "../../src/lib/ai/orchestrator";
import { IntakeRequest, aiProposeIdeasResponseSchema } from "../../src/lib/ai/schemas";
import { PlanItem } from "../../src/lib/engine/changes";

// Load .env.local if present
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Suite 1: Deterministic Fallback Tests
// -----------------------------------------------------------------------------
describe("ai/orchestrator (deterministic fallback): ideas generation for all 3 entry paths", () => {
  // Use a failing mock model so this suite strictly and reliably tests the fallback behavior
  const failingModel = new MockLanguageModelV4({
    doGenerate: async () => {
      throw new Error("Provider unavailable (deterministic fallback test)");
    },
  });

  it("Entry Path 1 ('have_idea'): produces 3 valid fallback ideas with source: 'fallback'", async () => {
    const input: IntakeRequest = {
      entryPath: "have_idea",
      occasionType: "30th Birthday",
      recipientName: "Siddharth",
      relationship: "Brother",
      concept: "Rooftop acoustic evening with favorite comfort foods",
      intentSummary: "Make him feel deeply appreciated by his closest childhood friends",
      budgetTotal: 75000,
      currency: "INR",
      urgencyMode: "weeks_away",
      isSurprise: true,
      avoidNotes: "No alcohol, prefers quiet over loud DJ",
      knownInterests: ["Acoustic guitar", "Indie folk", "Board games"],
    };

    const res = await proposeIdeas(input, { model: failingModel });

    expect(res.source).toBe("fallback");
    expect(res.ideas.length).toBe(3);
    for (const idea of res.ideas) {
      expect(idea.title).toBeTruthy();
      expect(idea.description).toBeTruthy();
      expect(idea.whyItSuitsThem).toBeTruthy();
      expect(idea.items.length).toBeGreaterThanOrEqual(1);

      // Verify HARD RULE: no price is confirmed
      for (const item of idea.items) {
        expect(item.costStatus).not.toBe("confirmed");
        expect(["estimate", "quoted"]).toContain(item.costStatus);
      }
    }
  });

  it("Entry Path 2 ('discover'): produces 3 distinct discovery directions with source: 'fallback'", async () => {
    const input: IntakeRequest = {
      entryPath: "discover",
      occasionType: "Retirement",
      recipientName: "Meenakshi",
      relationship: "Mother",
      intentSummary: "Celebrate her 35-year teaching career with warm gratitude",
      budgetTotal: 100000,
      currency: "INR",
      urgencyMode: "this_week",
      isSurprise: false,
      knownInterests: ["Gardening", "Poetry", "South Indian filter coffee"],
    };

    const res = await proposeIdeas(input, { model: failingModel });

    expect(res.source).toBe("fallback");
    expect(res.ideas.length).toBe(3);
    expect(res.ideas[0].id).not.toBe(res.ideas[1].id);
    expect(res.ideas[1].id).not.toBe(res.ideas[2].id);

    // Verify facts have appropriate status tags
    const allFacts = res.ideas.flatMap((i) => i.facts);
    for (const fact of allFacts) {
      expect(["known", "possible", "needs_confirmation"]).toContain(fact.status);
    }
  });

  it("Entry Path 3 ('need_now'): defaults to tonight urgency with quick setup with source: 'fallback'", async () => {
    const input: IntakeRequest = {
      entryPath: "need_now",
      occasionType: "Spontaneous Dinner",
      recipientName: "Anya",
      relationship: "Partner",
      intentSummary: "Unwind after an exhausting week",
      budgetTotal: 15000,
      currency: "INR",
      urgencyMode: "tonight",
      isSurprise: false,
      knownInterests: ["Gelato", "Stargazing"],
    };

    const res = await proposeIdeas(input, { model: failingModel });

    expect(res.source).toBe("fallback");
    expect(res.ideas.length).toBe(3);
    for (const idea of res.ideas) {
      expect(idea.urgencyMode).toBe("tonight");
      expect(idea.items.length).toBeGreaterThan(0);
      for (const item of idea.items) {
        expect(["estimate", "quoted"]).toContain(item.costStatus);
      }
    }
  });

  it("preserves user input and constraints on fallback", async () => {
    const input: IntakeRequest = {
      entryPath: "discover",
      occasionType: "Silver Jubilee",
      recipientName: "Dad & Mom",
      budgetTotal: 250000,
      currency: "INR",
      urgencyMode: "weeks_away",
      isSurprise: true,
      avoidNotes: "Strictly vegetarian",
      knownInterests: ["Old Hindi cinema", "Kashmir memories"],
    };

    const res = await proposeIdeas(input, { model: failingModel });

    expect(res.source).toBe("fallback");
    expect(res.ideas.length).toBe(3);
    for (const idea of res.ideas) {
      expect(idea.estimatedCostMax).toBeLessThanOrEqual(250000 * 1.1);
      expect(idea.currency).toBe("INR");
    }
  });

  it("verifies UI fallback flag contract: fallback returns source: 'fallback' for notice display", () => {
    const input: IntakeRequest = {
      entryPath: "have_idea",
      occasionType: "Dinner",
      concept: "Quiet dinner",
      budgetTotal: 10000,
      currency: "INR",
      urgencyMode: "tonight",
      isSurprise: false,
      knownInterests: [],
    };
    const fallbackResult = createDeterministicFallbackIdeas(input);
    expect(fallbackResult.source).toBe("fallback");
  });

  it("renders a visible fallback notice in IdeasScreen when source is 'fallback'", async () => {
    const React = await import("react");
    const { renderToString } = await import("react-dom/server");
    const { IdeasScreen } = await import("../../src/components/intake/ideas-screen");
    const fallbackIdeas = createDeterministicFallbackIdeas({
      entryPath: "have_idea",
      occasionType: "Dinner",
      concept: "Quiet dinner",
      budgetTotal: 10000,
      currency: "INR",
      urgencyMode: "tonight",
      isSurprise: false,
      knownInterests: [],
    });

    const htmlWithFallback = renderToString(
      React.createElement(IdeasScreen, {
        ideas: fallbackIdeas.ideas,
        source: "fallback",
        entryPath: "have_idea",
        occasionType: "Dinner",
        currency: "INR",
        onApprove: async () => {},
        onRegenerate: async () => {},
        onBackToIntake: () => {},
      }),
    );
    expect(htmlWithFallback).toContain("AI is unavailable, showing starter templates");

    const htmlWithAi = renderToString(
      React.createElement(IdeasScreen, {
        ideas: fallbackIdeas.ideas,
        source: "ai",
        entryPath: "have_idea",
        occasionType: "Dinner",
        currency: "INR",
        onApprove: async () => {},
        onRegenerate: async () => {},
        onBackToIntake: () => {},
      }),
    );
    expect(htmlWithAi).not.toContain("AI is unavailable, showing starter templates");
  });
});

// -----------------------------------------------------------------------------
// Suite 2: Mocked AI Model Tests (Structured Output & Hard Rule Verification)
// -----------------------------------------------------------------------------
describe("ai/orchestrator: mocked model structured output and resilience", () => {
  const sampleIdeaItems = [
    {
      title: "Acoustic Musician Duo",
      category: "entertainment",
      intentTag: "music",
      why: "Live acoustic ambiance",
      estimatedCost: 25000,
      costStatus: "quoted" as const,
      isNonNegotiable: false,
      planB: null,
    },
    {
      title: "Rooftop Terrace Rental",
      category: "venue",
      intentTag: "venue",
      why: "Private space under the stars",
      estimatedCost: 25000,
      costStatus: "estimate" as const,
      isNonNegotiable: true,
      planB: null,
    },
  ];

  const mockIdeasPayload = {
    ideas: [
      {
        id: "mock-idea-1",
        title: "Rooftop Stargazing & Acoustic Night",
        description: "An intimate rooftop evening with acoustic tunes and warm vibes.",
        whyItSuitsThem: "Matches their love for indie music and quiet gatherings.",
        activities: ["Acoustic set", "Stargazing", "Custom dinner"],
        estimatedCostMin: 40000,
        estimatedCostMax: 60000,
        currency: "INR",
        requiredTime: "2-3 weeks",
        urgencyMode: "weeks_away" as const,
        facts: [{ key: "Musical Taste", value: "Loves acoustic guitar", status: "known" as const, source: "organizer" as const }],
        items: sampleIdeaItems,
      },
      {
        id: "mock-idea-2",
        title: "Secret Garden Vinyl Session",
        description: "Lush garden setup with a turntable and comfort food.",
        whyItSuitsThem: "Great for relaxing conversations with closest friends.",
        activities: ["Vinyl listening", "Comfort food dinner"],
        estimatedCostMin: 45000,
        estimatedCostMax: 65000,
        currency: "INR",
        requiredTime: "1-2 weeks",
        urgencyMode: "weeks_away" as const,
        facts: [{ key: "Interests", value: "Collects vintage vinyl records", status: "known" as const, source: "organizer" as const }],
        items: [
          {
            title: "Turntable & Sound Rental",
            category: "entertainment",
            intentTag: "sound",
            why: "High quality audio",
            estimatedCost: 15000,
            costStatus: "estimate" as const,
            isNonNegotiable: false,
            planB: null,
          },
        ],
      },
      {
        id: "mock-idea-3",
        title: "Chef's Table Culinary Gathering",
        description: "Private chef experience cooking customized comfort dishes.",
        whyItSuitsThem: "Focuses on their favorite cuisines in a cozy setting.",
        activities: ["Interactive cooking", "Custom tasting menu"],
        estimatedCostMin: 50000,
        estimatedCostMax: 70000,
        currency: "INR",
        requiredTime: "1 week",
        urgencyMode: "weeks_away" as const,
        facts: [{ key: "Food Preference", value: "Enjoys farm-to-table cuisine", status: "known" as const, source: "organizer" as const }],
        items: [
          {
            title: "Private Chef Service",
            category: "catering",
            intentTag: "dining",
            why: "Curated dinner",
            estimatedCost: 40000,
            costStatus: "estimate" as const,
            isNonNegotiable: false,
            planB: null,
          },
        ],
      },
    ],
    generalWhy: "Designed specifically for their celebration preferences.",
    source: "ai" as const,
  };

  it("happy path: calls AI model, returns source: 'ai', and verifies structured ideas", async () => {
    const validModel = new MockLanguageModelV4({
      doGenerate: (async () => ({
        rawCall: { rawPrompt: null, rawSettings: {} },
        finishReason: { unified: "stop", raw: "stop" },
        usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
        content: [{ type: "text", text: JSON.stringify(mockIdeasPayload) }],
        warnings: [],
      })) as any,
    });

    const input: IntakeRequest = {
      entryPath: "have_idea",
      occasionType: "Milestone Celebration",
      concept: "Rooftop acoustic dinner",
      recipientName: "Siddharth",
      budgetTotal: 75000,
      currency: "INR",
      urgencyMode: "weeks_away",
      isSurprise: false,
      knownInterests: [],
    };

    const res = await proposeIdeas(input, { model: validModel });

    expect(res.source).toBe("ai");
    expect(res.ideas.length).toBe(3);
    expect(res.ideas[0].title).toBe("Rooftop Stargazing & Acoustic Night");

    // HARD RULE check: costStatus cannot be confirmed
    for (const idea of res.ideas) {
      for (const item of idea.items) {
        expect(item.costStatus).not.toBe("confirmed");
        expect(["estimate", "quoted"]).toContain(item.costStatus);
      }
    }
  });

  it("resilience: gracefully falls back to deterministic ideas when model returns invalid payload", async () => {
    const invalidOutputModel = new MockLanguageModelV4({
      doGenerate: (async () => ({
        rawCall: { rawPrompt: null, rawSettings: {} },
        finishReason: { unified: "stop", raw: "stop" },
        usage: { inputTokens: 50, outputTokens: 50, totalTokens: 100 },
        // Malformed payload: missing required fields and only 1 idea
        content: [{ type: "text", text: JSON.stringify({ ideas: [{ id: "bad" }] }) }],
        warnings: [],
      })) as any,
    });

    const input: IntakeRequest = {
      entryPath: "have_idea",
      occasionType: "Celebration",
      concept: "Sunset cruise",
      recipientName: "Aditi",
      budgetTotal: 50000,
      currency: "INR",
      urgencyMode: "weeks_away",
      isSurprise: false,
      knownInterests: [],
    };

    const res = await proposeIdeas(input, { model: invalidOutputModel });

    expect(res.source).toBe("fallback");
    expect(res.ideas.length).toBe(3);
    expect(res.ideas[0].description).toContain("Aditi");
  });

  it("trade-offs happy path: returns verified options with source: 'ai'", async () => {
    const baselineItems: PlanItem[] = [
      {
        id: "item-venue",
        title: "Heritage Hall",
        category: "venue",
        intent_tag: "core",
        why: "Main space",
        status: "todo",
        estimated_cost: 300_000,
        cost_status: "quoted",
        is_fallback: false,
        is_non_negotiable: true,
        depends_on: [],
      },
      {
        id: "item-catering",
        title: "Gourmet Dinner",
        category: "catering",
        intent_tag: "food",
        why: "Dinner for guests",
        status: "todo",
        estimated_cost: 200_000,
        cost_status: "estimate",
        is_fallback: false,
        is_non_negotiable: false,
        depends_on: ["item-venue"],
      },
    ];

    const mockTradeoffsPayload = {
      options: [
        {
          id: "tradeoff-1",
          title: "Streamline Catering",
          description: "Reduce catering cost to meet reduced budget.",
          whyItWorks: "Maintains venue while lowering catering expense.",
          preservedIntentTags: ["core"],
          removedItemIds: [],
          modifiedItems: [
            {
              id: "item-catering",
              title: null,
              estimatedCost: 100_000,
              costStatus: "estimate" as const,
              dueAt: null,
              dependsOn: null,
              intentTag: null,
              why: null,
            },
          ],
          addedItems: [],
        },
        {
          id: "tradeoff-2",
          title: "Switch to Buffet Dining",
          description: "Replace plated dinner with buffet station.",
          whyItWorks: "Lowers catering overhead while keeping quality.",
          preservedIntentTags: ["food"],
          removedItemIds: ["item-catering"],
          modifiedItems: [],
          addedItems: [
            {
              title: "Buffet Dinner Setup",
              category: "catering",
              intentTag: "food",
              why: "High quality buffet dining",
              estimatedCost: 80_000,
              costStatus: "estimate" as const,
              isNonNegotiable: false,
              planB: null,
            },
          ],
        },
      ],
      analysisSummary: "Generated 2 balanced trade-off options.",
      source: "ai" as const,
    };

    const validModel = new MockLanguageModelV4({
      doGenerate: (async () => ({
        rawCall: { rawPrompt: null, rawSettings: {} },
        finishReason: { unified: "stop", raw: "stop" },
        usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
        content: [{ type: "text", text: JSON.stringify(mockTradeoffsPayload) }],
        warnings: [],
      })) as any,
    });

    const res = await proposeTradeoffs(
      {
        occasionTitle: "Aditi 30th Birthday",
        previousBudget: 500_000,
        newBudget: 420_000,
        currency: "INR",
        affectedItems: baselineItems.map((i) => ({
          id: i.id,
          title: i.title,
          category: i.category,
          intentTag: i.intent_tag,
          estimatedCost: Number(i.estimated_cost),
          dueAt: i.due_at,
          dependsOn: i.depends_on,
          isNonNegotiable: i.is_non_negotiable,
        })),
        reason: "Budget reduced by client",
      },
      baselineItems,
      { model: validModel },
    );

    expect(res.source).toBe("ai");
    expect(res.options.length).toBe(2);
  });

  it("trade-offs validation: drops options that exceed budget ceiling", async () => {
    const baselineItems: PlanItem[] = [
      {
        id: "item-venue",
        title: "Heritage Hall",
        category: "venue",
        status: "todo",
        estimated_cost: 300_000,
        cost_status: "quoted",
        is_fallback: false,
        is_non_negotiable: true,
        depends_on: [],
      },
    ];

    // Payload has one valid option (cost = 250k <= 280k) and one over-budget option (cost = 350k > 280k)
    // Plus a second valid option (cost = 200k <= 280k)
    const mockPayload = {
      options: [
        {
          id: "tradeoff-valid-1",
          title: "Slight Reduction",
          description: "Reduced venue package",
          whyItWorks: "Fits comfortably within 280k budget",
          preservedIntentTags: [],
          removedItemIds: [],
          modifiedItems: [
            {
              id: "item-venue",
              title: null,
              estimatedCost: 250_000,
              costStatus: "quoted" as const,
              dueAt: null,
              dependsOn: null,
              intentTag: null,
              why: null,
            },
          ],
          addedItems: [],
        },
        {
          id: "tradeoff-overbudget",
          title: "Overbudget Option",
          description: "This exceeds budget and must be dropped",
          whyItWorks: "Breaches the ceiling",
          preservedIntentTags: [],
          removedItemIds: [],
          modifiedItems: [
            {
              id: "item-venue",
              title: null,
              estimatedCost: 350_000,
              costStatus: "quoted" as const,
              dueAt: null,
              dependsOn: null,
              intentTag: null,
              why: null,
            },
          ],
          addedItems: [],
        },
        {
          id: "tradeoff-valid-2",
          title: "Further Reduction",
          description: "Half-day booking",
          whyItWorks: "Lowers cost well below ceiling",
          preservedIntentTags: [],
          removedItemIds: [],
          modifiedItems: [
            {
              id: "item-venue",
              title: null,
              estimatedCost: 200_000,
              costStatus: "quoted" as const,
              dueAt: null,
              dependsOn: null,
              intentTag: null,
              why: null,
            },
          ],
          addedItems: [],
        },
      ],
      analysisSummary: "Generated trade-offs.",
      source: "ai" as const,
    };

    const modelWithOverbudget = new MockLanguageModelV4({
      doGenerate: (async () => ({
        rawCall: { rawPrompt: null, rawSettings: {} },
        finishReason: { unified: "stop", raw: "stop" },
        usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
        content: [{ type: "text", text: JSON.stringify(mockPayload) }],
        warnings: [],
      })) as any,
    });

    const res = await proposeTradeoffs(
      {
        occasionTitle: "30th Birthday Milestone",
        previousBudget: 350_000,
        newBudget: 280_000,
        currency: "INR",
        affectedItems: baselineItems.map((i) => ({
          id: i.id,
          title: i.title,
          category: i.category,
          intentTag: null,
          estimatedCost: Number(i.estimated_cost),
          dueAt: null,
          dependsOn: [],
          isNonNegotiable: true,
        })),
        reason: "Budget reduced",
      },
      baselineItems,
      { model: modelWithOverbudget },
    );

    // Overbudget option was dropped by engine validation; 2 valid options remain
    expect(res.options.length).toBe(2);
    expect(res.options.find((o) => o.id === "tradeoff-overbudget")).toBeUndefined();
    expect(res.source).toBe("ai");
  });

  it("regression: model returning 5 ideas (which previously triggered Groq 400 maxItems) is sliced to 3 and validated", async () => {
    const payloadWith5Ideas = {
      ideas: [
        ...mockIdeasPayload.ideas,
        {
          ...mockIdeasPayload.ideas[0],
          id: "mock-idea-4",
          title: "Extra Idea 4",
        },
        {
          ...mockIdeasPayload.ideas[1],
          id: "mock-idea-5",
          title: "Extra Idea 5",
        },
      ],
      generalWhy: "5 ideas generated by LLM.",
    };

    const modelWith5Ideas = new MockLanguageModelV4({
      doGenerate: (async () => ({
        rawCall: { rawPrompt: null, rawSettings: {} },
        finishReason: { unified: "stop", raw: "stop" },
        usage: { inputTokens: 100, outputTokens: 300, totalTokens: 400 },
        content: [{ type: "text", text: JSON.stringify(payloadWith5Ideas) }],
        warnings: [],
      })) as any,
    });

    const input: IntakeRequest = {
      entryPath: "have_idea",
      occasionType: "Milestone Celebration",
      concept: "Rooftop acoustic dinner",
      recipientName: "Siddharth",
      budgetTotal: 75000,
      currency: "INR",
      urgencyMode: "weeks_away",
      isSurprise: false,
      knownInterests: [],
    };

    const res = await proposeIdeas(input, { model: modelWith5Ideas });

    expect(res.source).toBe("ai");
    expect(res.ideas.length).toBe(3);
    expect(res.ideas[0].title).toBe("Rooftop Stargazing & Acoustic Night");
    expect(res.ideas[2].title).toBe("Chef's Table Culinary Gathering");
  });

  it("regression: wire schema does not enforce fragile minItems/maxItems so provider-side schema rejection is prevented", () => {
    const sample5Ideas = {
      ideas: [
        ...mockIdeasPayload.ideas,
        { ...mockIdeasPayload.ideas[0], id: "extra-1" },
        { ...mockIdeasPayload.ideas[1], id: "extra-2" },
      ],
      generalWhy: null,
    };
    const parsed = aiProposeIdeasResponseSchema.safeParse(sample5Ideas);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.ideas.length).toBe(5);
    }
  });
});

// -----------------------------------------------------------------------------
// Suite 3: Live Smoke Tests (Gated by RUN_LIVE_AI=1 && GROQ_API_KEY)
// -----------------------------------------------------------------------------
const isLiveAiEnabled =
  process.env.RUN_LIVE_AI === "1" && Boolean(process.env.GROQ_API_KEY);

describe.runIf(isLiveAiEnabled)(
  "ai/orchestrator: live smoke tests with Groq (openai/gpt-oss-20b)",
  () => {
    it(
      "live proposeIdeas returns 3 valid ideas with source: 'ai'",
      async () => {
        const input: IntakeRequest = {
          entryPath: "have_idea",
          occasionType: "Milestone Celebration",
          recipientName: "Rohan",
          budgetTotal: 60000,
          currency: "INR",
          concept: "Intimate live acoustic lounge evening with dinner",
          urgencyMode: "weeks_away",
          isSurprise: false,
          knownInterests: ["Music"],
        };

        const res = await proposeIdeas(input);
        expect(res.source).toBe("ai");
        expect(res.ideas.length).toBe(3);
        for (const idea of res.ideas) {
          expect(idea.title).toBeTruthy();
          expect(idea.items.length).toBeGreaterThan(0);
          for (const item of idea.items) {
            expect(item.costStatus).not.toBe("confirmed");
          }
        }
      },
      35_000,
    );

    it(
      "live proposeTradeoffs returns valid options with source: 'ai'",
      async () => {
        const baselineItems: PlanItem[] = [
          {
            id: "venue-1",
            title: "Private Courtyard",
            category: "venue",
            status: "todo",
            estimated_cost: 30000,
            cost_status: "quoted",
            is_fallback: false,
            is_non_negotiable: true,
            depends_on: [],
          },
          {
            id: "catering-1",
            title: "Full Course Dinner",
            category: "catering",
            status: "todo",
            estimated_cost: 30000,
            cost_status: "estimate",
            is_fallback: false,
            is_non_negotiable: false,
            depends_on: ["venue-1"],
          },
        ];

        const res = await proposeTradeoffs(
          {
            occasionTitle: "Rohan Milestone Celebration",
            previousBudget: 60000,
            newBudget: 45000,
            currency: "INR",
            affectedItems: baselineItems.map((i) => ({
              id: i.id,
              title: i.title,
              category: i.category,
              intentTag: i.intent_tag,
              estimatedCost: Number(i.estimated_cost),
              dueAt: i.due_at,
              dependsOn: i.depends_on,
              isNonNegotiable: i.is_non_negotiable,
            })),
            reason: "Budget reduced by 15,000 INR",
          },
          baselineItems,
        );

        expect(res.source).toBe("ai");
        expect(res.options.length).toBeGreaterThanOrEqual(2);
        expect(res.options.length).toBeLessThanOrEqual(3);
      },
      35_000,
    );
  },
);

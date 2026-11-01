/**
 * Zod Schemas for AI Orchestrator Inputs & Outputs.
 *
 * Rules:
 * - All external and model-generated data is strictly validated with Zod.
 * - HARD RULE: "No price or availability is presented as confirmed."
 *   `cost_status` schema only permits 'estimate' or 'quoted'.
 * - Fact status must be 'known', 'possible', or 'needs_confirmation'.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Intake Inputs
// ---------------------------------------------------------------------------
export const entryPathEnum = z.enum(["have_idea", "discover", "need_now"]);
export type EntryPath = z.infer<typeof entryPathEnum>;

export const urgencyModeEnum = z.enum(["tonight", "this_week", "weeks_away"]);
export type UrgencyMode = z.infer<typeof urgencyModeEnum>;

export const intakeRequestSchema = z.object({
  entryPath: entryPathEnum,
  occasionType: z
    .preprocess((val) => {
      if (typeof val === "string" && val.trim().length > 0) {
        return val.trim().slice(0, 100);
      }
      return "Celebration";
    }, z.string().min(1).max(100))
    .default("Celebration"),
  recipientName: z
    .preprocess((val) => {
      if (typeof val === "string") {
        const trimmed = val.trim();
        return trimmed.length > 0 ? trimmed.slice(0, 100) : undefined;
      }
      return val;
    }, z.string().max(100).optional().nullable()),
  relationship: z
    .preprocess((val) => {
      if (typeof val === "string") {
        const trimmed = val.trim();
        return trimmed.length > 0 ? trimmed.slice(0, 100) : undefined;
      }
      return val;
    }, z.string().max(100).optional().nullable()),
  intentSummary: z
    .preprocess((val) => {
      if (typeof val === "string") {
        const trimmed = val.trim();
        return trimmed.length > 0 ? trimmed.slice(0, 500) : undefined;
      }
      return val;
    }, z.string().max(500).optional().nullable()),
  concept: z
    .preprocess((val) => {
      if (typeof val === "string") {
        const trimmed = val.trim();
        return trimmed.length > 0 ? trimmed.slice(0, 1000) : undefined;
      }
      return val;
    }, z.string().max(1000).optional().nullable()),
  budgetTotal: z
    .preprocess((val) => {
      if (val === "" || val === null || val === undefined) return undefined;
      const num = Number(val);
      return isNaN(num) ? undefined : Math.max(0, num);
    }, z.number().nonnegative().optional().nullable()),
  currency: z
    .preprocess((val) => {
      if (typeof val === "string" && val.trim().length > 0) {
        return val.trim().toUpperCase().slice(0, 3);
      }
      return "INR";
    }, z.string().length(3))
    .default("INR"),
  guestCount: z
    .preprocess((val) => {
      if (val === "" || val === null || val === undefined) return undefined;
      const num = Number(val);
      return isNaN(num) ? undefined : Math.max(0, Math.floor(num));
    }, z.number().int().nonnegative().optional().nullable()),
  eventAt: z
    .preprocess((val) => {
      if (typeof val === "string") {
        const trimmed = val.trim();
        return trimmed.length > 0 ? trimmed : undefined;
      }
      return val;
    }, z.string().optional().nullable()),
  urgencyMode: urgencyModeEnum.default("weeks_away"),
  isSurprise: z.boolean().default(false),
  avoidNotes: z
    .preprocess((val) => {
      if (typeof val === "string") {
        const trimmed = val.trim();
        return trimmed.length > 0 ? trimmed.slice(0, 500) : undefined;
      }
      return val;
    }, z.string().max(500).optional().nullable()),
  knownInterests: z
    .preprocess((val) => {
      if (typeof val === "string") {
        return val
          .split(",")
          .map((s) => s.trim().slice(0, 100))
          .filter(Boolean)
          .slice(0, 10);
      }
      if (Array.isArray(val)) {
        return val
          .map((s) => (typeof s === "string" ? s.trim().slice(0, 100) : ""))
          .filter(Boolean)
          .slice(0, 10);
      }
      return [];
    }, z.array(z.string().max(100)).max(10))
    .default([]),
});

export type IntakeRequest = z.infer<typeof intakeRequestSchema>;

// ---------------------------------------------------------------------------
// Recipient Facts
// ---------------------------------------------------------------------------
export const factStatusEnum = z.enum(["known", "possible", "needs_confirmation"]);
export type FactStatus = z.infer<typeof factStatusEnum>;

export const factSourceEnum = z.enum(["organizer", "friend", "recipient"]);
export type FactSource = z.infer<typeof factSourceEnum>;

export const recipientFactSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().min(1).max(300),
  status: factStatusEnum,
  source: factSourceEnum.default("organizer"),
});

export type RecipientFactOutput = z.infer<typeof recipientFactSchema>;

// ---------------------------------------------------------------------------
// Plan Item in Proposal
// ---------------------------------------------------------------------------
// Notice: 'confirmed' is explicitly excluded. Cost can only be estimate or quoted.
export const proposedCostStatusEnum = z.enum(["estimate", "quoted"]);

export const proposedPlanItemSchema = z.object({
  title: z.string().min(1).max(120),
  category: z.string().min(1).max(50).default("other"),
  intentTag: z.string().max(50).nullable().optional(),
  why: z.string().max(300).nullable().optional(),
  estimatedCost: z.number().nonnegative().default(0),
  costStatus: proposedCostStatusEnum.default("estimate"),
  isNonNegotiable: z.boolean().default(false),
  planB: z.string().max(300).nullable().optional(),
});

export type ProposedPlanItem = z.infer<typeof proposedPlanItemSchema>;

// ---------------------------------------------------------------------------
// Single Celebration Idea
// ---------------------------------------------------------------------------
export const celebrationIdeaSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  whyItSuitsThem: z.string().min(1).max(400),
  activities: z.array(z.string().min(1).max(200)).min(1).max(8),
  estimatedCostMin: z.number().nonnegative(),
  estimatedCostMax: z.number().nonnegative(),
  currency: z.string().length(3).default("INR"),
  requiredTime: z.string().min(1).max(100),
  urgencyMode: urgencyModeEnum,
  facts: z.array(recipientFactSchema).max(10).default([]),
  items: z.array(proposedPlanItemSchema).min(1).max(15),
});

export type CelebrationIdea = z.infer<typeof celebrationIdeaSchema>;

// ---------------------------------------------------------------------------
// Ideas Response (3 curated options)
// ---------------------------------------------------------------------------
export const proposeIdeasResponseSchema = z.object({
  ideas: z.array(celebrationIdeaSchema).length(3),
  generalWhy: z.string().max(300).optional(),
  source: z.enum(["ai", "fallback"]).default("ai"),
  fallbackReason: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});

export type ProposeIdeasResponse = z.infer<typeof proposeIdeasResponseSchema>;

// ---------------------------------------------------------------------------
// Build Full Plan Schema (from approved idea)
// ---------------------------------------------------------------------------
export const fullPlanSchema = z.object({
  occasionTitle: z.string().min(1).max(120),
  intentSummary: z.string().max(500),
  urgencyMode: urgencyModeEnum,
  facts: z.array(recipientFactSchema),
  items: z.array(
    proposedPlanItemSchema.extend({
      id: z.string().optional(),
      dependsOnIndices: z.array(z.number().int().nonnegative()).default([]),
      dueTiming: z.string().max(100).optional(),
    }),
  ).min(1),
});

export type FullPlanOutput = z.infer<typeof fullPlanSchema>;

// ---------------------------------------------------------------------------
// Trade-Offs & Change Handling Schemas (Task 5)
// ---------------------------------------------------------------------------
export const tradeoffModifiedItemSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(120).optional(),
  estimatedCost: z.number().nonnegative().optional(),
  costStatus: proposedCostStatusEnum.optional(),
  dueAt: z.string().nullable().optional(),
  dependsOn: z.array(z.string()).optional(),
  intentTag: z.string().nullable().optional(),
  why: z.string().nullable().optional(),
});

export type TradeoffModifiedItem = z.infer<typeof tradeoffModifiedItemSchema>;

export const tradeoffOptionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(400),
  whyItWorks: z.string().min(1).max(300),
  preservedIntentTags: z.array(z.string()).default([]),
  modifiedItems: z.array(tradeoffModifiedItemSchema).default([]),
  addedItems: z.array(proposedPlanItemSchema).default([]),
  removedItemIds: z.array(z.string()).default([]),
});

export type TradeoffOption = z.infer<typeof tradeoffOptionSchema>;

export const proposeTradeoffsResponseSchema = z.object({
  options: z.array(tradeoffOptionSchema).min(2).max(3),
  analysisSummary: z.string().max(400).optional(),
  source: z.enum(["ai", "fallback"]).default("ai"),
  fallbackReason: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});

export type ProposeTradeoffsResponse = z.infer<typeof proposeTradeoffsResponseSchema>;

// ---------------------------------------------------------------------------
// Strict Schemas for AI Model Structured Output (Groq / OpenAI Strict Mode)
// In OpenAI / Groq structured output, all properties must be listed in `required`.
// Optional properties are represented as `.nullable()`.
// Provider-level JSON schemas avoid length / item count constraints (minItems,
// maxItems, maxLength) because OpenAI and Groq structured output validation
// rejects generation with HTTP 400 when output deviates slightly from bounds.
// Full domain validation (bounds, lengths, budget, dependencies) is strictly
// applied in the application layer via domain Zod schemas.
// ---------------------------------------------------------------------------
export const aiRecipientFactSchema = z.object({
  key: z.string(),
  value: z.string(),
  status: z.string(),
  source: z.string().nullable().optional(),
});

export const aiProposedPlanItemSchema = z.object({
  title: z.string(),
  category: z.string(),
  intentTag: z.string().nullable().optional(),
  why: z.string().nullable().optional(),
  estimatedCost: z.number(),
  costStatus: z.string(),
  isNonNegotiable: z.boolean(),
  planB: z.string().nullable().optional(),
});

export const aiCelebrationIdeaSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  whyItSuitsThem: z.string(),
  activities: z.array(z.string()),
  estimatedCostMin: z.number(),
  estimatedCostMax: z.number(),
  currency: z.string(),
  requiredTime: z.string(),
  urgencyMode: z.string(),
  facts: z.array(aiRecipientFactSchema),
  items: z.array(aiProposedPlanItemSchema),
});

export const aiProposeIdeasResponseSchema = z.object({
  ideas: z.array(aiCelebrationIdeaSchema),
  generalWhy: z.string().nullable().optional(),
});

export const aiTradeoffModifiedItemSchema = z.object({
  id: z.string(),
  title: z.string().nullable().optional(),
  estimatedCost: z.number().nullable().optional(),
  costStatus: z.string().nullable().optional(),
  dueAt: z.string().nullable().optional(),
  dependsOn: z.array(z.string()).nullable().optional(),
  intentTag: z.string().nullable().optional(),
  why: z.string().nullable().optional(),
});

export const aiTradeoffOptionSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  whyItWorks: z.string(),
  preservedIntentTags: z.array(z.string()),
  modifiedItems: z.array(aiTradeoffModifiedItemSchema),
  addedItems: z.array(aiProposedPlanItemSchema),
  removedItemIds: z.array(z.string()),
});

export const aiProposeTradeoffsResponseSchema = z.object({
  options: z.array(aiTradeoffOptionSchema),
  analysisSummary: z.string().nullable().optional(),
});

// ---------------------------------------------------------------------------
// Pasted-Quote Parsing (prd.md 6.8)
// ---------------------------------------------------------------------------
export const quoteFieldsSchema = z.object({
  price: z.number().nullable(),
  currency: z.string().default("INR"),
  included: z.array(z.string()),
  extra_fees: z.array(z.string()),
  availability_claim: z.string().nullable(),
  cancellation_terms: z.string().nullable(),
  payment_terms: z.string().nullable(),
  missing: z.array(z.string()),
  questions: z.array(z.string()),
});

export type QuoteFields = z.infer<typeof quoteFieldsSchema>;

export const parseQuoteResponseSchema = z.object({
  quoteFields: quoteFieldsSchema,
  source: z.enum(["ai", "fallback"]),
  provider: z.string().optional(),
  model: z.string().optional(),
});

export type ParseQuoteResponse = z.infer<typeof parseQuoteResponseSchema>;

export const aiParseQuoteResponseSchema = z.object({
  price: z.number().nullable(),
  currency: z.string(),
  included: z.array(z.string()),
  extra_fees: z.array(z.string()),
  availability_claim: z.string().nullable(),
  cancellation_terms: z.string().nullable(),
  payment_terms: z.string().nullable(),
  missing: z.array(z.string()),
  questions: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// Vendor Questions (prd.md 6.8)
// ---------------------------------------------------------------------------
export const vendorQuestionsResponseSchema = z.object({
  category: z.string(),
  questions: z.array(z.string()).min(2).max(6),
  source: z.enum(["ai", "fallback"]),
  provider: z.string().optional(),
  model: z.string().optional(),
});

export type VendorQuestionsResponse = z.infer<typeof vendorQuestionsResponseSchema>;

export const aiVendorQuestionsResponseSchema = z.object({
  category: z.string(),
  questions: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// Deliverable: Invitation Copy & Letter Helper (Task 9, prd.md 6.10)
// ---------------------------------------------------------------------------
export const invitationCopySchema = z.object({
  headline: z.string().min(1).max(120),
  subheading: z.string().max(150),
  invitationBody: z.string().min(1).max(400),
  dressCodeNote: z.string().max(100).nullable().optional(),
  source: z.enum(["ai", "fallback"]).default("ai"),
  provider: z.string().optional(),
  model: z.string().optional(),
});

export type InvitationCopy = z.infer<typeof invitationCopySchema>;

export const letterHelperPromptSectionSchema = z.object({
  sectionTitle: z.string().max(80),
  guidancePrompt: z.string().max(250),
  exampleStarter: z.string().max(250),
});

export const letterHelperResponseSchema = z.object({
  structureOutline: z.array(letterHelperPromptSectionSchema).min(2).max(5),
  suggestedClosing: z.string().max(120),
  source: z.enum(["ai", "fallback"]),
  provider: z.string().optional(),
  model: z.string().optional(),
});

export type LetterHelperResponse = z.infer<typeof letterHelperResponseSchema>;

export const aiInvitationCopySchema = z.object({
  headline: z.string(),
  subheading: z.string(),
  invitationBody: z.string(),
  dressCodeNote: z.string().nullable().optional(),
});

export const aiLetterHelperPromptSectionSchema = z.object({
  sectionTitle: z.string(),
  guidancePrompt: z.string(),
  exampleStarter: z.string(),
});

export const aiLetterHelperResponseSchema = z.object({
  structureOutline: z.array(aiLetterHelperPromptSectionSchema),
  suggestedClosing: z.string(),
});

// ---------------------------------------------------------------------------
// Dynamic AI Our Blend Questions
// ---------------------------------------------------------------------------
export const blendQuestionOptionSchema = z.object({
  value: z.string().min(1).max(100),
  label: z.string().min(1).max(120),
  description: z.string().min(1).max(300),
});

export const blendQuestionSchema = z.object({
  key: z.string().min(1).max(80),
  category: z.string().min(1).max(80),
  title: z.string().min(1).max(150),
  subtitle: z.string().min(1).max(250),
  options: z.array(blendQuestionOptionSchema).min(2).max(2),
});

export const blendQuestionsResponseSchema = z.object({
  questions: z.array(blendQuestionSchema).min(3).max(6),
  source: z.enum(["ai", "fallback"]).default("ai"),
  provider: z.string().optional(),
  model: z.string().optional(),
});

export const aiBlendQuestionOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  description: z.string(),
});

export const aiBlendQuestionSchema = z.object({
  key: z.string(),
  category: z.string(),
  title: z.string(),
  subtitle: z.string(),
  options: z.array(aiBlendQuestionOptionSchema),
});

export const aiBlendQuestionsResponseSchema = z.object({
  questions: z.array(aiBlendQuestionSchema),
});

export type BlendQuestionAI = z.infer<typeof blendQuestionSchema>;
export type BlendQuestionsResponseAI = z.infer<typeof blendQuestionsResponseSchema>;





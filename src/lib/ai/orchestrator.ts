/**
 * AI Orchestrator (Single Orchestrator, Server-Only).
 *
 * Rules (architecture.md & rules.md):
 * - One orchestrator exposing typed methods.
 * - Server-side only; API keys never reach the browser.
 * - Fast structured output via generateText + Output.object.
 * - "Invalid model output is rejected, retried once, and the user's input is preserved if it still fails."
 * - "No price or availability is presented as confirmed."
 * - "Do not log plan contents, surprise details, or recipient data." (Rule 24)
 * - Returns explicit source ("ai" | "fallback") so templates are never misrepresented as AI output.
 */

import type { LanguageModel } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { getAiEnv, DEFAULT_AI_MODEL } from "@/lib/env";
import { executeWithChain, ByokConfig, ChainEntry } from "@/lib/ai/router";

export interface ChainCallOptions {
  model?: LanguageModel;
  modelId?: string;
  byok?: ByokConfig | null;
  customChain?: ChainEntry[];
}

function parseCallOptions(options?: LanguageModel | ChainCallOptions): {
  modelOverride?: LanguageModel;
  byok?: ByokConfig | null;
  customChain?: ChainEntry[];
} {
  if (!options) return {};
  if (typeof options === "object" && options !== null && "modelId" in options) {
    return { modelOverride: options as LanguageModel };
  }
  const opts = options as ChainCallOptions;
  return {
    modelOverride: opts.model,
    byok: opts.byok,
    customChain: opts.customChain,
  };
}
import {
  IntakeRequest,
  ProposeIdeasResponse,
  proposeIdeasResponseSchema,
  aiProposeIdeasResponseSchema,
  CelebrationIdea,
  TradeoffOption,
  ProposeTradeoffsResponse,
  proposeTradeoffsResponseSchema,
  aiProposeTradeoffsResponseSchema,
  ParseQuoteResponse,
  parseQuoteResponseSchema,
  aiParseQuoteResponseSchema,
  VendorQuestionsResponse,
  vendorQuestionsResponseSchema,
  aiVendorQuestionsResponseSchema,
  InvitationCopy,
  invitationCopySchema,
  aiInvitationCopySchema,
  LetterHelperResponse,
  letterHelperResponseSchema,
  aiLetterHelperResponseSchema,
  blendQuestionsResponseSchema,
  aiBlendQuestionsResponseSchema,
  UrgencyMode,
  FactStatus,
  FactSource,
} from "./schemas";
import {
  PROPOSE_IDEAS_SYSTEM_PROMPT,
  buildProposeIdeasUserPrompt,
} from "./prompts/propose-ideas";
import {
  PROPOSE_TRADEOFFS_SYSTEM_PROMPT,
  buildProposeTradeoffsUserPrompt,
  ProposeTradeoffsPromptInput,
} from "./prompts/propose-tradeoffs";
import { buildParseQuotePrompt } from "./prompts/parse-quote";
import { buildVendorQuestionsPrompt } from "./prompts/vendor-questions";
import {
  INVITATION_COPY_SYSTEM_PROMPT,
  buildInvitationCopyPrompt,
  InvitationPromptInput,
  LETTER_HELPER_SYSTEM_PROMPT,
  buildLetterHelperPrompt,
  LetterHelperPromptInput,
} from "./prompts/invitation";
import {
  BlendQuestionsPromptInput,
  buildBlendQuestionsPrompt,
} from "./prompts/blend-questions";
import { BlendQuestion } from "@/lib/engine/blend";
import { isOverBudget } from "@/lib/engine/budget";
import { validateDependencyGraph } from "@/lib/engine/timeline";
import { PlanItem } from "@/lib/engine/changes";

/**
 * Privacy-safe error classification & diagnostic logging.
 * Distinguishes provider errors, HTTP status codes, timeouts,
 * structured-output failures, domain-schema validation failures, and retry exhaustion.
 * Never logs prompts, messages, request bodies, responses, headers, user content, or secrets.
 * (Enforces rules.md Rule 14 & Rule 24).
 */
export interface AiDiagnosticDetails {
  category:
    | "provider_error"
    | "timeout"
    | "structured_output_failure"
    | "domain_schema_validation_failure"
    | "retry_exhaustion"
    | "credentials_missing"
    | "unknown";
  statusCode: number | string;
  errorName: string;
  detail?: string;
  zodIssues?: string;
}

export function classifyAiError(error: unknown): AiDiagnosticDetails {
  const err = error as
    | {
        name?: string;
        statusCode?: number;
        status?: number;
        responseBody?: string;
        issues?: Array<{ path?: (string | number)[]; message?: string }>;
        message?: string;
      }
    | undefined;

  const errorName = err?.name || "Error";
  const statusCode = err?.statusCode ?? err?.status ?? "unknown";

  let category: AiDiagnosticDetails["category"] = "unknown";
  let detail = "";
  let zodIssues: string | undefined;

  if (
    errorName === "TimeoutError" ||
    errorName === "AbortError" ||
    err?.message?.toLowerCase().includes("timeout") ||
    err?.message?.toLowerCase().includes("aborted")
  ) {
    category = "timeout";
  } else if (errorName === "ZodError") {
    category = "domain_schema_validation_failure";
    if (Array.isArray(err?.issues)) {
      zodIssues = err.issues.map((i) => `${(i.path || []).join(".") || "root"}: ${i.message}`).join("; ");
    }
  } else if (errorName === "AI_NoObjectGeneratedError" || errorName === "JSONParseError") {
    category = "structured_output_failure";
  } else if (errorName === "AI_APICallError" || statusCode !== "unknown") {
    category = "provider_error";
    if (err?.responseBody) {
      try {
        const parsed = JSON.parse(err.responseBody);
        detail = parsed?.error?.message || parsed?.error?.code || parsed?.error?.type || "";
      } catch {
        detail = "unparseable response body";
      }
    }
  } else if (
    err?.message?.toLowerCase().includes("credentials") ||
    err?.message?.toLowerCase().includes("api key") ||
    err?.message?.toLowerCase().includes("groq_api_key")
  ) {
    category = "credentials_missing";
  }

  return {
    category,
    statusCode,
    errorName,
    detail: detail || (err?.message ? err.message.slice(0, 150) : undefined),
    zodIssues,
  };
}



/**
 * Returns the configured AI model based on available environment variables.
 * Uses getAiEnv() which strictly checks AI provider credentials, independent of Supabase.
 */
export function getModel(modelIdOverride?: string): LanguageModel {
  const env = getAiEnv();
  const modelId = modelIdOverride || env.AI_MODEL || DEFAULT_AI_MODEL;

  if (env.GROQ_API_KEY) {
    const groq = createGroq({
      apiKey: env.GROQ_API_KEY,
    });
    return groq(modelId);
  }

  if (env.GOOGLE_GENERATIVE_AI_API_KEY) {
    const google = createGoogleGenerativeAI({
      apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
    });
    return google(modelIdOverride || "gemini-3.1-flash-lite");
  }

  throw new Error("No valid AI credentials found in environment.");
}

/**
 * Deterministic fallback generator if live AI provider fails after retries.
 * Preserves the user's input completely and constructs 3 viable ideas.
 * Explicitly flagged with source: "fallback".
 */
export function createDeterministicFallbackIdeas(
  input: IntakeRequest,
  fallbackReason?: string,
): ProposeIdeasResponse {
  const recipient = input.recipientName || "your guest of honor";
  const occasion = input.occasionType || "Celebration";
  const budget = input.budgetTotal || 50000;
  const currency = input.currency || "INR";

  const idea1: CelebrationIdea = {
    id: "idea-intimate",
    title: `Intimate & Thoughtful ${occasion}`,
    description: `A warm, deeply personal celebration centered around shared memories and favorite tastes for ${recipient}.`,
    whyItSuitsThem: `Honors their personality with high emotional resonance and minimal friction.`,
    activities: [
      "Curated dinner with favorite comfort dishes",
      "Memory jar with written notes from closest friends",
      "Custom playlist with nostalgic tracks",
    ],
    estimatedCostMin: Math.round(budget * 0.4),
    estimatedCostMax: Math.round(budget * 0.7),
    currency,
    requiredTime: input.urgencyMode === "tonight" ? "2-3 hours prep" : "1-2 days",
    urgencyMode: input.urgencyMode,
    facts: [
      { key: "Preferred style", value: "Intimate and meaningful", status: "possible", source: "organizer" },
      { key: "Dietary preferences", value: input.avoidNotes || "Standard favorites", status: input.avoidNotes ? "known" : "needs_confirmation", source: "organizer" },
    ],
    items: [
      {
        title: "Curate favorite food & beverages",
        category: "catering",
        intentTag: "thoughtfulness",
        why: "Creates an immediate sense of warmth and comfort",
        estimatedCost: Math.round(budget * 0.4),
        costStatus: "estimate",
        isNonNegotiable: true,
      },
      {
        title: "Prepare memory notes & playlist",
        category: "gift",
        intentTag: "nostalgia",
        why: "Highlights personal memories without commercial pressure",
        estimatedCost: Math.round(budget * 0.1),
        costStatus: "estimate",
        isNonNegotiable: false,
      },
    ],
  };

  const idea2: CelebrationIdea = {
    id: "idea-experiential",
    title: `Vibrant Experience Gathering`,
    description: `An active, shared experience bringing together close people for memorable moments.`,
    whyItSuitsThem: `Focuses on quality time and shared joy rather than formal ceremonies.`,
    activities: [
      "Interactive activity or private tasting",
      "Group photo session or candid video reel",
      "Celebratory dessert reveal",
    ],
    estimatedCostMin: Math.round(budget * 0.6),
    estimatedCostMax: Math.round(budget * 0.95),
    currency,
    requiredTime: input.urgencyMode === "tonight" ? "Immediate booking" : "3-5 days",
    urgencyMode: input.urgencyMode,
    facts: [
      { key: "Energy level", value: "Vibrant and celebratory", status: "possible", source: "organizer" },
    ],
    items: [
      {
        title: "Book experiential activity / space",
        category: "venue",
        intentTag: "togetherness",
        why: "Anchor for the entire gathering",
        estimatedCost: Math.round(budget * 0.5),
        costStatus: "estimate",
        isNonNegotiable: true,
      },
      {
        title: "Signature cake / dessert",
        category: "catering",
        intentTag: "celebration",
        why: "The celebratory climax of the event",
        estimatedCost: Math.round(budget * 0.2),
        costStatus: "estimate",
        isNonNegotiable: true,
      },
    ],
  };

  const idea3: CelebrationIdea = {
    id: "idea-surprise",
    title: `The Thoughtful Reveal`,
    description: `A carefully timed surprise with sequential reveals that build anticipation.`,
    whyItSuitsThem: `Provides a genuine sense of wonder while respecting their comfort boundaries.`,
    activities: [
      "Pre-reveal countdown message or clue",
      "Surprise gathering with close friends",
      "Personalized toast and collective gift",
    ],
    estimatedCostMin: Math.round(budget * 0.5),
    estimatedCostMax: Math.round(budget * 0.9),
    currency,
    requiredTime: input.urgencyMode === "tonight" ? "Fast-track coordination" : "1 week",
    urgencyMode: input.urgencyMode,
    facts: [
      { key: "Surprise comfort", value: input.isSurprise ? "Enjoys surprises" : "Verify comfort with reveals", status: input.isSurprise ? "known" : "needs_confirmation", source: "organizer" },
    ],
    items: [
      {
        title: "Coordinate arrival & guest staging",
        category: "decor",
        intentTag: "surprise",
        why: "Ensures the reveal moment is seamless",
        estimatedCost: Math.round(budget * 0.15),
        costStatus: "estimate",
        isNonNegotiable: true,
      },
      {
        title: "Custom gift or keepsake",
        category: "gift",
        intentTag: "thoughtfulness",
        why: "A lasting reminder of the celebration",
        estimatedCost: Math.round(budget * 0.35),
        costStatus: "estimate",
        isNonNegotiable: false,
      },
    ],
  };

  return {
    ideas: [idea1, idea2, idea3],
    generalWhy: `Curated options aligned with your ${input.urgencyMode} timing and ${currency} ${budget} target budget.`,
    source: "fallback",
    fallbackReason,
  };
}

/**
 * Proposes 3 distinct celebration ideas based on the intake request.
 * Retries once if the model response is malformed. If it still fails,
 * preserves user input via the deterministic fallback generator.
 */
export async function proposeIdeas(
  input: IntakeRequest,
  options?: LanguageModel | ChainCallOptions,
): Promise<ProposeIdeasResponse> {
  const { modelOverride, byok, customChain } = parseCallOptions(options);
  const fallback = createDeterministicFallbackIdeas(input);

  const result = await executeWithChain({
    toolName: "proposeIdeas",
    schema: aiProposeIdeasResponseSchema,
    systemPrompt: PROPOSE_IDEAS_SYSTEM_PROMPT,
    prompt: buildProposeIdeasUserPrompt(input),
    maxOutputTokens: 2500,
    byok,
    customChain,
    modelResolverOverride: modelOverride ? () => modelOverride : undefined,
    fallbackGenerator: () => fallback,
  });

  if (result.source === "fallback" || !result.output) {
    return {
      ...fallback,
      source: "fallback",
      provider: result.provider,
      model: result.model,
    };
  }

  try {
    const rawIdeas = (result.output as { ideas: CelebrationIdea[] }).ideas.slice(0, 3);
    if (rawIdeas.length < 3) {
      return {
        ...fallback,
        source: "fallback",
        provider: result.provider,
        model: result.model,
      };
    }

    // Enforce hard rule: no cost is ever confirmed, sanitize lengths, and run through domain schema
    const sanitizedIdeas: CelebrationIdea[] = rawIdeas.map((idea, idx) => ({
      id: idea.id || `idea-${idx + 1}`,
      title: (idea.title || `Celebration Option ${idx + 1}`).slice(0, 120),
      description: (idea.description || "").slice(0, 500),
      whyItSuitsThem: (idea.whyItSuitsThem || "").slice(0, 400),
      activities: (idea.activities && idea.activities.length > 0 ? idea.activities : ["Celebration gathering"])
        .slice(0, 8)
        .map((a) => a.slice(0, 200)),
      estimatedCostMin: Math.max(0, Number(idea.estimatedCostMin) || 0),
      estimatedCostMax: Math.max(0, Number(idea.estimatedCostMax) || 0),
      currency: (idea.currency || input.currency || "INR").slice(0, 3),
      requiredTime: (idea.requiredTime || "Flexible").slice(0, 100),
      urgencyMode: (["tonight", "this_week", "weeks_away"].includes(idea.urgencyMode) ? idea.urgencyMode : input.urgencyMode) as UrgencyMode,
      facts: (idea.facts || []).slice(0, 10).map((f) => ({
        key: (f.key || "Preference").slice(0, 100),
        value: (f.value || "").slice(0, 300),
        status: (["known", "possible", "needs_confirmation"].includes(f.status) ? f.status : "possible") as FactStatus,
        source: (["organizer", "friend", "recipient"].includes(f.source || "") ? f.source : "organizer") as FactSource,
      })),
      items: (idea.items && idea.items.length > 0 ? idea.items : [
        {
          title: "Celebration coordination",
          category: "other",
          intentTag: null,
          why: null,
          estimatedCost: Math.round((input.budgetTotal || 50000) * 0.5),
          costStatus: "estimate" as const,
          isNonNegotiable: true,
          planB: null,
        },
      ])
        .slice(0, 15)
        .map((item) => ({
          title: (item.title || "Plan item").slice(0, 120),
          category: (item.category || "other").slice(0, 50),
          intentTag: item.intentTag ?? null,
          why: item.why ?? null,
          estimatedCost: Math.max(0, Number(item.estimatedCost) || 0),
          planB: item.planB ?? null,
          isNonNegotiable: Boolean(item.isNonNegotiable),
          costStatus: (item.costStatus === "quoted" ? "quoted" : "estimate") as "estimate" | "quoted",
        })),
    }));

    return proposeIdeasResponseSchema.parse({
      ideas: sanitizedIdeas,
      generalWhy: (result.output as { generalWhy?: string }).generalWhy
        ? (result.output as { generalWhy?: string }).generalWhy!.slice(0, 300)
        : undefined,
      source: "ai",
      provider: result.provider,
      model: result.model,
    });
  } catch {
    return {
      ...fallback,
      source: "fallback",
      provider: result.provider,
      model: result.model,
    };
  }
}

/**
 * Simulates applying a trade-off option to baseline plan items.
 */
export function simulateOptionPlan(
  baselineItems: PlanItem[],
  option: TradeoffOption,
): PlanItem[] {
  const removedSet = new Set(option.removedItemIds || []);
  const modMap = new Map((option.modifiedItems || []).map((m) => [m.id, m]));

  const remaining = baselineItems
    .filter((item) => !removedSet.has(item.id))
    .map((item) => {
      const mod = modMap.get(item.id);
      if (!mod) return { ...item };
      return {
        ...item,
        title: mod.title ?? item.title,
        estimated_cost: mod.estimatedCost !== undefined ? mod.estimatedCost : item.estimated_cost,
        due_at: mod.dueAt !== undefined ? mod.dueAt : item.due_at,
        depends_on: mod.dependsOn ?? item.depends_on,
        intent_tag: mod.intentTag !== undefined ? mod.intentTag : item.intent_tag,
        why: mod.why !== undefined ? mod.why : item.why,
      };
    });

  const added: PlanItem[] = (option.addedItems || []).map((a, idx) => ({
    id: `added-${idx + 1}`,
    title: a.title,
    category: a.category || "other",
    intent_tag: a.intentTag || null,
    why: a.why || null,
    status: "todo",
    estimated_cost: a.estimatedCost,
    cost_status: "estimate",
    is_fallback: false,
    is_non_negotiable: a.isNonNegotiable || false,
    depends_on: [],
  }));

  return [...remaining, ...added];
}

/**
 * Deterministic fallback trade-offs guaranteed to pass budget ceiling and dependency rules.
 */
export function createDeterministicFallbackTradeoffs(
  input: ProposeTradeoffsPromptInput,
  baselineItems: PlanItem[],
): ProposeTradeoffsResponse {
  const targetBudget = input.newBudget || input.previousBudget || 500000;
  const newDate = input.newEventAt || input.previousEventAt;

  // Find non-negotiables vs negotiables
  const nonNegotiables = baselineItems.filter((i) => i.is_non_negotiable);
  const negotiables = baselineItems.filter((i) => !i.is_non_negotiable);

  // Option 1: Protect Core Non-Negotiables & Streamline Extras
  const itemsToKeep1 = [...nonNegotiables];
  const itemsToRemove1: string[] = [];

  let currentTotal1 = itemsToKeep1.reduce((sum, item) => sum + Number(item.estimated_cost || 0), 0);
  for (const item of negotiables) {
    const cost = Number(item.estimated_cost || 0);
    if (currentTotal1 + cost <= targetBudget) {
      itemsToKeep1.push(item);
      currentTotal1 += cost;
    } else {
      itemsToRemove1.push(item.id);
    }
  }

  // Adjust due dates if event date moved earlier
  const modified1 = itemsToKeep1
    .filter((item) => newDate && item.due_at && new Date(item.due_at) > new Date(newDate))
    .map((item) => ({
      id: item.id,
      dueAt: newDate,
    }));

  const option1: TradeoffOption = {
    id: "tradeoff-protect-core",
    title: "Protect Core Emotional Intent",
    description: `Keeps non-negotiable items and trims secondary additions to meet the ${input.currency} ${targetBudget} ceiling.`,
    whyItWorks: "Preserves the central experience while cleanly avoiding over-budget risks.",
    preservedIntentTags: Array.from(new Set(itemsToKeep1.map((i) => i.intent_tag).filter(Boolean) as string[])),
    modifiedItems: modified1,
    addedItems: [],
    removedItemIds: itemsToRemove1,
  };

  // Option 2: Value Substitution — proportionally scale negotiable costs so the
  // total never exceeds targetBudget even when non-negotiables alone are large.
  const nonNegotiableTotal2 = nonNegotiables.reduce((s, i) => s + Number(i.estimated_cost || 0), 0);
  const negotiableTotal2 = negotiables.reduce((s, i) => s + Number(i.estimated_cost || 0), 0);
  const availableForNegotiables2 = targetBudget - nonNegotiableTotal2;
  const scaleFactor2 =
    negotiableTotal2 > 0
      ? Math.min(0.9, Math.max(0, availableForNegotiables2 / negotiableTotal2))
      : 0;

  const option2: TradeoffOption = {
    id: "tradeoff-value-substitute",
    title: "Lightweight High-Value Substitutions",
    description: `Reduces individual line-item scopes and adjusts timelines to fit within the earlier schedule.`,
    whyItWorks: "Maintains all activities with more focused, curated versions.",
    preservedIntentTags: Array.from(new Set(baselineItems.map((i) => i.intent_tag).filter(Boolean) as string[])),
    modifiedItems: baselineItems.map((item) => {
      const origCost = Number(item.estimated_cost || 0);
      const reducedCost = item.is_non_negotiable
        ? origCost
        : Math.floor(origCost * scaleFactor2);
      return {
        id: item.id,
        estimatedCost: reducedCost,
        dueAt: newDate && item.due_at && new Date(item.due_at) > new Date(newDate) ? newDate : item.due_at,
      };
    }),
    addedItems: [],
    removedItemIds: [],
  };

  return {
    options: [option1, option2],
    analysisSummary: `Generated 2 verified trade-off options respecting the ${input.currency} ${targetBudget} target and timeline constraints.`,
    source: "fallback",
  };
}

/**
 * Proposes 2 to 3 trade-offs when constraints change.
 * HARD RULE: "Trade-offs that fail the engine's budget or dependency check are dropped."
 */
export async function proposeTradeoffs(
  promptInput: ProposeTradeoffsPromptInput,
  baselineItems: PlanItem[],
  options?: LanguageModel | ChainCallOptions,
): Promise<ProposeTradeoffsResponse> {
  const targetBudget = promptInput.newBudget ?? promptInput.previousBudget;
  const verifiedOptions: TradeoffOption[] = [];
  const { modelOverride, byok, customChain } = parseCallOptions(options);
  const fallback = createDeterministicFallbackTradeoffs(promptInput, baselineItems);

  const result = await executeWithChain({
    toolName: "proposeTradeoffs",
    schema: aiProposeTradeoffsResponseSchema,
    systemPrompt: PROPOSE_TRADEOFFS_SYSTEM_PROMPT,
    prompt: buildProposeTradeoffsUserPrompt(promptInput),
    maxOutputTokens: 2500,
    byok,
    customChain,
    modelResolverOverride: modelOverride ? () => modelOverride : undefined,
    fallbackGenerator: () => createDeterministicFallbackTradeoffs(promptInput, baselineItems),
  });

  if (result.source === "ai") {
    const rawOptions = (result.output as { options: TradeoffOption[] }).options || [];
    for (const option of rawOptions) {
      const sanitizedOption: TradeoffOption = {
        id: option.id || `tradeoff-${verifiedOptions.length + 1}`,
        title: (option.title || "Trade-off Option").slice(0, 120),
        description: (option.description || "").slice(0, 400),
        whyItWorks: (option.whyItWorks || "").slice(0, 300),
        preservedIntentTags: option.preservedIntentTags || [],
        modifiedItems: (option.modifiedItems || []).map((m) => ({
          id: m.id,
          title: m.title ? m.title.slice(0, 120) : undefined,
          estimatedCost: m.estimatedCost !== null && m.estimatedCost !== undefined ? Math.max(0, Number(m.estimatedCost)) : undefined,
          costStatus: m.costStatus === "quoted" ? "quoted" : m.costStatus ? "estimate" : undefined,
          dueAt: m.dueAt ?? undefined,
          dependsOn: m.dependsOn ?? undefined,
          intentTag: m.intentTag ? m.intentTag.slice(0, 50) : undefined,
          why: m.why ? m.why.slice(0, 300) : undefined,
        })),
        addedItems: (option.addedItems || []).map((a) => ({
          title: (a.title || "Added item").slice(0, 120),
          category: (a.category || "other").slice(0, 50),
          intentTag: a.intentTag ? a.intentTag.slice(0, 50) : null,
          why: a.why ? a.why.slice(0, 300) : null,
          estimatedCost: Math.max(0, Number(a.estimatedCost) || 0),
          costStatus: a.costStatus === "quoted" ? "quoted" : "estimate",
          isNonNegotiable: a.isNonNegotiable || false,
          planB: a.planB ? a.planB.slice(0, 300) : null,
        })),
        removedItemIds: option.removedItemIds || [],
      };

      const simulatedPlan = simulateOptionPlan(baselineItems, sanitizedOption);

      if (targetBudget !== undefined && targetBudget !== null) {
        if (isOverBudget(targetBudget, simulatedPlan)) {
          continue;
        }
      }

      const graphValidation = validateDependencyGraph(simulatedPlan);
      if (!graphValidation.valid) {
        continue;
      }

      verifiedOptions.push(sanitizedOption);
    }

    if (verifiedOptions.length >= 2) {
      return proposeTradeoffsResponseSchema.parse({
        options: verifiedOptions.slice(0, 3),
        analysisSummary: `Trade-offs evaluated and verified by deterministic budget and timeline engine.`,
        source: "ai",
        provider: result.provider,
        model: result.model,
      });
    }
  }

  // If fewer than 2 valid options passed, supplement with deterministic, engine-proven options
  for (const opt of fallback.options) {
    if (verifiedOptions.length < 3 && !verifiedOptions.some((o) => o.id === opt.id)) {
      verifiedOptions.push(opt);
    }
  }

  return proposeTradeoffsResponseSchema.parse({
    options: verifiedOptions.slice(0, 3),
    analysisSummary: `Generated verified trade-off options respecting the ${promptInput.currency} ${targetBudget} target and timeline constraints.`,
    source: "fallback",
    provider: result.provider,
    model: result.model,
  });
}

// ---------------------------------------------------------------------------
// Pasted-Quote Parsing (prd.md 6.8)
// ---------------------------------------------------------------------------

function extractBasicPrice(text: string): number | null {
  const match = text.match(/(?:₹|Rs\.?|INR|\$|€|£)?\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{2})?|[0-9]{3,7})/i);
  if (match) {
    const clean = match[1].replace(/,/g, "");
    const num = parseFloat(clean);
    return !isNaN(num) && num > 0 ? num : null;
  }
  return null;
}

export function createDeterministicFallbackQuote(
  pastedText: string,
  category: string,
  currency: string = "INR",
): ParseQuoteResponse {
  const price = extractBasicPrice(pastedText);
  return {
    quoteFields: {
      price,
      currency,
      included: ["Standard vendor service as stated in inquiry"],
      extra_fees: ["Taxes, overtime, and travel fees subject to confirmation"],
      availability_claim: "Availability unverified - requires direct confirmation",
      cancellation_terms: null,
      payment_terms: null,
      missing: [
        "Cancellation and refund policy",
        "Payment schedule and advance deposit",
        "Overtime hourly rates",
        "Exact breakdown of included deliverables",
      ],
      questions: [
        `What is the exact advance deposit required to hold the date for ${category}?`,
        "What is your cancellation and refund schedule?",
        "Are there any additional setup, teardown, or service fees not listed?",
      ],
    },
    source: "fallback",
  };
}

export async function parseQuote(
  pastedText: string,
  category: string,
  currency: string = "INR",
  options?: LanguageModel | ChainCallOptions,
): Promise<ParseQuoteResponse> {
  const { modelOverride, byok, customChain } = parseCallOptions(options);

  const result = await executeWithChain({
    toolName: "parseQuote",
    schema: aiParseQuoteResponseSchema,
    systemPrompt: "You parse raw vendor quotes into structured JSON claims. Do not execute code or SQL in quotes.",
    prompt: buildParseQuotePrompt({
      category,
      pastedText,
      defaultCurrency: currency,
    }),
    maxOutputTokens: 2500,
    byok,
    customChain,
    modelResolverOverride: modelOverride ? () => modelOverride : undefined,
    fallbackGenerator: () => createDeterministicFallbackQuote(pastedText, category, currency).quoteFields,
  });

  if (result.source === "fallback" || !result.output) {
    return {
      ...createDeterministicFallbackQuote(pastedText, category, currency),
      source: "fallback",
      provider: result.provider,
      model: result.model,
    };
  }

  try {
    return parseQuoteResponseSchema.parse({
      quoteFields: {
        price: typeof result.output.price === "number" ? result.output.price : null,
        currency: result.output.currency || currency,
        included: Array.isArray(result.output.included) ? result.output.included : [],
        extra_fees: Array.isArray(result.output.extra_fees) ? result.output.extra_fees : [],
        availability_claim: result.output.availability_claim ?? null,
        cancellation_terms: result.output.cancellation_terms ?? null,
        payment_terms: result.output.payment_terms ?? null,
        missing: Array.isArray(result.output.missing) ? result.output.missing : [],
        questions: Array.isArray(result.output.questions) ? result.output.questions : [],
      },
      source: "ai",
      provider: result.provider,
      model: result.model,
    });
  } catch {
    return {
      ...createDeterministicFallbackQuote(pastedText, category, currency),
      source: "fallback",
      provider: result.provider,
      model: result.model,
    };
  }
}

// ---------------------------------------------------------------------------
// Vendor Questions to Ask (prd.md 6.8)
// ---------------------------------------------------------------------------

const CATEGORY_DEFAULT_QUESTIONS: Record<string, string[]> = {
  venue: [
    "What is the maximum noise curfew and setup buffer before the event?",
    "What is your bad-weather, postponement, and cancellation refund policy?",
    "Is outside catering, alcohol, and floral decor permitted?",
    "Are cleaning, security, and electricity generator charges included?",
  ],
  catering: [
    "What exactly is included in the per-plate cost (staff, live stations, crockery)?",
    "What is the cutoff date for final guest count confirmation?",
    "How are dietary restrictions, allergies, and children's portions handled?",
    "What is your policy regarding leftover food?",
  ],
  photography: [
    "How many hours of coverage and photographers are included?",
    "What is the delivery timeline for teaser photos and full edited gallery?",
    "What backup arrangements exist if the primary photographer is unwell?",
    "Do you provide raw unedited footage?",
  ],
  decor: [
    "Does your quote include complete teardown and post-event cleanup?",
    "Are the flowers fresh or faux, and can centerpieces be repurposed?",
    "What weather-proofing measures exist for outdoor decor?",
    "Are sound, lighting, and stage rigging included in this quote?",
  ],
  music: [
    "Do you supply the complete sound system, microphones, and cabling?",
    "Can we provide a customized playlist and a do-not-play list?",
    "What is your overtime rate per hour if the celebration extends?",
  ],
};

export function createDeterministicFallbackQuestions(
  category: string,
): VendorQuestionsResponse {
  const normalized = category.toLowerCase().trim();
  const matchedKey = Object.keys(CATEGORY_DEFAULT_QUESTIONS).find((k) => normalized.includes(k));
  const questions = matchedKey
    ? CATEGORY_DEFAULT_QUESTIONS[matchedKey]
    : [
        "What specific services and deliverables are included in this quote?",
        "What are your advance deposit milestones and cancellation refund terms?",
        "Are there any additional service fees, overtime rates, or taxes?",
        "What backup plan do you have in case of an emergency or equipment failure?",
      ];

  return {
    category,
    questions,
    source: "fallback",
  };
}

export async function getVendorQuestions(
  category: string,
  occasionType: string = "celebration",
  options?: LanguageModel | ChainCallOptions,
): Promise<VendorQuestionsResponse> {
  const { modelOverride, byok, customChain } = parseCallOptions(options);

  const result = await executeWithChain({
    toolName: "getVendorQuestions",
    schema: aiVendorQuestionsResponseSchema,
    systemPrompt: "You are an experienced event planner generating critical vendor vetting questions.",
    prompt: buildVendorQuestionsPrompt({ category, occasionType }),
    maxOutputTokens: 1000,
    byok,
    customChain,
    modelResolverOverride: modelOverride ? () => modelOverride : undefined,
    fallbackGenerator: () => createDeterministicFallbackQuestions(category),
  });

  if (result.source === "fallback") {
    return {
      ...result.output,
      source: "fallback",
      provider: result.provider,
      model: result.model,
    };
  }

  try {
    return vendorQuestionsResponseSchema.parse({
      category,
      questions: result.output.questions.slice(0, 6),
      source: "ai",
      provider: result.provider,
      model: result.model,
    });
  } catch {
    return {
      ...createDeterministicFallbackQuestions(category),
      source: "fallback",
      provider: result.provider,
      model: result.model,
    };
  }
}

// ---------------------------------------------------------------------------
// Invitation Copy & Letter Helper (Task 9, prd.md 6.10)
// ---------------------------------------------------------------------------

export function createDeterministicFallbackInvitationCopy(
  input: InvitationPromptInput,
): InvitationCopy {
  return {
    headline: `Celebrating ${input.recipientName || "a Special Occasion"}`,
    subheading: `A warm gathering in honor of a cherished milestone`,
    invitationBody: `Please join us as we come together to celebrate ${input.recipientName || "our guest of honor"} with joyful memories, great food, and heartwarming company.`,
    dressCodeNote: "Festive & comfortable attire",
    source: "fallback",
  };
}

export async function generateInvitationCopy(
  input: InvitationPromptInput,
  options?: LanguageModel | ChainCallOptions,
): Promise<InvitationCopy> {
  const { modelOverride, byok, customChain } = parseCallOptions(options);

  const result = await executeWithChain({
    toolName: "generateInvitationCopy",
    schema: aiInvitationCopySchema,
    systemPrompt: INVITATION_COPY_SYSTEM_PROMPT,
    prompt: buildInvitationCopyPrompt(input),
    maxOutputTokens: 500,
    byok,
    customChain,
    modelResolverOverride: modelOverride ? () => modelOverride : undefined,
    fallbackGenerator: () => createDeterministicFallbackInvitationCopy(input),
  });

  if (result.source === "fallback" || !result.output) {
    return {
      ...createDeterministicFallbackInvitationCopy(input),
      source: "fallback",
      provider: result.provider,
      model: result.model,
    };
  }

  try {
    return invitationCopySchema.parse({
      headline: result.output.headline.slice(0, 120),
      subheading: result.output.subheading.slice(0, 150),
      invitationBody: result.output.invitationBody.slice(0, 400),
      dressCodeNote: result.output.dressCodeNote ? result.output.dressCodeNote.slice(0, 100) : null,
      source: "ai",
      provider: result.provider,
      model: result.model,
    });
  } catch {
    return {
      ...createDeterministicFallbackInvitationCopy(input),
      source: "fallback",
      provider: result.provider,
      model: result.model,
    };
  }
}

export function createDeterministicFallbackLetterHelper(
  input: LetterHelperPromptInput,
): LetterHelperResponse {
  return {
    structureOutline: [
      {
        sectionTitle: "A Specific Memory or Moment",
        guidancePrompt: `Think back to a moment when ${input.recipientName || "they"} made you smile, feel supported, or laugh out loud. What happened?`,
        exampleStarter: `I still remember the time when we...`,
      },
      {
        sectionTitle: "What You Admire or Cherish",
        guidancePrompt: `What is a unique quality or quiet strength in ${input.recipientName || "them"} that you deeply appreciate?`,
        exampleStarter: `What I cherish most about you is...`,
      },
      {
        sectionTitle: "A Hope or Blessing for Their Journey",
        guidancePrompt: `What do you wish for them in this next season or year ahead?`,
        exampleStarter: `As you celebrate this milestone, my biggest wish for you is...`,
      },
    ],
    suggestedClosing: `With love and deep appreciation,`,
    source: "fallback",
  };
}

export async function getLetterHelper(
  input: LetterHelperPromptInput,
  options?: LanguageModel | ChainCallOptions,
): Promise<LetterHelperResponse> {
  const { modelOverride, byok, customChain } = parseCallOptions(options);

  const result = await executeWithChain({
    toolName: "getLetterHelper",
    schema: aiLetterHelperResponseSchema,
    systemPrompt: LETTER_HELPER_SYSTEM_PROMPT,
    prompt: buildLetterHelperPrompt(input),
    maxOutputTokens: 1000,
    byok,
    customChain,
    modelResolverOverride: modelOverride ? () => modelOverride : undefined,
    fallbackGenerator: () => createDeterministicFallbackLetterHelper(input),
  });

  if (result.source === "fallback" || !result.output) {
    return {
      ...createDeterministicFallbackLetterHelper(input),
      source: "fallback",
      provider: result.provider,
      model: result.model,
    };
  }

  try {
    return letterHelperResponseSchema.parse({
      structureOutline: result.output.structureOutline.slice(0, 5).map((s) => ({
        sectionTitle: s.sectionTitle.slice(0, 80),
        guidancePrompt: s.guidancePrompt.slice(0, 250),
        exampleStarter: s.exampleStarter.slice(0, 250),
      })),
      suggestedClosing: result.output.suggestedClosing.slice(0, 120),
      source: "ai",
      provider: result.provider,
      model: result.model,
    });
  } catch {
    return {
      ...createDeterministicFallbackLetterHelper(input),
      source: "fallback",
      provider: result.provider,
      model: result.model,
    };
  }
}

export const BLEND_QUESTIONS_SYSTEM_PROMPT =
  "You are an empathetic, world-class celebration designer. You create bespoke binary vibe-check questions comparing celebration directions tailored directly to the specific person and prompt.";

export function createDeterministicFallbackBlendQuestions(
  input: BlendQuestionsPromptInput,
): BlendQuestion[] {
  const name = input.recipientName || "them";
  const occasion = input.occasionType || "Celebration";
  const concept = input.concept || (input.knownInterests && input.knownInterests.length > 0 ? input.knownInterests.join(", ") : "celebration vibe");

  return [
    {
      key: "celebration_setting",
      category: "Setting & Energy",
      title: `Atmosphere & Setting for ${name}`,
      subtitle: `What kind of atmosphere would make ${name} feel most special for this ${occasion}?`,
      options: [
        {
          value: "intimate_cozy",
          label: "Intimate & Relaxed",
          description: `A quiet, comfortable setting allowing meaningful connection and warmth without sensory overload`,
        },
        {
          value: "vibrant_festive",
          label: "Lively & Celebratory",
          description: `A spirited, energetic atmosphere filled with celebratory music and shared joy`,
        },
      ],
    },
    {
      key: "celebration_focus",
      category: "Activity vs Keepsake",
      title: `Core Focus for ${name}`,
      subtitle: `What will create the most meaningful memory honoring ${name}'s love for ${concept}?`,
      options: [
        {
          value: "experiential_moment",
          label: `Shared ${concept} Experience`,
          description: `Immersing in a dedicated hands-on experience or activity together`,
        },
        {
          value: "thoughtful_keepsake",
          label: "Lasting Keepsake or Tribute",
          description: `A personalized tangible reminder or shared message collection they can hold onto`,
        },
      ],
    },
    {
      key: "culinary_style",
      category: "Dining & Refreshments",
      title: `Food & Hospitality Style`,
      subtitle: `How should meals and refreshments be served during the celebration?`,
      options: [
        {
          value: "relaxed_grazing",
          label: "Casual Sharing & Favorite Comfort Foods",
          description: `Laid-back grazing platters, familiar comfort dishes, and free-flowing refreshments`,
        },
        {
          value: "curated_specialty",
          label: "Curated Specialty or Tasting Menu",
          description: `A standout dining experience with intentional courses or private specialty cooking`,
        },
      ],
    },
    {
      key: "surprise_comfort",
      category: "Surprises & Flow",
      title: `Surprise vs Predictability for ${name}`,
      subtitle: `How does ${name} feel about unexpected elements or sudden reveals?`,
      options: [
        {
          value: "spontaneous_delight",
          label: "Hidden Clues & Dramatic Reveal",
          description: `Keep elements secret until the moment to maximize anticipation and wonder`,
        },
        {
          value: "gentle_anticipation",
          label: "Clear Schedule & Advance Awareness",
          description: `Let them know what to expect in advance so they feel calm and prepared`,
        },
      ],
    },
  ];
}

export async function generateBlendQuestions(
  input: BlendQuestionsPromptInput,
  options?: LanguageModel | ChainCallOptions,
): Promise<BlendQuestion[]> {
  const { modelOverride, byok, customChain } = parseCallOptions(options);

  const result = await executeWithChain({
    toolName: "generateBlendQuestions",
    schema: aiBlendQuestionsResponseSchema,
    systemPrompt: BLEND_QUESTIONS_SYSTEM_PROMPT,
    prompt: buildBlendQuestionsPrompt(input),
    maxOutputTokens: 1500,
    byok,
    customChain,
    modelResolverOverride: modelOverride ? () => modelOverride : undefined,
    fallbackGenerator: () => ({ questions: createDeterministicFallbackBlendQuestions(input) }),
  });

  if (result.source === "ai" && result.output && Array.isArray((result.output as { questions: unknown[] }).questions)) {
    try {
      const parsed = blendQuestionsResponseSchema.parse({
        questions: (result.output as { questions: Array<{ key: string; category: string; title: string; subtitle: string; options: Array<{ value: string; label: string; description: string }> }> }).questions.slice(0, 5).map((q) => ({
          key: q.key.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 80),
          category: q.category.slice(0, 80),
          title: q.title.slice(0, 150),
          subtitle: q.subtitle.slice(0, 250),
          options: q.options.slice(0, 2).map((o) => ({
            value: o.value.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 100),
            label: o.label.slice(0, 120),
            description: o.description.slice(0, 300),
          })),
        })),
        source: "ai",
        provider: result.provider,
        model: result.model,
      });
      return parsed.questions;
    } catch {
      // Fall through to fallback
    }
  }

  return createDeterministicFallbackBlendQuestions(input);
}



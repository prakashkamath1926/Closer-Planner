/**
 * AI Provider Chain Router
 *
 * Tries ordered provider:model entries with resilient error handling:
 * - 429, timeout, 5xx, network: backoff once, then next entry.
 * - 401/403 or 400 (model/feature unsupported): do NOT retry; log metadata only (never keys or prompts);
 *   skip entry for 60s cooldown; next entry.
 * - Output failing Zod: retry once on the same entry, then next.
 * - Chain exhausted: deterministic template fallback with source: 'fallback'.
 * Every result carries { source, provider, model }.
 */

import { z } from "zod";
import { generateText, Output, LanguageModel } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  getAiEnv,
  parseModelChain,
  isCompatConfigured,
  ChainEntry,
  SupportedProvider,
} from "@/lib/env";

export type { ChainEntry, SupportedProvider };

export type ErrorCategory = "transient" | "fatal_entry" | "zod_failure" | "unknown";

export interface ErrorClassification {
  category: ErrorCategory;
  status?: number;
  reason: string;
}

export interface ByokConfig {
  provider: "groq" | "google";
  apiKey: string;
  model?: string;
}

export interface ExecuteChainOptions<T> {
  toolName: string;
  schema: z.ZodSchema<T>;
  systemPrompt: string;
  prompt: string;
  maxOutputTokens?: number;
  fallbackGenerator: () => T;
  byok?: ByokConfig | null;
  customChain?: ChainEntry[];
  modelResolverOverride?: (entry: ChainEntry, byok?: ByokConfig | null) => LanguageModel | null;
  backoffMs?: number;
}

export interface ChainResult<T> {
  output: T;
  source: "ai" | "fallback";
  provider?: string;
  model?: string;
  error?: string;
}

// In-memory circuit breaker cooldown (60s)
const cooldownMap = new Map<string, number>();

export function getCooldownKey(provider: string, model: string): string {
  return `${provider.toLowerCase().trim()}:${model.toLowerCase().trim()}`;
}

export function isEntryInCooldown(provider: string, model: string): boolean {
  const key = getCooldownKey(provider, model);
  const until = cooldownMap.get(key);
  if (!until) return false;
  if (Date.now() >= until) {
    cooldownMap.delete(key);
    return false;
  }
  return true;
}

export function setEntryCooldown(provider: string, model: string, durationMs = 60000): void {
  const key = getCooldownKey(provider, model);
  cooldownMap.set(key, Date.now() + durationMs);
}

export function clearAllCooldowns(): void {
  cooldownMap.clear();
}

/**
 * Classifies an error into transient (429/timeout/5xx/network), fatal_entry (401/403/400),
 * or zod_failure. Never leaks prompt or keys.
 */
export function categorizeError(error: unknown): ErrorClassification {
  const msg = String((error as { message?: string })?.message || error || "").toLowerCase();
  const name = String((error as { name?: string })?.name || "").toLowerCase();

  if (
    error instanceof z.ZodError ||
    name === "ai_noobjectgeneratederror" ||
    name === "zoderror" ||
    msg.includes("zod") ||
    msg.includes("validation failed") ||
    msg.includes("schema validation")
  ) {
    return { category: "zod_failure", reason: "Structured output failed schema validation" };
  }

  const errObj = error as {
    status?: number;
    statusCode?: number;
    response?: { status?: number };
    message?: string;
    name?: string;
  };

  const status = errObj?.status || errObj?.statusCode || errObj?.response?.status;

  // Explicit HTTP status checks
  if (status === 401 || status === 403 || status === 400) {
    return {
      category: "fatal_entry",
      status,
      reason: `HTTP ${status}: ${status === 400 ? "Model or feature not supported" : "Unauthorized/Forbidden"}`,
    };
  }

  if (status === 429 || status === 408 || (status && status >= 500 && status < 600)) {
    return {
      category: "transient",
      status,
      reason: `HTTP ${status}: ${status === 429 ? "Rate limited" : "Transient/Server error"}`,
    };
  }

  // Text message / error name inspections
  if (name.includes("timeout") || name.includes("abort") || msg.includes("timeout") || msg.includes("timed out") || msg.includes("abort")) {
    return { category: "transient", status: 408, reason: "Request timed out" };
  }

  if (msg.includes("429") || msg.includes("rate limit") || msg.includes("quota exceeded") || msg.includes("too many requests")) {
    return { category: "transient", status: 429, reason: "Rate limit / quota exceeded" };
  }

  if (msg.includes("401") || msg.includes("unauthorized") || msg.includes("invalid api key") || msg.includes("authentication")) {
    return { category: "fatal_entry", status: 401, reason: "Unauthorized / Invalid API key" };
  }

  if (msg.includes("403") || msg.includes("forbidden") || msg.includes("permission denied")) {
    return { category: "fatal_entry", status: 403, reason: "Forbidden / Access denied" };
  }

  if (msg.includes("400") || msg.includes("not supported") || msg.includes("not found") || msg.includes("invalid_request_error")) {
    return { category: "fatal_entry", status: 400, reason: "Model or feature not supported" };
  }

  if (
    msg.includes("network") ||
    msg.includes("fetch failed") ||
    msg.includes("econnreset") ||
    msg.includes("enotfound") ||
    msg.includes("etimedout") ||
    msg.includes("socket hang up")
  ) {
    return { category: "transient", reason: "Network connection failure" };
  }

  if (
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("internal server error") ||
    msg.includes("bad gateway")
  ) {
    return { category: "transient", status: 500, reason: "Upstream server failure" };
  }

  return { category: "unknown", status, reason: "Unexpected AI provider error" };
}

/**
 * Log once with strictly sanitized metadata: tool, provider, model, status.
 * NEVER prints prompt text, keys, or raw payloads.
 */
function logChainFatalError(meta: { tool: string; provider: string; model: string; status?: number; reason: string }) {
  console.error(
    `[AI Chain Error] tool=${meta.tool} provider=${meta.provider} model=${meta.model} status=${meta.status ?? "unknown"} reason="${meta.reason}"`
  );
}

/**
 * Instantiates LanguageModel for an entry. Returns null if required provider key/config is missing.
 */
export function defaultModelResolver(
  entry: ChainEntry,
  byok?: ByokConfig | null
): LanguageModel | null {
  try {
    const env = getAiEnv();

    if (entry.provider === "groq") {
      const apiKey = byok?.provider === "groq" ? byok.apiKey : env.GROQ_API_KEY;
      if (!apiKey) return null;
      const groq = createGroq({ apiKey });
      return groq(entry.model);
    }

    if (entry.provider === "google") {
      const apiKey = byok?.provider === "google" ? byok.apiKey : env.GOOGLE_GENERATIVE_AI_API_KEY;
      if (!apiKey) return null;
      const google = createGoogleGenerativeAI({ apiKey });
      return google(entry.model);
    }

    if (entry.provider === "compat") {
      if (!isCompatConfigured(env)) return null;
      const compat = createOpenAICompatible({
        name: env.COMPAT_LABEL!,
        baseURL: env.COMPAT_BASE_URL!,
        apiKey: env.COMPAT_API_KEY!,
      });
      return compat(entry.model);
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Execute a structured prompt across the provider chain in order.
 */
export async function executeWithChain<T>(
  options: ExecuteChainOptions<T>
): Promise<ChainResult<T>> {
  const {
    toolName,
    schema,
    systemPrompt,
    prompt,
    maxOutputTokens = 1500,
    fallbackGenerator,
    byok,
    customChain,
    modelResolverOverride,
    backoffMs = 300,
  } = options;

  let activeChain: ChainEntry[] = [];

  // If BYOK session key is provided, try user's provider/model first!
  if (byok?.apiKey && (byok.provider === "groq" || byok.provider === "google")) {
    const userModel = byok.model || (byok.provider === "groq" ? "openai/gpt-oss-20b" : "gemini-3.1-flash-lite");
    activeChain.push({ provider: byok.provider, model: userModel });
  }

  if (customChain && customChain.length > 0) {
    activeChain = activeChain.concat(customChain);
  } else if (modelResolverOverride) {
    activeChain = [{ provider: "groq", model: "override" }];
  } else {
    try {
      const env = getAiEnv();
      const configuredChain = parseModelChain(env.AI_MODEL_CHAIN);
      activeChain = activeChain.concat(configuredChain);
    } catch {
      // If env is missing or unparseable, fall straight to deterministic fallback
      return {
        output: fallbackGenerator(),
        source: "fallback",
        error: "AI credentials unconfigured",
      };
    }
  }

  const resolver = modelResolverOverride || defaultModelResolver;

  for (const entry of activeChain) {
    // Check circuit breaker cooldown
    if (isEntryInCooldown(entry.provider, entry.model)) {
      continue;
    }

    // Resolve LanguageModel. If provider is unconfigured/key missing, skip silently.
    const model = resolver(entry, byok);
    if (!model) {
      continue;
    }

    // Helper to invoke generation once
    const callModelOnce = async (): Promise<T> => {
      const result = await generateText({
        model,
        output: Output.object({ schema }),
        system: systemPrompt,
        prompt,
        maxOutputTokens,
        abortSignal: AbortSignal.timeout(15000),
      });

      if (!result.output) {
        throw new Error("No structured output received from model");
      }
      return result.output as T;
    };

    try {
      const output = await callModelOnce();
      return {
        output,
        source: "ai",
        provider: entry.provider,
        model: entry.model,
      };
    } catch (initialErr) {
      const classification = categorizeError(initialErr);

      // Rule 2: 401/403 or 400 (unsupported) -> NO retry; log metadata only; 60s cooldown; next entry.
      if (classification.category === "fatal_entry") {
        logChainFatalError({
          tool: toolName,
          provider: entry.provider,
          model: entry.model,
          status: classification.status,
          reason: classification.reason,
        });
        setEntryCooldown(entry.provider, entry.model, 60000);
        continue;
      }

      // Rule 1: 429, timeout, 5xx, network -> backoff once, then retry once on same entry.
      if (classification.category === "transient") {
        if (backoffMs > 0) {
          await new Promise((r) => setTimeout(r, backoffMs));
        }
        try {
          const retryOutput = await callModelOnce();
          return {
            output: retryOutput,
            source: "ai",
            provider: entry.provider,
            model: entry.model,
          };
        } catch {
          // Retry failed; move to next entry in chain
          continue;
        }
      }

      // Rule 3: Output failing Zod -> retry once on same entry, then next.
      if (classification.category === "zod_failure") {
        try {
          const retryOutput = await callModelOnce();
          return {
            output: retryOutput,
            source: "ai",
            provider: entry.provider,
            model: entry.model,
          };
        } catch {
          // Schema retry failed; move to next entry in chain
          continue;
        }
      }

      // Any other unknown error -> move to next entry
      continue;
    }
  }

  // Rule 4: Chain exhausted -> deterministic template fallback
  return {
    output: fallbackGenerator(),
    source: "fallback",
  };
}

import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { MockLanguageModelV4 } from "ai/test";
import {
  executeWithChain,
  categorizeError,
  setEntryCooldown,
  isEntryInCooldown,
  clearAllCooldowns,
  defaultModelResolver,
} from "@/lib/ai/router";
import { isCompatConfigured, parseModelChain } from "@/lib/env";

const testSchema = z.object({
  greeting: z.string(),
  count: z.number(),
});

describe("AI Router & Chain Execution", () => {
  beforeEach(() => {
    clearAllCooldowns();
    vi.restoreAllMocks();
  });

  describe("Error Categorization", () => {
    it("classifies 429, timeout, 5xx, and network errors as transient", () => {
      expect(categorizeError(new Error("HTTP 429 Too Many Requests")).category).toBe("transient");
      expect(categorizeError(new Error("Request timed out")).category).toBe("transient");
      expect(categorizeError(new Error("500 Internal Server Error")).category).toBe("transient");
      expect(categorizeError(new Error("fetch failed: ECONNRESET")).category).toBe("transient");
    });

    it("classifies 401, 403, and 400 unsupported as fatal_entry", () => {
      expect(categorizeError(new Error("401 Unauthorized invalid api key")).category).toBe("fatal_entry");
      expect(categorizeError(new Error("403 Forbidden permission denied")).category).toBe("fatal_entry");
      expect(categorizeError(new Error("400 model not supported")).category).toBe("fatal_entry");
    });

    it("classifies validation errors as zod_failure", () => {
      expect(categorizeError(new Error("Type validation failed: invalid_type")).category).toBe("zod_failure");
    });
  });

  describe("Router Chain Rules & Fallback", () => {
    it("Rule 1: transient 429 error retries once with backoff before next entry", async () => {
      let callCount = 0;
      const transientModel = new MockLanguageModelV4({
        doGenerate: async () => {
          callCount++;
          if (callCount === 1) {
            throw new Error("HTTP 429 rate limit exceeded");
          }
          return {
            rawCall: { rawPrompt: null, rawSettings: {} },
            finishReason: { unified: "stop", raw: "stop" },
            usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
            content: [{ type: "text", text: JSON.stringify({ greeting: "Hello recovered!", count: 1 }) }],
            warnings: [],
          } as any;
        },
      });

      const result = await executeWithChain({
        toolName: "testTool",
        schema: testSchema,
        systemPrompt: "sys",
        prompt: "user",
        modelResolverOverride: () => transientModel,
        fallbackGenerator: () => ({ greeting: "fallback", count: 0 }),
        backoffMs: 10,
      });

      expect(callCount).toBe(2);
      expect(result.source).toBe("ai");
      expect(result.output).toEqual({ greeting: "Hello recovered!", count: 1 });
    });

    it("Rule 2: 401 error trips 60s cooldown without retrying same entry", async () => {
      let callCount = 0;
      const unauthorizedModel = new MockLanguageModelV4({
        doGenerate: async () => {
          callCount++;
          throw new Error("401 Unauthorized: Invalid API key");
        },
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await executeWithChain({
        toolName: "testTool",
        schema: testSchema,
        systemPrompt: "sys",
        prompt: "super secret user prompt that must not be logged",
        customChain: [{ provider: "groq", model: "openai/gpt-oss-20b" }],
        modelResolverOverride: () => unauthorizedModel,
        fallbackGenerator: () => ({ greeting: "fallback", count: 0 }),
      });

      // No retry on 401
      expect(callCount).toBe(1);
      // Cooldown set
      expect(isEntryInCooldown("groq", "openai/gpt-oss-20b")).toBe(true);
      // Fallback returned
      expect(result.source).toBe("fallback");

      // Verify sanitized logging: NEVER logs secret prompt
      const loggedText = consoleSpy.mock.calls.map((c) => c.join(" ")).join(" ");
      expect(loggedText).not.toContain("super secret user prompt");
      expect(loggedText).toContain("openai/gpt-oss-20b");
      expect(loggedText).toContain("401");
    });

    it("Rule 3: Zod validation failure retries once before failing to next entry", async () => {
      let callCount = 0;
      const invalidModel = new MockLanguageModelV4({
        doGenerate: async () => {
          callCount++;
          if (callCount === 1) {
            return {
              rawCall: { rawPrompt: null, rawSettings: {} },
              finishReason: { unified: "stop", raw: "stop" },
              usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
              // Missing required 'count' field
              content: [{ type: "text", text: JSON.stringify({ greeting: "Broken" }) }],
              warnings: [],
            } as any;
          }
          return {
            rawCall: { rawPrompt: null, rawSettings: {} },
            finishReason: { unified: "stop", raw: "stop" },
            usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
            content: [{ type: "text", text: JSON.stringify({ greeting: "Fixed", count: 42 }) }],
            warnings: [],
          } as any;
        },
      });

      const result = await executeWithChain({
        toolName: "testTool",
        schema: testSchema,
        systemPrompt: "sys",
        prompt: "user",
        modelResolverOverride: () => invalidModel,
        fallbackGenerator: () => ({ greeting: "fallback", count: 0 }),
      });

      expect(callCount).toBe(2);
      expect(result.source).toBe("ai");
      expect(result.output).toEqual({ greeting: "Fixed", count: 42 });
    });

    it("Chain exhausted falls gracefully to deterministic fallback", async () => {
      const failingModel = new MockLanguageModelV4({
        doGenerate: async () => {
          throw new Error("HTTP 500 upstream dead");
        },
      });

      const result = await executeWithChain({
        toolName: "testTool",
        schema: testSchema,
        systemPrompt: "sys",
        prompt: "user",
        customChain: [
          { provider: "groq", model: "model-1" },
          { provider: "google", model: "model-2" },
        ],
        modelResolverOverride: () => failingModel,
        fallbackGenerator: () => ({ greeting: "pure deterministic template", count: 999 }),
        backoffMs: 5,
      });

      expect(result.source).toBe("fallback");
      expect(result.output).toEqual({ greeting: "pure deterministic template", count: 999 });
    });
  });

  describe("Compatibility Provider Guard", () => {
    it("compat is strictly disabled unless COMPAT_BASE_URL, COMPAT_API_KEY, and COMPAT_LABEL are all present", () => {
      expect(isCompatConfigured({})).toBe(false);
      expect(
        isCompatConfigured({
          COMPAT_BASE_URL: "https://compat.example.com/v1",
        }),
      ).toBe(false);
      expect(
        isCompatConfigured({
          COMPAT_BASE_URL: "https://compat.example.com/v1",
          COMPAT_API_KEY: "secret",
        }),
      ).toBe(false);
      expect(
        isCompatConfigured({
          COMPAT_BASE_URL: "https://compat.example.com/v1",
          COMPAT_API_KEY: "secret",
          COMPAT_LABEL: "DeepSeek Provider",
        }),
      ).toBe(true);
      // HTTP without S is rejected
      expect(
        isCompatConfigured({
          COMPAT_BASE_URL: "http://insecure.example.com/v1",
          COMPAT_API_KEY: "secret",
          COMPAT_LABEL: "Insecure",
        }),
      ).toBe(false);
    });

    it("parseModelChain parses comma-separated chain entries correctly", () => {
      const parsed = parseModelChain("groq:openai/gpt-oss-20b,google:gemini-3.1-flash-lite,compat:deepseek-v3");
      expect(parsed).toEqual([
        { provider: "groq", model: "openai/gpt-oss-20b" },
        { provider: "google", model: "gemini-3.1-flash-lite" },
        { provider: "compat", model: "deepseek-v3" },
      ]);
    });
  });
});

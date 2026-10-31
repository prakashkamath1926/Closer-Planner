import { describe, it, expect } from "vitest";
import { extractByokFromHeaders } from "@/lib/ai/router";

describe("BYOK (Bring Your Own Key) security & extraction", () => {
  it("extracts valid groq BYOK configuration from headers", () => {
    const headers = new Headers({
      "x-byok-provider": "groq",
      "x-byok-key": "gsk_test_1234567890abcdef",
      "x-byok-model": "openai/gpt-oss-20b",
    });

    const byok = extractByokFromHeaders(headers);
    expect(byok).not.toBeNull();
    expect(byok?.provider).toBe("groq");
    expect(byok?.apiKey).toBe("gsk_test_1234567890abcdef");
    expect(byok?.model).toBe("openai/gpt-oss-20b");
  });

  it("extracts valid google BYOK configuration from headers", () => {
    const headers = new Headers({
      "x-byok-provider": "google",
      "x-byok-key": "AIzaSy_test_google_key_here",
      "x-byok-model": "gemini-3.1-flash-lite",
    });

    const byok = extractByokFromHeaders(headers);
    expect(byok).not.toBeNull();
    expect(byok?.provider).toBe("google");
    expect(byok?.apiKey).toBe("AIzaSy_test_google_key_here");
    expect(byok?.model).toBe("gemini-3.1-flash-lite");
  });

  it("rejects untrusted or custom providers (e.g. compat, arbitrary url, proxy)", () => {
    const headers = new Headers({
      "x-byok-provider": "compat",
      "x-byok-key": "some_arbitrary_key",
      "x-byok-model": "gpt-4o",
    });

    const byok = extractByokFromHeaders(headers);
    // Providers are strictly restricted to 'groq' and 'google' in BYOK
    expect(byok).toBeNull();
  });

  it("rejects empty or whitespace keys", () => {
    const headers = new Headers({
      "x-byok-provider": "groq",
      "x-byok-key": "   ",
    });

    const byok = extractByokFromHeaders(headers);
    expect(byok).toBeNull();
  });

  it("returns null when no BYOK headers are present", () => {
    const headers = new Headers();
    const byok = extractByokFromHeaders(headers);
    expect(byok).toBeNull();
  });
});

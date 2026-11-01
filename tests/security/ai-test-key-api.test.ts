import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return {
    ...mod,
    connection: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  createRateLimitResponse: vi.fn().mockImplementation((retryAfter) => {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }),
}));

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("@ai-sdk/groq", () => ({
  createGroq: vi.fn().mockReturnValue((model: string) => `mocked-groq-${model}`),
}));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: vi.fn().mockReturnValue((model: string) => `mocked-google-${model}`),
}));

import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { generateText } from "ai";
import { POST as testKeyRoute } from "@/app/api/ai/test-key/route";

describe("POST /api/ai/test-key Security Hardening", () => {
  const userId = "test-user-session-id";
  const dummyKey = "gsk_supersecretkey1234567890";

  beforeEach(() => {
    vi.clearAllMocks();
    (checkRateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: true,
      limit: 10,
      windowSeconds: 60,
    });
  });

  it("requires an active user session (returns HTTP 401 if unauthenticated)", async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error("Unauthorized") }),
      },
    });

    const req = new NextRequest("http://localhost:3000/api/ai/test-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "groq", apiKey: dummyKey }),
    });

    const res = await testKeyRoute(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/Authentication required/i);
  });

  it("enforces rate limit of 10 requests per 60 seconds", async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
      },
    });
    (checkRateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: false,
      limit: 10,
      windowSeconds: 60,
      retryAfterSeconds: 60,
    });

    const req = new NextRequest("http://localhost:3000/api/ai/test-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "groq", apiKey: dummyKey }),
    });

    const res = await testKeyRoute(req);
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith(`ai-test-key:${userId}`, 60, 10);
  });

  it("never echoes API key or raw error payload in failure response", async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
      },
    });

    (generateText as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error(`Failed with apiKey: ${dummyKey} at line 42`),
    );

    const req = new NextRequest("http://localhost:3000/api/ai/test-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "groq", apiKey: dummyKey }),
    });

    const res = await testKeyRoute(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error).not.toContain(dummyKey);
    expect(JSON.stringify(body)).not.toContain(dummyKey);
  });

  it("returns valid: true on successful test generation", async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
      },
    });

    (generateText as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ text: "ok" });

    const req = new NextRequest("http://localhost:3000/api/ai/test-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "groq", apiKey: dummyKey }),
    });

    const res = await testKeyRoute(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
  });
});

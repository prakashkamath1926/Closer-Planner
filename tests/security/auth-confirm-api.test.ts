import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return {
    ...mod,
    connection: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock Supabase server client
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

// Mock Supabase admin client
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

// Mock rate limiting
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  createRateLimitResponse: vi.fn().mockImplementation((retryAfter) => {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }),
}));

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { POST as confirmRoute } from "@/app/api/auth/confirm/route";

describe("POST /api/auth/confirm Security Hardening", () => {
  const userId = "usr-1111-2222-3333";
  const userEmail = "test@example.com";

  beforeEach(() => {
    vi.clearAllMocks();
    (checkRateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: true,
      limit: 10,
      windowSeconds: 60,
    });
  });

  it("rejects unauthenticated requests with HTTP 401", async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error("No session") }),
      },
    });

    const req = new NextRequest("http://localhost:3000/api/auth/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userEmail }),
    });

    const res = await confirmRoute(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toMatch(/Authentication required/i);
  });

  it("enforces rate limit (HTTP 429) when limit exceeded", async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId, email: userEmail } }, error: null }),
      },
    });
    (checkRateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: false,
      limit: 10,
      windowSeconds: 60,
      retryAfterSeconds: 45,
    });

    const req = new NextRequest("http://localhost:3000/api/auth/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userEmail }),
    });

    const res = await confirmRoute(req);
    expect(res.status).toBe(429);
  });

  it("rejects email mismatch with HTTP 403", async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: userId, email: "actual@example.com" } },
          error: null,
        }),
      },
    });

    const req = new NextRequest("http://localhost:3000/api/auth/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "victim@example.com" }),
    });

    const res = await confirmRoute(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/mismatch/i);
  });

  it("returns HTTP 400 on malformed JSON body", async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: userId, email: userEmail } },
          error: null,
        }),
      },
    });

    const req = new NextRequest("http://localhost:3000/api/auth/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ unclosed_json",
    });

    const res = await confirmRoute(req);
    expect(res.status).toBe(400);
  });

  it("confirms user email when session matches and email is unconfirmed", async () => {
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: userId, email: userEmail } },
          error: null,
        }),
      },
    });

    const mockUpdateUserById = vi.fn().mockResolvedValue({ data: {}, error: null });
    const mockGetUserById = vi.fn().mockResolvedValue({
      data: {
        user: { id: userId, email: userEmail, email_confirmed_at: null },
      },
      error: null,
    });

    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      auth: {
        admin: {
          getUserById: mockGetUserById,
          updateUserById: mockUpdateUserById,
        },
      },
    });

    const req = new NextRequest("http://localhost:3000/api/auth/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userEmail }),
    });

    const res = await confirmRoute(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.confirmed).toBe(true);
    expect(mockUpdateUserById).toHaveBeenCalledWith(userId, { email_confirm: true });
  });
});

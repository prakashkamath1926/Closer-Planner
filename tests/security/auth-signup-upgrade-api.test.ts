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

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
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

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { POST as signupRoute } from "@/app/api/auth/signup/route";
import { POST as upgradeRoute } from "@/app/api/auth/upgrade/route";

describe("POST /api/auth/signup Security Hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (checkRateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: true,
      limit: 10,
      windowSeconds: 60,
    });
  });

  it("enforces IP-based rate limiting (HTTP 429)", async () => {
    (checkRateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: false,
      limit: 10,
      windowSeconds: 60,
      retryAfterSeconds: 60,
    });

    const req = new NextRequest("http://localhost:3000/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.1" },
      body: JSON.stringify({ email: "user@example.com", password: "Password123!", fullName: "Alice" }),
    });

    const res = await signupRoute(req);
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith("signup-ip:198.51.100.1", 60, 10);
  });

  it("never returns raw provider error message on signup error", async () => {
    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: {
              message: "Database connection secret token leak in error string",
              status: 400,
            },
          }),
        },
      },
    });

    const req = new NextRequest("http://localhost:3000/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", password: "Password123!", fullName: "Alice" }),
    });

    const res = await signupRoute(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Unable to create account. Please try again.");
    expect(body.error).not.toMatch(/Database connection secret/i);
  });

  it("preserves 409 email_exists response when email already exists", async () => {
    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: {
              message: "User already registered",
              status: 422,
            },
          }),
        },
      },
    });

    const req = new NextRequest("http://localhost:3000/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "existing@example.com", password: "Password123!", fullName: "Alice" }),
    });

    const res = await signupRoute(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("email_exists");
  });
});

describe("POST /api/auth/upgrade Security Hardening", () => {
  const userId = "anon-user-123";

  beforeEach(() => {
    vi.clearAllMocks();
    (checkRateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: true,
      limit: 10,
      windowSeconds: 60,
    });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: userId, is_anonymous: true } },
          error: null,
        }),
      },
    });
  });

  it("enforces IP-based rate limiting (HTTP 429)", async () => {
    (checkRateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: false,
      limit: 10,
      windowSeconds: 60,
      retryAfterSeconds: 60,
    });

    const req = new NextRequest("http://localhost:3000/api/auth/upgrade", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.2" },
      body: JSON.stringify({ email: "upgrade@example.com", password: "Password123!", fullName: "Bob" }),
    });

    const res = await upgradeRoute(req);
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith("upgrade-ip:198.51.100.2", 60, 10);
  });

  it("does NOT treat HTTP 500 error as email conflict; returns generic 500", async () => {
    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      auth: {
        admin: {
          updateUserById: vi.fn().mockResolvedValue({
            data: { user: null },
            error: {
              message: "Database connection timeout while updating user",
              status: 500,
            },
          }),
        },
      },
    });

    const req = new NextRequest("http://localhost:3000/api/auth/upgrade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "upgrade@example.com", password: "Password123!", fullName: "Bob" }),
    });

    const res = await upgradeRoute(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to upgrade account. Please try again.");
    expect(body.code).toBeUndefined(); // NOT mapped to email_exists!
  });

  it("maps status 422 to 409 email_exists", async () => {
    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      auth: {
        admin: {
          updateUserById: vi.fn().mockResolvedValue({
            data: { user: null },
            error: {
              message: "A user with this email address has already been registered",
              status: 422,
            },
          }),
        },
      },
    });

    const req = new NextRequest("http://localhost:3000/api/auth/upgrade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "taken@example.com", password: "Password123!", fullName: "Bob" }),
    });

    const res = await upgradeRoute(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("email_exists");
  });
});

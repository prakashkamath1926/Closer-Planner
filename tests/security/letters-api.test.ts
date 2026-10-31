import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as contributeRoute } from "@/app/api/letters/contribute/[token]/route";
import { GET as recipientRoute } from "@/app/api/recipient/[token]/route";
import { generateRawShareToken } from "@/lib/engine/shield";

// Mock Supabase admin & server clients
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";

describe("Letters from Loved Ones API & Token Separation", () => {
  const occasionId = "11111111-1111-1111-1111-111111111111";
  const contributeToken = generateRawShareToken();
  const viewToken = generateRawShareToken();

  beforeEach(() => {
    vi.clearAllMocks();
    (checkRateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: true,
      limit: 30,
      windowSeconds: 60,
    });
  });

  it("token kind separation: contribute token cannot access recipient route (returns 404)", async () => {
    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === "share_links") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn((col: string, val: string) => {
              if (col === "kind" && val === "view") {
                // If checking for kind === 'view', a contribute link will NOT match
                return {
                  is: vi.fn().mockReturnThis(),
                  gt: vi.fn().mockReturnThis(),
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                };
              }
              return {
                eq: vi.fn().mockReturnThis(),
                is: vi.fn().mockReturnThis(),
                gt: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              };
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    };
    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockAdmin);

    const req = new NextRequest(`http://localhost:3000/api/recipient/${contributeToken}`);
    const res = await recipientRoute(req, {
      params: Promise.resolve({ token: contributeToken }),
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toEqual({ error: "Not found" });
  });

  it("token kind separation: view token cannot be used to submit letters on contribute route (returns 404)", async () => {
    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === "share_links") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn((col: string, val: string) => {
              if (col === "kind" && val === "contribute") {
                // If checking for kind === 'contribute', a view link will NOT match
                return {
                  is: vi.fn().mockReturnThis(),
                  gt: vi.fn().mockReturnThis(),
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                };
              }
              return {
                eq: vi.fn().mockReturnThis(),
                is: vi.fn().mockReturnThis(),
                gt: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              };
            }),
          };
        }
        return {};
      }),
    };
    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockAdmin);

    const req = new NextRequest(`http://localhost:3000/api/letters/contribute/${viewToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Alice",
        body: "Have the most wonderful birthday!",
      }),
    });

    const res = await contributeRoute(req, {
      params: Promise.resolve({ token: viewToken }),
    });

    expect(res.status).toBe(404);
  });

  it("honeypot rejection: silently rejects bots with filled honeypot", async () => {
    const req = new NextRequest(`http://localhost:3000/api/letters/contribute/${contributeToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Bot",
        body: "Check out our cheap pills",
        honeypot: "https://spam.com",
      }),
    });

    const res = await contributeRoute(req, {
      params: Promise.resolve({ token: contributeToken }),
    });

    expect(res.status).toBe(400);
  });

  it("body length validation: rejects letter with > 600 characters", async () => {
    const longLetter = "A".repeat(601);
    const req = new NextRequest(`http://localhost:3000/api/letters/contribute/${contributeToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Friend",
        body: longLetter,
      }),
    });

    const res = await contributeRoute(req, {
      params: Promise.resolve({ token: contributeToken }),
    });

    expect(res.status).toBe(400);
  });

  it("rate limiting: returns 429 and Retry-After header when rate limit is exceeded", async () => {
    (checkRateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: false,
      limit: 20,
      windowSeconds: 60,
      retryAfterSeconds: 45,
    });

    const req = new NextRequest(`http://localhost:3000/api/letters/contribute/${contributeToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Friend",
        body: "Happy birthday!",
      }),
    });

    const res = await contributeRoute(req, {
      params: Promise.resolve({ token: contributeToken }),
    });

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("45");
  });

  it("inert HTML/script storage: letters with tags are saved as inert plain text strings", async () => {
    let insertedRow: unknown = null;
    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === "share_links") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "link-1",
                occasion_id: occasionId,
                kind: "contribute",
                expires_at: new Date(Date.now() + 86400000).toISOString(),
                revoked_at: null,
              },
              error: null,
            }),
          };
        }
        if (table === "letters") {
          return {
            insert: vi.fn((row: unknown) => {
              insertedRow = row;
              return Promise.resolve({ error: null });
            }),
          };
        }
        return {};
      }),
    };
    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockAdmin);

    const maliciousScript = "<script>alert('xss')</script>";
    const req = new NextRequest(`http://localhost:3000/api/letters/contribute/${contributeToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "<img src=x onerror=alert(1)>",
        body: maliciousScript,
      }),
    });

    const res = await contributeRoute(req, {
      params: Promise.resolve({ token: contributeToken }),
    });

    expect(res.status).toBe(201);
    expect(insertedRow).toEqual({
      occasion_id: occasionId,
      contributor_name: "<img src=x onerror=alert(1)>",
      body: maliciousScript,
      status: "pending",
    });
  });
});

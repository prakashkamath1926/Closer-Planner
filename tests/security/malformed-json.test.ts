import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "test-user-uuid" } },
        error: null,
      }),
    },
  }),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, limit: 10, windowSeconds: 60 }),
  createRateLimitResponse: vi.fn(),
}));

import { POST as intakeRoute } from "@/app/api/intake/route";
import { POST as changesApplyRoute } from "@/app/api/changes/apply/route";
import { POST as vendorQuoteRoute } from "@/app/api/vendors/quote/route";
import { PATCH as planItemPatchRoute } from "@/app/api/plan/items/[id]/route";
import { PUT as recipientViewPutRoute } from "@/app/api/recipient-view/route";

describe("Malformed JSON Request Handling (returns HTTP 400, never 500)", () => {
  const malformedJsonString = '{"unclosed_json": "missing_bracket"';

  it("POST /api/intake returns HTTP 400 on malformed JSON body", async () => {
    const req = new NextRequest("http://localhost:3000/api/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: malformedJsonString,
    });

    const res = await intakeRoute(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/json/i);
  });

  it("POST /api/changes/apply returns HTTP 400 on malformed JSON body", async () => {
    const req = new NextRequest("http://localhost:3000/api/changes/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: malformedJsonString,
    });

    const res = await changesApplyRoute(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/json/i);
  });

  it("POST /api/vendors/quote returns HTTP 400 on malformed JSON body", async () => {
    const req = new NextRequest("http://localhost:3000/api/vendors/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: malformedJsonString,
    });

    const res = await vendorQuoteRoute(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/json/i);
  });

  it("PATCH /api/plan/items/[id] returns HTTP 400 on malformed JSON body", async () => {
    const req = new NextRequest("http://localhost:3000/api/plan/items/item-123", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: malformedJsonString,
    });

    const res = await planItemPatchRoute(req, {
      params: Promise.resolve({ id: "item-123" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/json/i);
  });

  it("PUT /api/recipient-view returns HTTP 400 on malformed JSON body", async () => {
    const req = new NextRequest("http://localhost:3000/api/recipient-view", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: malformedJsonString,
    });

    const res = await recipientViewPutRoute(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/json/i);
  });
});

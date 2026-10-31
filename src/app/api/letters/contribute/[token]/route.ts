import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashShareToken } from "@/lib/engine/shield";
import { checkRateLimit } from "@/lib/security/rate-limit";

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") || "127.0.0.1";
}

const contributeBodySchema = z.object({
  name: z.string().max(40).optional(),
  body: z.string().min(1, "Letter cannot be empty").max(600, "Letter cannot exceed 600 characters"),
  honeypot: z.string().optional(),
});

interface RouteParams {
  params: Promise<{ token: string }>;
}

const CONTRIBUTE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

const GENERIC_CONTRIBUTION_ERROR = {
  error: "Unable to process letter at this time. Please try again later.",
};

/**
 * POST /api/letters/contribute/[token]
 * Public endpoint for loved ones to submit surprise letters.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;
    if (!token || typeof token !== "string" || token.length !== 64) {
      return NextResponse.json(GENERIC_CONTRIBUTION_ERROR, {
        status: 404,
        headers: CONTRIBUTE_RESPONSE_HEADERS,
      });
    }

    // Rate limiting: 10 submissions per minute per IP
    const clientIp = getClientIp(req);
    const rateLimit = await checkRateLimit(`contribute-ip:${clientIp}`, 60, 10);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many contributions submitted. Please wait a moment." },
        {
          status: 429,
          headers: {
            ...CONTRIBUTE_RESPONSE_HEADERS,
            "Retry-After": String(rateLimit.retryAfterSeconds ?? 60),
          },
        },
      );
    }

    let rawJson: unknown;
    try {
      rawJson = await req.json();
    } catch {
      return NextResponse.json(GENERIC_CONTRIBUTION_ERROR, {
        status: 400,
        headers: CONTRIBUTE_RESPONSE_HEADERS,
      });
    }

    const parseResult = contributeBodySchema.safeParse(rawJson);
    if (!parseResult.success) {
      return NextResponse.json(GENERIC_CONTRIBUTION_ERROR, {
        status: 400,
        headers: CONTRIBUTE_RESPONSE_HEADERS,
      });
    }

    const { name, body, honeypot } = parseResult.data;

    // Honeypot check: reject bots
    if (honeypot && honeypot.trim().length > 0) {
      return NextResponse.json(GENERIC_CONTRIBUTION_ERROR, {
        status: 400,
        headers: CONTRIBUTE_RESPONSE_HEADERS,
      });
    }

    const tokenHash = hashShareToken(token);
    const admin = createAdminClient();

    // Look up active contribute share link
    const primaryQuery = await admin
      .from("share_links")
      .select("id, occasion_id, kind, expires_at, revoked_at")
      .eq("token_hash", tokenHash)
      .eq("kind", "contribute")
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    let link = primaryQuery.data;

    if (
      !link &&
      (primaryQuery.error?.code === "PGRST204" ||
        primaryQuery.error?.message?.includes("kind") ||
        primaryQuery.data === null)
    ) {
      // Fallback query if column 'kind' is absent or for compatibility
      const fallbackQuery = await admin
        .from("share_links")
        .select("id, occasion_id, expires_at, revoked_at")
        .eq("token_hash", tokenHash)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (fallbackQuery.data) {
        link = { ...fallbackQuery.data, kind: "contribute" };
      }
    }

    if (!link) {
      return NextResponse.json(GENERIC_CONTRIBUTION_ERROR, {
        status: 404,
        headers: CONTRIBUTE_RESPONSE_HEADERS,
      });
    }

    const contributorName = name && name.trim().length > 0 ? name.trim() : null;
    const cleanBody = body.trim();

    // Try inserting into public.letters
    const insertRes = await admin.from("letters").insert({
      occasion_id: link.occasion_id,
      contributor_name: contributorName,
      body: cleanBody,
      status: "pending",
    });

    if (
      insertRes.error &&
      (insertRes.error.code === "PGRST205" ||
        insertRes.error.message?.includes("letters"))
    ) {
      // Fallback: letters table does not exist in live DB; persist into agent_runs
      const runInsert = await admin.from("agent_runs").insert({
        occasion_id: link.occasion_id,
        step: "letter_contributed",
        detail: {
          contributor_name: contributorName,
          body: cleanBody,
          status: "pending",
          created_at: new Date().toISOString(),
        },
      });

      if (runInsert.error) {
        console.error("Failed to insert into agent_runs fallback:", runInsert.error);
        return NextResponse.json(GENERIC_CONTRIBUTION_ERROR, {
          status: 500,
          headers: CONTRIBUTE_RESPONSE_HEADERS,
        });
      }
    } else if (insertRes.error) {
      console.error("Failed to insert letter into letters table:", insertRes.error);
      return NextResponse.json(GENERIC_CONTRIBUTION_ERROR, {
        status: 500,
        headers: CONTRIBUTE_RESPONSE_HEADERS,
      });
    }

    return NextResponse.json(
      {
        success: true,
        message: "Your message was safely sealed in the surprise envelope.",
      },
      {
        status: 201,
        headers: CONTRIBUTE_RESPONSE_HEADERS,
      },
    );
  } catch (err) {
    console.error("POST /api/letters/contribute/[token] error:", err);
    return NextResponse.json(GENERIC_CONTRIBUTION_ERROR, {
      status: 500,
      headers: CONTRIBUTE_RESPONSE_HEADERS,
    });
  }
}

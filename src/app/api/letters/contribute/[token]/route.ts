import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashShareToken, isValidTokenFormat } from "@/lib/engine/shield";
import { checkRateLimit } from "@/lib/security/rate-limit";

interface RouteParams {
  params: Promise<{ token: string }>;
}

export const CONTRIBUTE_RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
} as const;

export const GENERIC_CONTRIBUTION_ERROR = {
  error: "Unable to process letter contribution",
} as const;

const contributeBodySchema = z.object({
  name: z
    .string()
    .trim()
    .max(40, "Name must be 40 characters or fewer")
    .optional()
    .or(z.literal("")),
  body: z
    .string()
    .trim()
    .min(1, "Letter cannot be empty")
    .max(600, "Letter must be 600 characters or fewer"),
  honeypot: z.string().optional(),
});

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "127.0.0.1";
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;

    if (!isValidTokenFormat(token)) {
      return NextResponse.json(GENERIC_CONTRIBUTION_ERROR, {
        status: 404,
        headers: CONTRIBUTE_RESPONSE_HEADERS,
      });
    }

    // Rate limiting by IP + token
    const clientIp = getClientIp(req);
    const ipLimit = await checkRateLimit(`contribute-ip:${clientIp}`, 60, 20);
    const tokenLimit = await checkRateLimit(`contribute-token:${token.slice(0, 16)}`, 60, 30);

    if (!ipLimit.allowed || !tokenLimit.allowed) {
      const retryAfter = Math.max(
        ipLimit.retryAfterSeconds ?? 60,
        tokenLimit.retryAfterSeconds ?? 60,
      );
      return NextResponse.json(
        { error: "Too Many Requests" },
        {
          status: 429,
          headers: {
            ...CONTRIBUTE_RESPONSE_HEADERS,
            "Retry-After": String(retryAfter),
          },
        },
      );
    }

    // Parse json body
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

    // Honeypot check: reject bots silently or with generic failure
    if (honeypot && honeypot.trim().length > 0) {
      return NextResponse.json(GENERIC_CONTRIBUTION_ERROR, {
        status: 400,
        headers: CONTRIBUTE_RESPONSE_HEADERS,
      });
    }

    const tokenHash = hashShareToken(token);
    const admin = createAdminClient();

    // Look up active contribute share link
    const { data: link, error: linkError } = await admin
      .from("share_links")
      .select("id, occasion_id, kind, expires_at, revoked_at")
      .eq("token_hash", tokenHash)
      .eq("kind", "contribute")
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (linkError || !link) {
      return NextResponse.json(GENERIC_CONTRIBUTION_ERROR, {
        status: 404,
        headers: CONTRIBUTE_RESPONSE_HEADERS,
      });
    }

    // Insert letter as pending via service role client (no public direct insert policy)
    const { error: insertError } = await admin.from("letters").insert({
      occasion_id: link.occasion_id,
      contributor_name: name && name.trim().length > 0 ? name.trim() : null,
      body: body.trim(),
      status: "pending",
    });

    if (insertError) {
      return NextResponse.json(GENERIC_CONTRIBUTION_ERROR, {
        status: 500,
        headers: CONTRIBUTE_RESPONSE_HEADERS,
      });
    }

    return NextResponse.json(
      { success: true, message: "Thank you for sharing your letter." },
      {
        status: 201,
        headers: CONTRIBUTE_RESPONSE_HEADERS,
      },
    );
  } catch {
    return NextResponse.json(GENERIC_CONTRIBUTION_ERROR, {
      status: 500,
      headers: CONTRIBUTE_RESPONSE_HEADERS,
    });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  hashShareToken,
  isValidTokenFormat,
  buildRecipientPayload,
  GENERIC_NOT_FOUND_RESPONSE,
  type RecipientLetterItem,
} from "@/lib/engine/shield";
import { checkRateLimit } from "@/lib/security/rate-limit";

interface RouteParams {
  params: Promise<{ token: string }>;
}

export const RECIPIENT_RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
} as const;

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "127.0.0.1";
}

/**
 * GET /api/recipient/[token]
 *
 * Rules:
 * - HARD RULE 19: Returns ONLY allowlisted fields from recipient_view.
 *   Never spreads database rows or leaks plan items, budget, vendors, or notes.
 * - HARD RULE 21: Every failure (invalid token, expired, revoked, unpublished, error)
 *   returns the EXACT identical generic 404 response.
 * - Server-side reveal (prd.md 6.11): before reveal_at, returns only show_countdown and
 *   reveal_at with neutral cover state, never headline or message.
 * - Security headers: Cache-Control: no-store and Referrer-Policy: no-referrer.
 * - Rate limiting: IP-based rate limiting on public token queries via rate_limit_hit.
 * - Uses service_role client strictly for authorized public recipient lookups.
 * - Supports organizer "preview as recipient" when token === "preview" and owner is authenticated.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;

    // Reject malformed token shapes early with identical 404
    if (!isValidTokenFormat(token)) {
      return NextResponse.json(GENERIC_NOT_FOUND_RESPONSE, {
        status: 404,
        headers: RECIPIENT_RESPONSE_HEADERS,
      });
    }

    // -------------------------------------------------------------------------
    // Organizer "preview as recipient" mode
    // -------------------------------------------------------------------------
    if (token === "preview") {
      const occasionId = req.nextUrl.searchParams.get("occasionId");
      if (!occasionId) {
        return NextResponse.json(GENERIC_NOT_FOUND_RESPONSE, {
          status: 404,
          headers: RECIPIENT_RESPONSE_HEADERS,
        });
      }

      // Check owner authentication via user server client
      const supabaseUser = await createClient();
      const {
        data: { user },
      } = await supabaseUser.auth.getUser();

      if (!user) {
        return NextResponse.json(GENERIC_NOT_FOUND_RESPONSE, {
          status: 404,
          headers: RECIPIENT_RESPONSE_HEADERS,
        });
      }

      // Verify occasion ownership
      const { data: occasion } = await supabaseUser
        .from("occasions")
        .select("id")
        .eq("id", occasionId)
        .eq("owner_id", user.id)
        .maybeSingle();

      if (!occasion) {
        return NextResponse.json(GENERIC_NOT_FOUND_RESPONSE, {
          status: 404,
          headers: RECIPIENT_RESPONSE_HEADERS,
        });
      }

      // Load recipient_view for this occasion (preview shows revealed draft even if unpublished)
      const { data: recipientView } = await supabaseUser
        .from("recipient_view")
        .select("*")
        .eq("occasion_id", occasionId)
        .maybeSingle();

      // Load approved letters for preview safely
      let letters: RecipientLetterItem[] = [];
      try {
        const lettersRes = await supabaseUser
          .from("letters")
          ?.select?.("id, contributor_name, body, status, occasion_id")
          ?.eq?.("occasion_id", occasionId)
          ?.eq?.("status", "approved");
        if (lettersRes?.data && lettersRes.data.length > 0) {
          letters = lettersRes.data;
        } else {
          // Fallback to agent_runs
          const runsRes = await supabaseUser
            .from("agent_runs")
            .select("id, occasion_id, detail")
            .eq("occasion_id", occasionId)
            .eq("step", "letter_contributed");
          letters = (runsRes.data || [])
            .filter((r) => (r.detail as Record<string, unknown>)?.status === "approved")
            .map((r) => ({
              id: r.id,
              occasion_id: r.occasion_id,
              contributor_name: ((r.detail as Record<string, unknown>)?.contributor_name as string) || null,
              body: ((r.detail as Record<string, unknown>)?.body as string) || "",
              status: "approved" as const,
            }));
        }
      } catch {
        letters = [];
      }

      const payload = buildRecipientPayload(recipientView || {}, {
        isPreview: true,
        letters,
        occasionId,
      });
      return NextResponse.json(payload, {
        status: 200,
        headers: RECIPIENT_RESPONSE_HEADERS,
      });
    }

    // -------------------------------------------------------------------------
    // Public recipient access via token hash
    // -------------------------------------------------------------------------
    // IP Rate limit on public recipient queries
    const clientIp = getClientIp(req);
    const rateLimit = await checkRateLimit(`recipient-ip:${clientIp}`, 60, 30);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests" },
        {
          status: 429,
          headers: {
            ...RECIPIENT_RESPONSE_HEADERS,
            "Retry-After": String(rateLimit.retryAfterSeconds ?? 60),
          },
        },
      );
    }

    const tokenHash = hashShareToken(token);
    const admin = createAdminClient();

    // 1. Look up active recipient link
    const { data: link, error: linkError } = await admin
      .from("share_links")
      .select("occasion_id, role, expires_at, revoked_at, kind")
      .eq("token_hash", tokenHash)
      .eq("role", "recipient")
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (linkError || !link || (link.kind && link.kind !== "view")) {
      return NextResponse.json(GENERIC_NOT_FOUND_RESPONSE, {
        status: 404,
        headers: RECIPIENT_RESPONSE_HEADERS,
      });
    }

    // 2. Load recipient_view strictly where published = true
    const { data: viewRow, error: viewError } = await admin
      .from("recipient_view")
      .select("*")
      .eq("occasion_id", link.occasion_id)
      .eq("published", true)
      .maybeSingle();

    if (viewError || !viewRow) {
      // Unpublished or non-existent view returns the same generic 404
      return NextResponse.json(GENERIC_NOT_FOUND_RESPONSE, {
        status: 404,
        headers: RECIPIENT_RESPONSE_HEADERS,
      });
    }

    // Load approved letters for this occasion safely
    let letters: RecipientLetterItem[] = [];
    try {
      const lettersRes = await admin
        .from("letters")
        ?.select?.("id, contributor_name, body, status, occasion_id")
        ?.eq?.("occasion_id", link.occasion_id)
        ?.eq?.("status", "approved");
      if (lettersRes?.data && lettersRes.data.length > 0) {
        letters = lettersRes.data;
      } else {
        // Fallback to agent_runs
        const runsRes = await admin
          .from("agent_runs")
          .select("id, occasion_id, detail")
          .eq("occasion_id", link.occasion_id)
          .eq("step", "letter_contributed");
        letters = (runsRes.data || [])
          .filter((r) => (r.detail as Record<string, unknown>)?.status === "approved")
          .map((r) => ({
            id: r.id,
            occasion_id: r.occasion_id,
            contributor_name: ((r.detail as Record<string, unknown>)?.contributor_name as string) || null,
            body: ((r.detail as Record<string, unknown>)?.body as string) || "",
            status: "approved" as const,
          }));
      }
    } catch {
      letters = [];
    }

    // 3. Build strictly allowlisted response (enforces reveal_at on server)
    const payload = buildRecipientPayload(viewRow, {
      isPreview: false,
      letters,
      occasionId: link.occasion_id,
    });

    return NextResponse.json(payload, {
      status: 200,
      headers: RECIPIENT_RESPONSE_HEADERS,
    });
  } catch {
    // Failures return the exact same generic 404 (Rule 21)
    return NextResponse.json(GENERIC_NOT_FOUND_RESPONSE, {
      status: 404,
      headers: RECIPIENT_RESPONSE_HEADERS,
    });
  }
}

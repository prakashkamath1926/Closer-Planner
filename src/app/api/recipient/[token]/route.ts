import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  hashShareToken,
  isValidTokenFormat,
  buildRecipientPayload,
  GENERIC_NOT_FOUND_RESPONSE,
} from "@/lib/engine/shield";

interface RouteParams {
  params: Promise<{ token: string }>;
}

/**
 * GET /api/recipient/[token]
 *
 * Rules:
 * - HARD RULE 19: Returns ONLY the allowlisted fields from recipient_view
 *   ({ headline, message, reveal_at, show_countdown }).
 * - Never spreads database rows or leaks plan items, budget, vendors, or notes.
 * - HARD RULE 21: Every failure (invalid token, expired, revoked, unpublished, error)
 *   returns the EXACT identical generic 404 response.
 * - Uses service_role client strictly for authorized public recipient lookups.
 * - Supports organizer "preview as recipient" when token === "preview" and owner is authenticated.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;

    // Reject malformed token shapes early
    if (!isValidTokenFormat(token)) {
      return NextResponse.json(GENERIC_NOT_FOUND_RESPONSE, { status: 404 });
    }

    // -------------------------------------------------------------------------
    // Organizer "preview as recipient" mode
    // -------------------------------------------------------------------------
    if (token === "preview") {
      const occasionId = req.nextUrl.searchParams.get("occasionId");
      if (!occasionId) {
        return NextResponse.json(GENERIC_NOT_FOUND_RESPONSE, { status: 404 });
      }

      // Check owner authentication via user server client
      const supabaseUser = await createClient();
      const {
        data: { user },
      } = await supabaseUser.auth.getUser();

      if (!user) {
        return NextResponse.json(GENERIC_NOT_FOUND_RESPONSE, { status: 404 });
      }

      // Verify occasion ownership
      const { data: occasion } = await supabaseUser
        .from("occasions")
        .select("id")
        .eq("id", occasionId)
        .eq("owner_id", user.id)
        .maybeSingle();

      if (!occasion) {
        return NextResponse.json(GENERIC_NOT_FOUND_RESPONSE, { status: 404 });
      }

      // Load recipient_view for this occasion (preview shows current draft even if unpublished)
      const { data: recipientView } = await supabaseUser
        .from("recipient_view")
        .select("*")
        .eq("occasion_id", occasionId)
        .maybeSingle();

      const payload = buildRecipientPayload(recipientView || {});
      return NextResponse.json(payload, { status: 200 });
    }

    // -------------------------------------------------------------------------
    // Public recipient access via token hash
    // -------------------------------------------------------------------------
    const tokenHash = hashShareToken(token);
    const admin = createAdminClient();

    // 1. Look up active recipient link
    const { data: link, error: linkError } = await admin
      .from("share_links")
      .select("occasion_id, role, expires_at, revoked_at")
      .eq("token_hash", tokenHash)
      .eq("role", "recipient")
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (linkError || !link) {
      return NextResponse.json(GENERIC_NOT_FOUND_RESPONSE, { status: 404 });
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
      return NextResponse.json(GENERIC_NOT_FOUND_RESPONSE, { status: 404 });
    }

    // 3. Build strictly allowlisted response via shield engine (never spreads DB row)
    const payload = buildRecipientPayload(viewRow);

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        // Prevent aggressive caching of the recipient view
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch {
    // Failures return the exact same generic 404 (Rule 21)
    return NextResponse.json(GENERIC_NOT_FOUND_RESPONSE, { status: 404 });
  }
}


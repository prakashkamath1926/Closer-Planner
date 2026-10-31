import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { Json } from "@/lib/supabase/database.types";
import { checkRateLimit, createRateLimitResponse } from "@/lib/security/rate-limit";
import { parseQuote } from "@/lib/ai/orchestrator";
import { extractByokFromHeaders } from "@/lib/ai/router";

const parseQuoteRequestSchema = z.object({
  vendorId: z.string().uuid(),
  occasionId: z.string().uuid(),
  category: z.string().min(1).max(80),
  pastedText: z.string().min(1).max(10000),
  currency: z.string().default("INR"),
});

/**
 * POST /api/vendors/quote: Parses an untrusted pasted quote from an external vendor.
 *
 * Rules:
 * - Rate limited via rate_limit_hit.
 * - Wraps pasted text inside <user_data> delimiters.
 * - Extracts quoted fields (price, included, extra_fees, cancellation_terms, missing, etc.).
 * - HARD RULE: Status is NEVER changed automatically from parsed quote text.
 * - Values are recorded as QUOTED, never "verified".
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Rate limiting: 10 AI requests per minute
    const rateLimit = await checkRateLimit(`ai:${user.id}`, 60, 10);
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit.retryAfterSeconds ?? 60);
    }

    const body = await req.json();
    const parsed = parseQuoteRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid quote parse request", details: parsed.error.format() },
        { status: 400 },
      );
    }

    const { vendorId, occasionId, category, pastedText, currency } = parsed.data;

    // Verify vendor ownership under RLS
    const { data: vendor, error: vendorError } = await supabase
      .from("vendors")
      .select("id, status")
      .eq("id", vendorId)
      .eq("occasion_id", occasionId)
      .maybeSingle();

    if (vendorError || !vendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    const byok = extractByokFromHeaders(req.headers);
    // Run AI parseQuote with strict prompt injection defenses
    const parseResult = await parseQuote(pastedText, category, currency, { byok });

    // Update vendor quote fields in database without altering vendor status
    const { error: updateError } = await supabase
      .from("vendors")
      .update({
        quote_amount:
          parseResult.quoteFields.price !== null
            ? String(parseResult.quoteFields.price)
            : null,
        quote_notes: pastedText,
        quote_fields: parseResult.quoteFields as unknown as Json,
        // Notice: status is intentionally preserved; NEVER advance automatically
      })
      .eq("id", vendorId)
      .eq("occasion_id", occasionId);

    if (updateError) {
      return NextResponse.json({ error: "Failed to save parsed quote" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      quoteFields: parseResult.quoteFields,
      source: parseResult.source,
      vendorStatus: vendor.status, // Confirms status remained unchanged
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

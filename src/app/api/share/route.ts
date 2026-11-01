import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateRawShareToken, hashShareToken } from "@/lib/engine/shield";
import { parseJsonBody } from "@/lib/security/request";

const createShareSchema = z.object({
  occasionId: z.string().uuid(),
  role: z.enum(["recipient", "friend"]).default("recipient"),
  expiresInDays: z.number().int().min(1).max(365).default(30),
});

const revokeShareSchema = z.object({
  occasionId: z.string().uuid(),
  shareLinkId: z.string().uuid().optional(),
  rawToken: z.string().optional(),
}).refine((data) => Boolean(data.shareLinkId || data.rawToken), {
  message: "Either shareLinkId or rawToken must be provided to revoke",
});

/**
 * POST /api/share: Creates a secure, expiring, revocable share link.
 * HARD RULE 21: Stored only as sha256(token). The raw token is returned once to the owner.
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

    const jsonResult = await parseJsonBody(req);
    if (!jsonResult.success) {
      return jsonResult.response;
    }

    const parsed = createShareSchema.safeParse(jsonResult.data);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid share link parameters", details: parsed.error.format() },
        { status: 400 },
      );
    }

    const { occasionId, role, expiresInDays } = parsed.data;

    // Verify occasion ownership under RLS
    const { data: occasion, error: occError } = await supabase
      .from("occasions")
      .select("id")
      .eq("id", occasionId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (occError || !occasion) {
      return NextResponse.json(
        { error: "Occasion not found or access denied" },
        { status: 403 },
      );
    }

    // Generate random 32-byte cryptographic token
    const rawToken = generateRawShareToken();
    const tokenHash = hashShareToken(rawToken);
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 3600 * 1000).toISOString();

    const { error: insertError } = await supabase.from("share_links").insert({
      occasion_id: occasionId,
      role,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to create share link" },
        { status: 500 },
      );
    }

    // Raw token is returned ONCE to the owner and NEVER stored in the database
    return NextResponse.json(
      {
        rawToken,
        role,
        expiresAt,
        sharePath: `/r/${rawToken}`,
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/share: Revokes an active share link.
 */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const jsonResult = await parseJsonBody(req);
    if (!jsonResult.success) {
      return jsonResult.response;
    }

    const parsed = revokeShareSchema.safeParse(jsonResult.data);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid parameters", details: parsed.error.format() },
        { status: 400 },
      );
    }

    const { occasionId, shareLinkId, rawToken } = parsed.data;

    // Verify ownership
    const { data: occasion } = await supabase
      .from("occasions")
      .select("id")
      .eq("id", occasionId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!occasion) {
      return NextResponse.json({ error: "Occasion not found" }, { status: 403 });
    }

    let query = supabase
      .from("share_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("occasion_id", occasionId)
      .is("revoked_at", null);

    if (shareLinkId) {
      query = query.eq("id", shareLinkId);
    } else if (rawToken) {
      query = query.eq("token_hash", hashShareToken(rawToken));
    }

    const { error: updateError } = await query;
    if (updateError) {
      return NextResponse.json({ error: "Failed to revoke share link" }, { status: 500 });
    }

    return NextResponse.json({ success: true, revoked: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET /api/share?occasionId=...: Lists share links for an occasion (owner only).
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const occasionId = req.nextUrl.searchParams.get("occasionId");
    if (!occasionId) {
      return NextResponse.json({ error: "occasionId is required" }, { status: 400 });
    }

    const { data: links, error } = await supabase
      .from("share_links")
      .select("id, role, expires_at, revoked_at, created_at")
      .eq("occasion_id", occasionId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "Failed to fetch share links" }, { status: 500 });
    }

    return NextResponse.json({ links });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


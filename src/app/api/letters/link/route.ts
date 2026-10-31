import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateRawShareToken, hashShareToken } from "@/lib/engine/shield";

const createContributeLinkSchema = z.object({
  occasionId: z.string().uuid(),
  expiresInDays: z.number().int().min(1).max(365).default(30),
});

const revokeContributeLinkSchema = z.object({
  occasionId: z.string().uuid(),
  shareLinkId: z.string().uuid().optional(),
});

/**
 * POST /api/letters/link
 * Organizer-only: creates a contribute share link (kind: 'contribute').
 * The raw token is returned ONCE to the organizer.
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

    const body = await req.json();
    const parsed = createContributeLinkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid parameters", details: parsed.error.format() },
        { status: 400 },
      );
    }

    const { occasionId, expiresInDays } = parsed.data;

    // Verify occasion ownership
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

    const rawToken = generateRawShareToken();
    const tokenHash = hashShareToken(rawToken);
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 3600 * 1000).toISOString();

    const { data: newLink, error: insertError } = await supabase
      .from("share_links")
      .insert({
        occasion_id: occasionId,
        role: "friend",
        kind: "contribute",
        token_hash: tokenHash,
        expires_at: expiresAt,
      })
      .select("id, created_at, expires_at")
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to create contribute link" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        id: newLink.id,
        rawToken,
        sharePath: `/contribute/${rawToken}`,
        expiresAt,
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET /api/letters/link?occasionId=...
 * Organizer-only: lists active contribute share links for the occasion.
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
      return NextResponse.json({ error: "occasionId required" }, { status: 400 });
    }

    const { data: links, error: listError } = await supabase
      .from("share_links")
      .select("id, kind, expires_at, revoked_at, created_at")
      .eq("occasion_id", occasionId)
      .eq("kind", "contribute")
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    if (listError) {
      return NextResponse.json(
        { error: "Failed to list contribute links" },
        { status: 500 },
      );
    }

    return NextResponse.json({ links: links || [] }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/letters/link
 * Organizer-only: revokes a contribute share link.
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

    const body = await req.json();
    const parsed = revokeContributeLinkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const { occasionId, shareLinkId } = parsed.data;

    const query = supabase
      .from("share_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("occasion_id", occasionId)
      .eq("kind", "contribute")
      .is("revoked_at", null);

    if (shareLinkId) {
      query.eq("id", shareLinkId);
    }

    const { error: revokeError } = await query;
    if (revokeError) {
      return NextResponse.json(
        { error: "Failed to revoke contribute link" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

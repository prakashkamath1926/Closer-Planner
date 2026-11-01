import { NextRequest, NextResponse, connection } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateRawShareToken, hashShareToken } from "@/lib/engine/shield";
import { parseJsonBody } from "@/lib/security/request";

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
  await connection();
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

    const parsed = createContributeLinkSchema.safeParse(jsonResult.data);
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

    let newLink: { id: string; created_at: string; expires_at: string } | null = null;
    let insertError: unknown = null;

    // Attempt insert with kind: 'contribute'
    const primaryInsert = await supabase
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

    if (
      primaryInsert.error &&
      (primaryInsert.error.code === "PGRST204" ||
        primaryInsert.error.message?.includes("kind"))
    ) {
      // Column 'kind' not yet in remote DB schema cache: fallback to standard share_link with role 'friend'
      const fallbackInsert = await supabase
        .from("share_links")
        .insert({
          occasion_id: occasionId,
          role: "friend",
          token_hash: tokenHash,
          expires_at: expiresAt,
        })
        .select("id, created_at, expires_at")
        .single();

      if (fallbackInsert.data) {
        newLink = fallbackInsert.data;
        // Record contribute link association in agent_runs
        await supabase.from("agent_runs").insert({
          occasion_id: occasionId,
          step: "contribute_link_created",
          detail: {
            share_link_id: fallbackInsert.data.id,
            token_hash: tokenHash,
          },
        });
      } else {
        insertError = fallbackInsert.error;
      }
    } else if (primaryInsert.error) {
      insertError = primaryInsert.error;
    } else {
      newLink = primaryInsert.data;
    }

    if (insertError || !newLink) {
      console.error("Failed to insert share link:", insertError);
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
  } catch (err) {
    console.error("POST /api/letters/link exception:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET /api/letters/link?occasionId=...
 * Organizer-only: lists active contribute share links for the occasion.
 */
export async function GET(req: NextRequest) {
  await connection();
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

    const listRes = await supabase
      .from("share_links")
      .select("id, expires_at, revoked_at, created_at")
      .eq("occasion_id", occasionId)
      .eq("kind", "contribute")
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    let links = listRes.data;

    if (
      listRes.error &&
      (listRes.error.code === "PGRST204" || listRes.error.message?.includes("kind"))
    ) {
      // Query friend links mapped to contribute_link_created
      const runsRes = await supabase
        .from("agent_runs")
        .select("detail")
        .eq("occasion_id", occasionId)
        .eq("step", "contribute_link_created");

      const contributeLinkIds = new Set(
        (runsRes.data || [])
          .map((r) => (r.detail as Record<string, unknown>)?.share_link_id)
          .filter(Boolean),
      );

      const allFriendLinks = await supabase
        .from("share_links")
        .select("id, expires_at, revoked_at, created_at")
        .eq("occasion_id", occasionId)
        .eq("role", "friend")
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });

      links = (allFriendLinks.data || []).filter((l) => contributeLinkIds.has(l.id));
    } else if (listRes.error) {
      return NextResponse.json(
        { error: "Failed to list contribute links" },
        { status: 500 },
      );
    }

    return NextResponse.json({ links: links || [] }, { status: 200 });
  } catch (err) {
    console.error("GET /api/letters/link exception:", err);
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

    const jsonResult = await parseJsonBody(req);
    if (!jsonResult.success) {
      return jsonResult.response;
    }

    const parsed = revokeContributeLinkSchema.safeParse(jsonResult.data);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const { occasionId, shareLinkId } = parsed.data;

    const query = supabase
      .from("share_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("occasion_id", occasionId)
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
  } catch (err) {
    console.error("DELETE /api/letters/link exception:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

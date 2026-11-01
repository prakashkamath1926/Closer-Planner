import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateNextParam } from "@/lib/auth/redirect";

/**
 * GET /auth/callback
 * PKCE code exchange for OAuth (Google) and email link verifications.
 * Validates the `next` redirect target to prevent open redirects.
 * If `claim` param is provided (from Save Plan with Google), assigns
 * occasion ownership to the newly authenticated user.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextParam = requestUrl.searchParams.get("next");
  const claimOccasionId = requestUrl.searchParams.get("claim");
  const destination = validateNextParam(nextParam, "/");

  if (code) {
    const supabase = await createClient();

    // Check pre-exchange session to identify anonymous user claiming an occasion
    let anonId: string | null = null;
    if (claimOccasionId) {
      const { data: preAuthData } = await supabase.auth.getUser();
      if (preAuthData?.user && preAuthData.user.is_anonymous) {
        anonId = preAuthData.user.id;
      }
    }

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      let claimFailed = false;
      if (claimOccasionId) {
        if (!data?.user || !anonId) {
          claimFailed = true;
        } else {
          const isUuid =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              claimOccasionId,
            );
          if (isUuid) {
            try {
              const admin = createAdminClient();
              const updateRes = await admin
                .from("occasions")
                .update({ owner_id: data.user.id })
                .eq("id", claimOccasionId)
                .eq("owner_id", anonId)
                .select("id");
              if (!updateRes?.data || updateRes.data.length === 0 || updateRes.error) {
                claimFailed = true;
              }
            } catch (claimErr) {
              console.error("Failed to claim occasion for user:", claimErr);
              claimFailed = true;
            }
          } else {
            claimFailed = true;
          }
        }
      }
      const redirectUrl = new URL(destination, request.url);
      if (claimFailed) {
        redirectUrl.searchParams.set("notice", "claim_failed");
      }
      return NextResponse.redirect(redirectUrl);
    }
    console.error("Auth callback code exchange error:", error);
  }

  // Redirect to login if code exchange fails or code is missing
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("error", "Authentication could not be completed. Please try again.");
  return NextResponse.redirect(loginUrl);
}


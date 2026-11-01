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
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (claimOccasionId && data?.user) {
        const isUuid =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            claimOccasionId,
          );
        if (isUuid) {
          try {
            const admin = createAdminClient();
            await admin
              .from("occasions")
              .update({ owner_id: data.user.id })
              .eq("id", claimOccasionId);
          } catch (claimErr) {
            console.error("Failed to claim occasion for user:", claimErr);
          }
        }
      }
      return NextResponse.redirect(new URL(destination, request.url));
    }
    console.error("Auth callback code exchange error:", error);
  }

  // Redirect to login if code exchange fails or code is missing
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("error", "Authentication could not be completed. Please try again.");
  return NextResponse.redirect(loginUrl);
}


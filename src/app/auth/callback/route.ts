import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateNextParam } from "@/lib/auth/redirect";

/**
 * GET /auth/callback
 * PKCE code exchange for OAuth (Google) and email link verifications.
 * Validates the `next` redirect target to prevent open redirects.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextParam = requestUrl.searchParams.get("next");
  const destination = validateNextParam(nextParam, "/");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(destination, request.url));
    }
    console.error("Auth callback code exchange error:", error);
  }

  // Redirect to login if code exchange fails or code is missing
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("error", "Authentication could not be completed. Please try again.");
  return NextResponse.redirect(loginUrl);
}


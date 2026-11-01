import { NextRequest, NextResponse, connection } from "next/server";
import { signupSchema } from "@/lib/auth/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, createRateLimitResponse } from "@/lib/security/rate-limit";
import { parseJsonBody, getClientIp } from "@/lib/security/request";

export async function POST(req: NextRequest) {
  await connection();
  try {
    const clientIp = getClientIp(req);
    const rateLimit = await checkRateLimit(`signup-ip:${clientIp}`, 60, 10);
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit.retryAfterSeconds ?? 60);
    }

    const jsonResult = await parseJsonBody(req);
    if (!jsonResult.success) {
      return jsonResult.response;
    }

    const parsed = signupSchema.safeParse(jsonResult.data);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 },
      );
    }

    const { email, password, fullName } = parsed.data;
    const admin = createAdminClient();

    // Create user with email pre-confirmed so no email delivery failure blocks sign-in
    const { data: newUser, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
      },
    });

    if (createError) {
      if (
        createError.message?.toLowerCase().includes("already registered") ||
        createError.message?.toLowerCase().includes("already exists") ||
        createError.code === "email_exists" ||
        createError.status === 422
      ) {
        return NextResponse.json(
          {
            error: "An account with this email already exists. Please sign in instead.",
            code: "email_exists",
          },
          { status: 409 },
        );
      }

      console.error("Signup error:", createError);
      return NextResponse.json(
        { error: "Unable to create account. Please try again." },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, userId: newUser.user?.id });
  } catch (err) {
    console.error("POST /api/auth/signup error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

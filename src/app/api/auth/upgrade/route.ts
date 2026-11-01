import { NextRequest, NextResponse, connection } from "next/server";
import { signupSchema } from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, createRateLimitResponse } from "@/lib/security/rate-limit";
import { parseJsonBody, getClientIp } from "@/lib/security/request";

export async function POST(req: NextRequest) {
  await connection();
  try {
    const clientIp = getClientIp(req);
    const rateLimit = await checkRateLimit(`upgrade-ip:${clientIp}`, 60, 10);
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit.retryAfterSeconds ?? 60);
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "No active session found. Please refresh." },
        { status: 401 },
      );
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

    // Upgrade the existing anonymous user by ID:
    // preserves auth.uid(), sets email and password, and marks email_confirm = true
    const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(
      user.id,
      {
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
        },
      },
    );

    if (updateError) {
      console.error("Upgrade error:", updateError);
      const isEmailConflict =
        updateError.status === 422 ||
        updateError.code === "email_exists" ||
        updateError.message?.toLowerCase().includes("already registered") ||
        updateError.message?.toLowerCase().includes("already exists");

      if (isEmailConflict) {
        return NextResponse.json(
          {
            error: "An account with this email already exists. Please sign in to access your plans.",
            code: "email_exists",
          },
          { status: 409 },
        );
      }

      return NextResponse.json(
        { error: "Failed to upgrade account. Please try again." },
        { status: 500 },
      );
    }

    // Verify user ID stayed identical
    if (updated.user && updated.user.id !== user.id) {
      console.error("Critical error: User ID mismatch during upgrade!", {
        before: user.id,
        after: updated.user.id,
      });
    }

    return NextResponse.json({
      success: true,
      userId: user.id,
      email: updated.user?.email,
    });
  } catch (err) {
    console.error("POST /api/auth/upgrade error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

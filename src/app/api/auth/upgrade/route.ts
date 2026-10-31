import { NextRequest, NextResponse, connection } from "next/server";
import { signupSchema } from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  await connection();
  try {
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

    const body = await req.json();
    const parsed = signupSchema.safeParse(body);
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
        updateError.message?.toLowerCase().includes("already registered") ||
        updateError.message?.toLowerCase().includes("already exists") ||
        updateError.message?.toLowerCase().includes("updating user") ||
        updateError.status === 422 ||
        updateError.status === 500;

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
        { error: updateError.message || "Failed to upgrade account." },
        { status: 400 },
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


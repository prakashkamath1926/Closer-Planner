import { NextRequest, NextResponse, connection } from "next/server";
import { signupSchema } from "@/lib/auth/validation";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  await connection();
  try {
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
      // If user already exists (e.g. from earlier failed signup), update and confirm it
      if (
        createError.message?.toLowerCase().includes("already registered") ||
        createError.message?.toLowerCase().includes("already exists") ||
        createError.status === 422
      ) {
        // List users to find the existing unconfirmed account
        const { data: list } = await admin.auth.admin.listUsers();
        const existing = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
        if (existing) {
          await admin.auth.admin.updateUserById(existing.id, {
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName },
          });
          return NextResponse.json({ success: true, autoConfirmed: true });
        }
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

import { NextRequest, NextResponse, connection } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const confirmSchema = z.object({
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  await connection();
  try {
    const body = await req.json();
    const parsed = confirmSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const { email } = parsed.data;
    const admin = createAdminClient();

    const { data: list } = await admin.auth.admin.listUsers();
    const user = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());

    if (user && !user.email_confirmed_at) {
      await admin.auth.admin.updateUserById(user.id, {
        email_confirm: true,
      });
      return NextResponse.json({ success: true, confirmed: true });
    }

    return NextResponse.json({ success: true, alreadyConfirmed: true });
  } catch (err) {
    console.error("POST /api/auth/confirm error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

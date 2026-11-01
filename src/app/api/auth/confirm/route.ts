import { NextRequest, NextResponse, connection } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, createRateLimitResponse } from "@/lib/security/rate-limit";
import { parseJsonBody } from "@/lib/security/request";

const confirmSchema = z.object({
  email: z.string().email(),
});

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

    const rateLimit = await checkRateLimit(`confirm:${user.id}`, 60, 10);
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit.retryAfterSeconds ?? 60);
    }

    const jsonResult = await parseJsonBody(req);
    if (!jsonResult.success) {
      return jsonResult.response;
    }

    const parsed = confirmSchema.safeParse(jsonResult.data);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const { email } = parsed.data;

    // Verify requested email matches session user email
    if (!user.email || user.email.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json({ error: "Email mismatch" }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: adminUser, error: getUserError } = await admin.auth.admin.getUserById(user.id);

    if (getUserError || !adminUser?.user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!adminUser.user.email_confirmed_at) {
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

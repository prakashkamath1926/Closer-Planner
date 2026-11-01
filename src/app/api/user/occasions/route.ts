import { NextResponse, connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ occasions: [], isAuthenticated: false });
    }

    const { data: occasions, error: occError } = await supabase
      .from("occasions")
      .select("id, title, occasion_type, recipient_name, event_at, status, updated_at")
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false });

    if (occError) {
      console.error("GET /api/user/occasions error:", occError);
      return NextResponse.json({ occasions: [], isAuthenticated: true });
    }

    return NextResponse.json({ occasions: occasions || [], isAuthenticated: true });
  } catch (err) {
    console.error("GET /api/user/occasions exception:", err);
    return NextResponse.json({ occasions: [], isAuthenticated: false });
  }
}


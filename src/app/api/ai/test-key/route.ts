import { NextRequest, NextResponse, connection } from "next/server";
import { z } from "zod";
import { generateText } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, createRateLimitResponse } from "@/lib/security/rate-limit";
import { parseJsonBody } from "@/lib/security/request";

const testKeySchema = z.object({
  provider: z.enum(["groq", "google"]),
  apiKey: z.string().min(1).max(500),
  model: z.string().optional(),
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

    const rateLimit = await checkRateLimit(`ai-test-key:${user.id}`, 60, 10);
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit.retryAfterSeconds ?? 60);
    }

    const jsonResult = await parseJsonBody(req);
    if (!jsonResult.success) {
      return jsonResult.response;
    }

    const parsed = testKeySchema.safeParse(jsonResult.data);
    if (!parsed.success) {
      return NextResponse.json(
        { valid: false, error: "Invalid provider or empty API key." },
        { status: 400 },
      );
    }

    const { provider, apiKey, model } = parsed.data;

    if (provider === "groq") {
      const groq = createGroq({ apiKey });
      const targetModel = model || "openai/gpt-oss-20b";
      await generateText({
        model: groq(targetModel),
        prompt: "test",
        maxOutputTokens: 1,
        abortSignal: AbortSignal.timeout(8000),
      });
      return NextResponse.json({ valid: true });
    }

    if (provider === "google") {
      const google = createGoogleGenerativeAI({ apiKey });
      const targetModel = model || "gemini-3.1-flash-lite";
      await generateText({
        model: google(targetModel),
        prompt: "test",
        maxOutputTokens: 1,
        abortSignal: AbortSignal.timeout(8000),
      });
      return NextResponse.json({ valid: true });
    }

    return NextResponse.json(
      { valid: false, error: "Unsupported provider." },
      { status: 400 },
    );
  } catch (err: unknown) {
    const errObj = err as { message?: string; status?: number; statusCode?: number };
    const msg = (errObj?.message || "").toLowerCase();
    const status = errObj?.status || errObj?.statusCode;

    // Redacted sanitized error: NEVER includes the user's API key or raw provider payload
    if (status === 401 || msg.includes("401") || msg.includes("unauthorized") || msg.includes("invalid api key")) {
      return NextResponse.json(
        { valid: false, error: "Invalid API key. Please check your credentials and try again." },
        { status: 200 },
      );
    }

    if (status === 429 || msg.includes("429") || msg.includes("quota")) {
      return NextResponse.json(
        { valid: false, error: "Rate limit or quota reached on this key." },
        { status: 200 },
      );
    }

    return NextResponse.json(
      { valid: false, error: "Could not connect to provider with this key. Please check the key and model." },
      { status: 200 },
    );
  }
}

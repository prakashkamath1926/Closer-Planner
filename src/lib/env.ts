/**
 * Zod-validated environment variables.
 *
 * Public vars (NEXT_PUBLIC_*) are safe to import anywhere.
 * Server-only vars are protected by the "server-only" package in admin.ts.
 *
 * If a required variable is missing at RUNTIME, the relevant client or route
 * throws a descriptive error — never a silent undefined or fallback.
 *
 * At BUILD TIME (typecheck, lint, next build without .env.local), Next.js
 * replaces NEXT_PUBLIC_ vars with their literal values; server-only vars are
 * not evaluated on the client. We use lazy initialization so missing vars at
 * build time do not throw before any request is made.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Public schema — safe to validate in any context
// ---------------------------------------------------------------------------
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string({ error: "NEXT_PUBLIC_SUPABASE_URL is required" })
    .url({ error: "NEXT_PUBLIC_SUPABASE_URL must be a valid URL" }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string({ error: "NEXT_PUBLIC_SUPABASE_ANON_KEY is required" })
    .min(1, { error: "NEXT_PUBLIC_SUPABASE_ANON_KEY must not be empty" }),
});

export type PublicEnv = z.infer<typeof publicSchema>;

// ---------------------------------------------------------------------------
// Server-only schema
// ---------------------------------------------------------------------------
export type SupportedProvider = "groq" | "google" | "compat";

export interface ChainEntry {
  provider: SupportedProvider;
  model: string;
}

export const DEFAULT_AI_MODEL_CHAIN =
  "groq:openai/gpt-oss-20b,groq:openai/gpt-oss-120b,google:gemini-3.1-flash-lite";

export function parseModelChain(chainStr: string): ChainEntry[] {
  if (!chainStr || typeof chainStr !== "string") return [];
  const entries: ChainEntry[] = [];
  const parts = chainStr.split(",").map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const colonIdx = part.indexOf(":");
    if (colonIdx === -1) continue;
    const provider = part.slice(0, colonIdx).toLowerCase().trim();
    const model = part.slice(colonIdx + 1).trim();
    if ((provider === "groq" || provider === "google" || provider === "compat") && model) {
      entries.push({ provider, model });
    }
  }
  return entries;
}

export function isCompatConfigured(env: {
  COMPAT_BASE_URL?: string;
  COMPAT_API_KEY?: string;
  COMPAT_LABEL?: string;
  XKIRO_API_KEY?: string;
}): boolean {
  if (env.XKIRO_API_KEY && env.XKIRO_API_KEY.length > 0) {
    return true;
  }
  return Boolean(
    env.COMPAT_BASE_URL &&
    env.COMPAT_BASE_URL.startsWith("https://") &&
    env.COMPAT_API_KEY &&
    env.COMPAT_LABEL
  );
}

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z
    .string({ error: "SUPABASE_SERVICE_ROLE_KEY is required" })
    .min(1, { error: "SUPABASE_SERVICE_ROLE_KEY must not be empty" }),
  GOOGLE_GENERATIVE_AI_API_KEY: z
    .string()
    .optional(),
  GROQ_API_KEY: z
    .string()
    .optional(),
  COMPAT_BASE_URL: z
    .string()
    .url({ error: "COMPAT_BASE_URL must be a valid URL" })
    .refine((url) => url.startsWith("https://"), { message: "COMPAT_BASE_URL must use HTTPS" })
    .optional(),
  COMPAT_API_KEY: z.string().min(1).optional(),
  COMPAT_LABEL: z.string().min(1).optional(),
  AI_MODEL_CHAIN: z
    .string()
    .min(1)
    .default(DEFAULT_AI_MODEL_CHAIN)
    .refine(
      (val) => parseModelChain(val).length > 0,
      { message: "AI_MODEL_CHAIN must contain at least one valid provider:model entry" }
    ),
  APP_BASE_URL: z
    .string()
    .url({ error: "APP_BASE_URL must be a valid URL" })
    .default("http://localhost:3000"),
}).refine(
  (data) => Boolean(data.GOOGLE_GENERATIVE_AI_API_KEY || data.GROQ_API_KEY || isCompatConfigured(data)),
  { message: "Either GOOGLE_GENERATIVE_AI_API_KEY, GROQ_API_KEY, or complete COMPAT provider must be configured" }
);

export type ServerEnv = z.infer<typeof serverSchema>;

// ---------------------------------------------------------------------------
// AI-only schema — reads strictly provider credentials and model chain.
// Does NOT require Supabase or other unrelated infrastructure variables.
// ---------------------------------------------------------------------------
export const DEFAULT_AI_MODEL = "openai/gpt-oss-20b";

const aiEnvSchema = z
  .object({
    GROQ_API_KEY: z.string().min(1, { message: "GROQ_API_KEY must not be empty" }).optional(),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1, { message: "GOOGLE_GENERATIVE_AI_API_KEY must not be empty" }).optional(),
    COMPAT_BASE_URL: z
      .string()
      .url({ message: "COMPAT_BASE_URL must be a valid URL" })
      .refine((url) => url.startsWith("https://"), { message: "COMPAT_BASE_URL must use HTTPS" })
      .optional(),
    COMPAT_API_KEY: z.string().min(1).optional(),
    COMPAT_LABEL: z.string().min(1).optional(),
    XKIRO_API_KEY: z.string().min(1).optional(),
    AI_MODEL_CHAIN: z
      .string()
      .min(1)
      .default(DEFAULT_AI_MODEL_CHAIN)
      .refine(
        (val) => parseModelChain(val).length > 0,
        { message: "AI_MODEL_CHAIN must contain at least one valid provider:model entry" }
      ),
    AI_MODEL: z.string().min(1).default(DEFAULT_AI_MODEL),
  })
  .refine(
    (data) => Boolean(data.GROQ_API_KEY || data.GOOGLE_GENERATIVE_AI_API_KEY || isCompatConfigured(data)),
    { message: "Either GROQ_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or complete COMPAT provider must be configured in .env.local" }
  );

export type AiEnv = z.infer<typeof aiEnvSchema>;

/**
 * Returns Zod-validated AI environment variables.
 * Safe to call from AI modules without requiring Supabase or other database variables.
 */
export function getAiEnv(): AiEnv {
  const result = aiEnvSchema.safeParse({
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    COMPAT_BASE_URL: process.env.COMPAT_BASE_URL,
    COMPAT_API_KEY: process.env.COMPAT_API_KEY,
    COMPAT_LABEL: process.env.COMPAT_LABEL,
    XKIRO_API_KEY: process.env.XKIRO_API_KEY,
    AI_MODEL_CHAIN: process.env.AI_MODEL_CHAIN || DEFAULT_AI_MODEL_CHAIN,
    AI_MODEL: process.env.AI_MODEL || DEFAULT_AI_MODEL,
  });

  if (!result.success) {
    const msgs = result.error.issues.map((i) => `  • ${i.message}`).join("\n");
    throw new Error(`Missing or invalid AI environment variables:\n${msgs}`);
  }

  return result.data;
}

// ---------------------------------------------------------------------------
// Public env — lazily parsed so missing vars throw on the FIRST REQUEST that
// needs them, not at module load time (which would break the build).
// ---------------------------------------------------------------------------
let _publicEnv: PublicEnv | undefined;

/**
 * Public environment variables — validated lazily.
 * Safe to call in Client Components and Server Components alike.
 *
 * Throws a descriptive error if required variables are missing or malformed.
 */
export function getPublicEnv(): PublicEnv {
  if (_publicEnv) return _publicEnv;

  const result = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!result.success) {
    const msgs = result.error.issues.map((i) => `  • ${i.message}`).join("\n");
    throw new Error(`Missing or invalid public environment variables:\n${msgs}`);
  }
  _publicEnv = result.data;
  return _publicEnv;
}

// ---------------------------------------------------------------------------
// Server-only env — parsed on demand, called only from admin.ts (server-only)
// ---------------------------------------------------------------------------

/**
 * Parses and returns server-only environment variables.
 * Called exclusively from src/lib/supabase/admin.ts (which imports
 * "server-only"), so this value never reaches the client bundle.
 *
 * Throws a descriptive error if any variable is missing.
 */
export function parseServerEnv(): ServerEnv {
  const result = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    APP_BASE_URL: process.env.APP_BASE_URL,
  });
  if (!result.success) {
    const msgs = result.error.issues.map((i) => `  • ${i.message}`).join("\n");
    throw new Error(
      `Missing or invalid server-only environment variables:\n${msgs}`,
    );
  }
  return result.data;
}

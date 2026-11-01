import { NextRequest, NextResponse } from "next/server";

export type JsonParseResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; response: NextResponse };

/**
 * Extracts client IP address from standard proxy headers (x-forwarded-for, x-real-ip)
 * or defaults to localhost.
 */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "127.0.0.1";
}

/**
 * Safely parses JSON from incoming request body.
 * If JSON parsing fails due to syntax errors, returns a standard HTTP 400 response
 * instead of letting an uncaught SyntaxError return an HTTP 500 response.
 */
export async function parseJsonBody<T = unknown>(req: NextRequest): Promise<JsonParseResult<T>> {
  try {
    const data = await req.json();
    return { success: true, data };
  } catch {
    return {
      success: false,
      response: NextResponse.json(
        { error: "Invalid JSON in request body", code: "malformed_json" },
        { status: 400 },
      ),
    };
  }
}

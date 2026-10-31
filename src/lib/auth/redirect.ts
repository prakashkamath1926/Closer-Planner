/**
 * Open Redirect Prevention Validator.
 *
 * Ensures redirect destinations (e.g. `next` parameter in login/signup/callback)
 * are strictly same-origin relative paths.
 * Rejects:
 * - Protocol-relative URLs: `//evil.com`
 * - Absolute URLs with schemes: `https://evil.com`, `http://evil.com`, `javascript:...`
 * - Backslash trickery: `/\evil.com`, `\\evil.com`
 * - Whitespace / control-character escapes
 */
export function validateNextParam(
  nextParam: string | null | undefined,
  fallback: string = "/",
): string {
  if (!nextParam || typeof nextParam !== "string") {
    return fallback;
  }

  const trimmed = nextParam.trim();
  if (!trimmed) {
    return fallback;
  }

  // Must start with a single forward slash, not followed by another slash or backslash
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return fallback;
  }

  // Reject any backslashes anywhere in path (browser normalization bypass)
  if (trimmed.includes("\\")) {
    return fallback;
  }

  // Reject schemes, protocols, or data URLs
  if (trimmed.includes("://") || trimmed.toLowerCase().includes("javascript:") || trimmed.toLowerCase().includes("data:")) {
    return fallback;
  }

  return trimmed;
}


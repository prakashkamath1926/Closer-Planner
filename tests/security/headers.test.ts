import { describe, it, expect } from "vitest";
import nextConfig from "../../next.config";

describe("Security Headers Configuration (next.config.ts)", () => {
  it("defines comprehensive security headers for all routes with recipient overrides", async () => {
    if (!nextConfig.headers) {
      throw new Error("nextConfig.headers is undefined");
    }

    const headerConfigs = await nextConfig.headers();

    const globalConfig = headerConfigs.find((c) => c.source === "/:path*");
    expect(globalConfig).toBeDefined();

    const getHeader = (source: string, name: string) => {
      const config = headerConfigs.find((c) => c.source === source);
      return config?.headers.find((h) => h.key.toLowerCase() === name.toLowerCase())?.value;
    };

    // 1. X-Frame-Options
    expect(getHeader("/:path*", "X-Frame-Options")).toBe("DENY");

    // 2. X-Content-Type-Options
    expect(getHeader("/:path*", "X-Content-Type-Options")).toBe("nosniff");

    // 3. Referrer-Policy
    expect(getHeader("/:path*", "Referrer-Policy")).toBe("strict-origin-when-cross-origin");

    // 4. Permissions-Policy
    expect(getHeader("/:path*", "Permissions-Policy")).toBe(
      "camera=(), geolocation=(), microphone=(self)"
    );

    // 5. Strict-Transport-Security
    const hsts = getHeader("/:path*", "Strict-Transport-Security");
    expect(hsts).toBe("max-age=63072000; includeSubDomains");
    expect(hsts).not.toContain("preload");

    // 6. CSP (either Content-Security-Policy or Content-Security-Policy-Report-Only)
    const csp =
      getHeader("/:path*", "Content-Security-Policy") ||
      getHeader("/:path*", "Content-Security-Policy-Report-Only");
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("img-src 'self' data: blob:");
    expect(csp).toContain("media-src 'self' data: blob:");
    expect(csp).toContain("font-src 'self' data:");
    expect(csp).toContain("connect-src 'self' https://*.supabase.co wss://*.supabase.co");
    expect(csp).not.toContain("groq.com");
    expect(csp).not.toContain("generativelanguage.googleapis.com");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("object-src 'none'");

    // 7. Recipient overrides preserved
    expect(getHeader("/r/:path*", "Referrer-Policy")).toBe("no-referrer");
    expect(getHeader("/r/:path*", "Cache-Control")).toBe("no-store");
    expect(getHeader("/api/recipient/:path*", "Referrer-Policy")).toBe("no-referrer");
    expect(getHeader("/api/recipient/:path*", "Cache-Control")).toBe("no-store");
  });
});

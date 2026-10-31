import { describe, it, expect } from "vitest";
import { validateNextParam } from "@/lib/auth/redirect";

describe("validateNextParam: Open Redirect Prevention", () => {
  it("allows valid same-origin relative paths", () => {
    expect(validateNextParam("/dashboard")).toBe("/dashboard");
    expect(validateNextParam("/plan/bf678730-cc57?tab=vendors")).toBe("/plan/bf678730-cc57?tab=vendors");
    expect(validateNextParam("/")).toBe("/");
  });

  it("rejects protocol-relative URLs (//evil.com)", () => {
    expect(validateNextParam("//evil.com")).toBe("/");
    expect(validateNextParam("//attacker.org/phish")).toBe("/");
  });

  it("rejects absolute URLs (https://evil.com, http://evil.com)", () => {
    expect(validateNextParam("https://evil.com")).toBe("/");
    expect(validateNextParam("http://evil.com/login")).toBe("/");
    expect(validateNextParam("https://attacker.com?next=/dashboard")).toBe("/");
  });

  it("rejects backslash bypasses (/\\evil.com, \\evil.com)", () => {
    expect(validateNextParam("/\\evil.com")).toBe("/");
    expect(validateNextParam("\\\\evil.com")).toBe("/");
    expect(validateNextParam("/plan/\\evil.com")).toBe("/");
  });

  it("rejects javascript: and data: schemes", () => {
    expect(validateNextParam("javascript:alert(document.cookie)")).toBe("/");
    expect(validateNextParam("/javascript:alert(1)")).toBe("/");
    expect(validateNextParam("data:text/html,<script>alert(1)</script>")).toBe("/");
  });

  it("falls back safely for null, undefined, and empty string", () => {
    expect(validateNextParam(null)).toBe("/");
    expect(validateNextParam(undefined)).toBe("/");
    expect(validateNextParam("")).toBe("/");
    expect(validateNextParam("   ")).toBe("/");
    expect(validateNextParam(null, "/plan/default")).toBe("/plan/default");
  });
});


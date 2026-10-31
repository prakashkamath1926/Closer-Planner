import { describe, it, expect } from "vitest";
import {
  loginSchema,
  signupSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  upgradeSchema,
} from "@/lib/auth/validation";

describe("Auth Zod Validation Schemas", () => {
  it("enforces minimum 10 characters password on login", () => {
    expect(loginSchema.safeParse({ email: "user@example.com", password: "short" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "user@example.com", password: "123456789" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "user@example.com", password: "1234567890" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "invalid-email", password: "securepassword123" }).success).toBe(false);
  });

  it("validates signup schema with name, email and 10+ char password", () => {
    const valid = signupSchema.safeParse({
      fullName: "Kavya Patel",
      email: "kavya@example.com",
      password: "strongpassword2026",
    });
    expect(valid.success).toBe(true);

    const emptyName = signupSchema.safeParse({
      fullName: "",
      email: "kavya@example.com",
      password: "strongpassword2026",
    });
    expect(emptyName.success).toBe(false);
  });

  it("validates forgot-password email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "valid@example.com" }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });

  it("validates reset password and matching confirmation", () => {
    const matching = resetPasswordSchema.safeParse({
      password: "brandnewsecurepass",
      confirmPassword: "brandnewsecurepass",
    });
    expect(matching.success).toBe(true);

    const mismatched = resetPasswordSchema.safeParse({
      password: "brandnewsecurepass",
      confirmPassword: "differentpassword",
    });
    expect(mismatched.success).toBe(false);
  });

  it("validates upgrade schema", () => {
    const valid = upgradeSchema.safeParse({
      email: "upgraded@example.com",
      password: "upgradepassword10",
      fullName: "Organizer Name",
    });
    expect(valid.success).toBe(true);
  });
});


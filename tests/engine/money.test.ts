import { describe, it, expect } from "vitest";
import {
  toMinorUnits,
  fromMinorUnits,
  toDbNumeric,
  fromDbNumeric,
  addMoney,
  subtractMoney,
  formatMoney,
} from "../../src/lib/engine/money";

describe("engine/money: integer minor unit calculations", () => {
  it("converts major units to minor units without float precision errors", () => {
    expect(toMinorUnits(800000)).toBe(80000000); // 8 lakh INR = 80,000,000 paise
    expect(toMinorUnits("800000")).toBe(80000000);
    expect(toMinorUnits("800000.50")).toBe(80000050);
    expect(toMinorUnits("8,00,000")).toBe(80000000);
    expect(toMinorUnits("₹8,00,000.00")).toBe(80000000);
    expect(toMinorUnits(null)).toBe(0);
    expect(toMinorUnits(undefined)).toBe(0);
    expect(toMinorUnits("invalid")).toBe(0);
  });

  it("converts minor units back to major units accurately", () => {
    expect(fromMinorUnits(80000000)).toBe(800000);
    expect(fromMinorUnits(80000050)).toBe(800000.5);
    expect(fromMinorUnits(0)).toBe(0);
  });

  it("converts to and from database numeric(12,2) representation", () => {
    expect(toDbNumeric(80000050)).toBe("800000.50");
    expect(toDbNumeric(80000000)).toBe("800000.00");
    expect(fromDbNumeric("800000.50")).toBe(80000050);
    expect(fromDbNumeric("800000.00")).toBe(80000000);
  });

  it("adds and subtracts multiple amounts in minor units without precision drift", () => {
    // Classic JavaScript float bug: 0.1 + 0.2 = 0.30000000000000004
    const a = toMinorUnits(0.1); // 10 paise
    const b = toMinorUnits(0.2); // 20 paise
    const sum = addMoney(a, b);
    expect(sum).toBe(30);
    expect(fromMinorUnits(sum)).toBe(0.3);

    const diff = subtractMoney(toMinorUnits(800000), toMinorUnits(150000));
    expect(diff).toBe(65000000);
    expect(fromMinorUnits(diff)).toBe(650000);
  });

  it("formats INR currency in Indian numbering (lakhs/crores)", () => {
    const formatted = formatMoney(toMinorUnits(800000), "INR");
    // Standard format should contain 8,00,000 and ₹
    expect(formatted).toContain("8,00,000");
    expect(formatted).toContain("₹");
  });
});


/**
 * Deterministic Money calculations in integer minor units (paise, cents).
 *
 * Locked rules (architecture.md & rules.md):
 * - Arithmetic is strictly performed in integer minor units to prevent float precision drift.
 * - Database storage uses numeric(12,2) representation.
 * - Conversions to/from string and database values happen at the boundaries.
 * - Never produces or imports AI code.
 */

export interface Money {
  /** Amount in integer minor units (e.g. 100 paise = 1 INR) */
  minorUnits: number;
  /** ISO 4217 3-letter currency code, defaults to 'INR' */
  currency: string;
}

/** Scale factor: 1 major unit = 100 minor units for INR, USD, EUR, GBP, etc. */
const DEFAULT_SCALE = 100;

/**
 * Converts a major unit number or string to integer minor units.
 * Examples:
 *   toMinorUnits(800000) => 80000000
 *   toMinorUnits("800000.50") => 80000050
 *   toMinorUnits("8,00,000") => 80000000
 */
export function toMinorUnits(amount: number | string | null | undefined): number {
  if (amount === null || amount === undefined) {
    return 0;
  }

  if (typeof amount === "number") {
    if (isNaN(amount) || !isFinite(amount)) return 0;
    return Math.round(amount * DEFAULT_SCALE);
  }

  // Sanitize string (strip currency symbols, commas, spaces)
  const cleaned = amount.toString().replace(/[^0-9.-]/g, "").trim();
  if (!cleaned || cleaned === "-" || cleaned === ".") {
    return 0;
  }

  const parsed = parseFloat(cleaned);
  if (isNaN(parsed) || !isFinite(parsed)) {
    return 0;
  }

  return Math.round(parsed * DEFAULT_SCALE);
}

/**
 * Converts integer minor units back to a major unit number (for display or math).
 * Example: fromMinorUnits(80000000) => 800000
 */
export function fromMinorUnits(minorUnits: number): number {
  if (!minorUnits || isNaN(minorUnits)) return 0;
  return minorUnits / DEFAULT_SCALE;
}

/**
 * Converts integer minor units to database numeric(12,2) string representation.
 * Example: toDbNumeric(80000050) => "800000.50"
 */
export function toDbNumeric(minorUnits: number): string {
  const major = fromMinorUnits(minorUnits);
  return major.toFixed(2);
}

/**
 * Converts database numeric(12,2) string representation to integer minor units.
 * Example: fromDbNumeric("800000.50") => 80000050
 */
export function fromDbNumeric(dbNumeric: string | null | undefined): number {
  return toMinorUnits(dbNumeric);
}

/**
 * Adds multiple minor unit amounts safely with integer addition.
 */
export function addMoney(...amounts: number[]): number {
  return amounts.reduce((acc, curr) => acc + (Math.round(curr) || 0), 0);
}

/**
 * Subtracts b from a in integer minor units.
 */
export function subtractMoney(a: number, b: number): number {
  return (Math.round(a) || 0) - (Math.round(b) || 0);
}

/**
 * Formats minor units for UI display with currency symbol and locale-appropriate separators.
 * For INR, uses 'en-IN' formatting (lakhs/crores: ₹8,00,000).
 */
export function formatMoney(
  minorUnits: number,
  currency: string = "INR",
  locale?: string,
): string {
  const major = fromMinorUnits(minorUnits);
  const targetLocale = locale || (currency === "INR" ? "en-IN" : "en-US");

  try {
    return new Intl.NumberFormat(targetLocale, {
      style: "currency",
      currency,
      maximumFractionDigits: major % 1 === 0 ? 0 : 2,
      minimumFractionDigits: 0,
    }).format(major);
  } catch {
    // Fallback if currency/locale is invalid
    return `${currency} ${major.toLocaleString(targetLocale)}`;
  }
}


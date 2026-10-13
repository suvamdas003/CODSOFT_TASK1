/**
 * Money helpers. Amounts are always integers in the currency's minor unit
 * (cents for USD, paise for INR, yen for JPY), never floating point.
 */

export function currencyFractionDigits(currency: string): number {
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

export function formatMoney(minor: number, currency: string, locale = "en-US"): string {
  const digits = currencyFractionDigits(currency);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minor / 10 ** digits);
}

/** Plain decimal string in major units for form inputs, e.g. 125050 -> "1250.50". */
export function minorToMajorString(minor: number, currency: string): string {
  const digits = currencyFractionDigits(currency);
  if (digits === 0) return String(minor);
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const factor = 10 ** digits;
  return `${sign}${Math.floor(abs / factor)}.${String(abs % factor).padStart(digits, "0")}`;
}

/**
 * Parse a user-entered amount in major units ("1,250.5") into minor units without
 * floating-point arithmetic. Returns null for malformed, negative or oversized input.
 */
export function parseMoneyToMinor(input: string, currency: string): number | null {
  const digits = currencyFractionDigits(currency);
  const cleaned = input.trim().replace(/,/g, "");
  const pattern = digits === 0 ? /^\d+$/ : new RegExp(`^\\d+(\\.\\d{1,${digits}})?$`);
  if (!pattern.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  const minor = Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, "0") || "0");
  if (!Number.isSafeInteger(minor) || minor > 2_000_000_000) return null;
  return minor;
}

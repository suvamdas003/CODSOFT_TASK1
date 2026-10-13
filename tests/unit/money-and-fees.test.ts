import { describe, expect, it } from "vitest";
import { invoiceStatusFor, isOverdue, outstandingMinor } from "@/lib/utils/fees";
import { currencyFractionDigits, formatMoney, minorToMajorString, parseMoneyToMinor } from "@/lib/utils/money";

describe("parseMoneyToMinor", () => {
  it("converts decimal strings to integer minor units without float error", () => {
    expect(parseMoneyToMinor("1250.50", "USD")).toBe(125050);
    expect(parseMoneyToMinor("0.1", "USD")).toBe(10);
    expect(parseMoneyToMinor("1,234.56", "USD")).toBe(123456);
    expect(parseMoneyToMinor("19.99", "USD")).toBe(1999); // 19.99 * 100 = 1998.999… in floating point
  });

  it("respects currencies without minor units", () => {
    expect(currencyFractionDigits("JPY")).toBe(0);
    expect(parseMoneyToMinor("500", "JPY")).toBe(500);
    expect(parseMoneyToMinor("500.5", "JPY")).toBeNull();
  });

  it("rejects malformed, negative, too precise or oversized amounts", () => {
    for (const bad of ["", "abc", "-5", "1.234", "1e5", "12.", "9999999999"]) {
      expect(parseMoneyToMinor(bad, "USD"), bad).toBeNull();
    }
  });
});

describe("money formatting", () => {
  it("round-trips minor units to input strings", () => {
    expect(minorToMajorString(125050, "USD")).toBe("1250.50");
    expect(minorToMajorString(5, "USD")).toBe("0.05");
    expect(minorToMajorString(500, "JPY")).toBe("500");
  });

  it("formats with the currency symbol", () => {
    expect(formatMoney(125050, "USD", "en-US")).toBe("$1,250.50");
  });
});

describe("invoice status and balances", () => {
  it("derives status from paid amount", () => {
    expect(invoiceStatusFor(1000, 0)).toBe("UNPAID");
    expect(invoiceStatusFor(1000, 400)).toBe("PARTIALLY_PAID");
    expect(invoiceStatusFor(1000, 1000)).toBe("PAID");
  });

  it("computes outstanding balances and overdue state", () => {
    const today = new Date("2026-10-13T00:00:00Z");
    const invoice = {
      totalMinor: 1000,
      paidMinor: 250,
      status: "PARTIALLY_PAID" as const,
      dueDate: new Date("2026-10-01T00:00:00Z"),
    };
    expect(outstandingMinor(invoice)).toBe(750);
    expect(isOverdue(invoice, today)).toBe(true);
    expect(outstandingMinor({ ...invoice, status: "CANCELLED" })).toBe(0);
    expect(isOverdue({ ...invoice, paidMinor: 1000, status: "PAID" }, today)).toBe(false);
    expect(isOverdue({ ...invoice, dueDate: today }, today)).toBe(false);
  });
});

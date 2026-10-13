import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/utils/csv";
import { addDays, isDateOnlyString, parseDateOnly, toDateOnlyString } from "@/lib/utils/dates";
import { paginated, parsePagination } from "@/lib/utils/pagination";

describe("date-only helpers", () => {
  it("validates real calendar dates only", () => {
    expect(isDateOnlyString("2026-02-28")).toBe(true);
    expect(isDateOnlyString("2026-02-30")).toBe(false);
    expect(isDateOnlyString("2026-2-3")).toBe(false);
    expect(isDateOnlyString("not a date")).toBe(false);
  });

  it("parses to UTC midnight and round-trips", () => {
    const date = parseDateOnly("2026-10-13");
    expect(date.toISOString()).toBe("2026-10-13T00:00:00.000Z");
    expect(toDateOnlyString(addDays(date, 20))).toBe("2026-11-02");
  });
});

describe("pagination", () => {
  it("parses and clamps page parameters", () => {
    expect(parsePagination("3", "10")).toEqual({ page: 3, pageSize: 10, skip: 20, take: 10 });
    expect(parsePagination("-1", "9999")).toMatchObject({ page: 1, pageSize: 100 });
    expect(parsePagination("abc")).toMatchObject({ page: 1, pageSize: 20 });
  });

  it("computes page count", () => {
    expect(paginated([], 41, parsePagination("1", "20")).pageCount).toBe(3);
    expect(paginated([], 0, parsePagination()).pageCount).toBe(1);
  });
});

describe("toCsv", () => {
  it("quotes special characters", () => {
    expect(toCsv(["a", "b"], [["x,y", 'say "hi"']])).toBe('a,b\r\n"x,y","say ""hi"""\r\n');
  });

  it("neutralizes spreadsheet formula injection", () => {
    expect(toCsv(["v"], [['=HYPERLINK("http://evil")'], ["+1"], ["@SUM(A1)"]])).toBe(
      'v\r\n"\'=HYPERLINK(""http://evil"")"\r\n\'+1\r\n\'@SUM(A1)\r\n',
    );
  });

  it("leaves numbers untouched, including negatives", () => {
    expect(toCsv(["n"], [[-5], [12.5], [null]])).toBe("n\r\n-5\r\n12.5\r\n\r\n");
  });
});

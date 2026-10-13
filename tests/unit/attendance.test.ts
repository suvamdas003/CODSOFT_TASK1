import { describe, expect, it } from "vitest";
import { attendancePercentage, countsFromGroups, emptyAttendanceCounts, totalRecorded } from "@/lib/utils/attendance";

const counts = { PRESENT: 15, LATE: 3, ABSENT: 2, EXCUSED: 2 };

describe("attendancePercentage", () => {
  it("counts late as attended and excludes excused days by default policy", () => {
    // attended 18 of (22 - 2 excused) = 90%
    expect(attendancePercentage(counts, { lateCountsAsPresent: true, excusedExcludedFromTotal: true })).toBe(90);
  });

  it("treats late as not attended when configured", () => {
    // 15 / 20 = 75%
    expect(attendancePercentage(counts, { lateCountsAsPresent: false, excusedExcludedFromTotal: true })).toBe(75);
  });

  it("counts excused days as absences when not excluded", () => {
    // 18 / 22 = 81.818… -> 81.82
    expect(attendancePercentage(counts, { lateCountsAsPresent: true, excusedExcludedFromTotal: false })).toBe(81.82);
  });

  it("returns null when nothing can be measured", () => {
    expect(
      attendancePercentage(emptyAttendanceCounts(), { lateCountsAsPresent: true, excusedExcludedFromTotal: true }),
    ).toBeNull();
    expect(
      attendancePercentage(
        { ...emptyAttendanceCounts(), EXCUSED: 3 },
        { lateCountsAsPresent: true, excusedExcludedFromTotal: true },
      ),
    ).toBeNull();
  });

  it("returns 100 and 0 at the extremes", () => {
    const policy = { lateCountsAsPresent: true, excusedExcludedFromTotal: true };
    expect(attendancePercentage({ ...emptyAttendanceCounts(), PRESENT: 4 }, policy)).toBe(100);
    expect(attendancePercentage({ ...emptyAttendanceCounts(), ABSENT: 4 }, policy)).toBe(0);
  });
});

describe("attendance count helpers", () => {
  it("folds grouped rows and totals them", () => {
    const folded = countsFromGroups([
      { status: "PRESENT", count: 3 },
      { status: "ABSENT", count: 1 },
      { status: "PRESENT", count: 2 },
    ]);
    expect(folded).toEqual({ PRESENT: 5, ABSENT: 1, LATE: 0, EXCUSED: 0 });
    expect(totalRecorded(folded)).toBe(6);
  });
});

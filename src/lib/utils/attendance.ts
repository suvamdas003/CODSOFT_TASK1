export type AttendanceCounts = {
  PRESENT: number;
  ABSENT: number;
  LATE: number;
  EXCUSED: number;
};

export type AttendancePolicy = {
  lateCountsAsPresent: boolean;
  excusedExcludedFromTotal: boolean;
};

export const emptyAttendanceCounts = (): AttendanceCounts => ({
  PRESENT: 0,
  ABSENT: 0,
  LATE: 0,
  EXCUSED: 0,
});

/**
 * Attendance percentage according to the institution's configurable policy:
 *   attended = PRESENT (+ LATE when lateCountsAsPresent)
 *   total    = all records (- EXCUSED when excusedExcludedFromTotal)
 * Returns null when there is nothing to measure. Rounded to two decimals.
 */
export function attendancePercentage(counts: AttendanceCounts, policy: AttendancePolicy): number | null {
  const attended = counts.PRESENT + (policy.lateCountsAsPresent ? counts.LATE : 0);
  const total = totalRecorded(counts) - (policy.excusedExcludedFromTotal ? counts.EXCUSED : 0);
  if (total <= 0) return null;
  return Math.round((attended / total) * 10_000) / 100;
}

export function totalRecorded(counts: AttendanceCounts): number {
  return counts.PRESENT + counts.ABSENT + counts.LATE + counts.EXCUSED;
}

/** Fold grouped rows ({ status, _count }) into an AttendanceCounts object. */
export function countsFromGroups(groups: { status: keyof AttendanceCounts; count: number }[]): AttendanceCounts {
  const counts = emptyAttendanceCounts();
  for (const group of groups) counts[group.status] += group.count;
  return counts;
}

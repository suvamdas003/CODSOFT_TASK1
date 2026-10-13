import { describe, expect, it } from "vitest";
import {
  resolveGrade,
  summarizeResult,
  validateGradeBands,
  type GradeBandLike,
  type SubjectScore,
} from "@/lib/utils/grades";

const bands: GradeBandLike[] = [
  { label: "F", minPercent: 0, isPassing: false },
  { label: "A", minPercent: 80, isPassing: true },
  { label: "C", minPercent: 40, isPassing: true },
  { label: "B", minPercent: 60, isPassing: true },
];

const score = (marksObtained: number | null, overrides: Partial<SubjectScore> = {}): SubjectScore => ({
  maxMarks: 100,
  passMarks: 35,
  marksObtained,
  isAbsent: false,
  entered: true,
  ...overrides,
});

describe("resolveGrade", () => {
  it("picks the highest band whose minimum is reached, regardless of band order", () => {
    expect(resolveGrade(80, bands)?.label).toBe("A");
    expect(resolveGrade(79.99, bands)?.label).toBe("B");
    expect(resolveGrade(40, bands)?.label).toBe("C");
    expect(resolveGrade(0, bands)?.label).toBe("F");
  });
});

describe("summarizeResult", () => {
  it("calculates totals, percentage and grade", () => {
    const result = summarizeResult([score(90), score(70), score(65.5, { maxMarks: 50, passMarks: 20 })], bands);
    // (90 + 70 + 65.5) / 250 = 90.2%
    expect(result.totalObtained).toBe(225.5);
    expect(result.totalMax).toBe(250);
    expect(result.percentage).toBe(90.2);
    expect(result.grade?.label).toBe("A");
    expect(result.complete).toBe(true);
    expect(result.passed).toBe(true);
  });

  it("fails a student who is below pass marks in any subject even with a good average", () => {
    // 330 / 400 = 82.5% -> grade A overall, but one subject is below its pass marks.
    const result = summarizeResult([score(100), score(100), score(100), score(30)], bands);
    expect(result.grade?.label).toBe("A");
    expect(result.subjectsFailed).toBe(1);
    expect(result.passed).toBe(false);
  });

  it("scores absent subjects as zero and counts them as failed", () => {
    const result = summarizeResult([score(80), score(null, { isAbsent: true })], bands);
    expect(result.totalObtained).toBe(80);
    expect(result.percentage).toBe(40);
    expect(result.subjectsFailed).toBe(1);
  });

  it("marks results incomplete until every subject is entered", () => {
    const result = summarizeResult([score(80), score(null, { entered: false })], bands);
    expect(result.complete).toBe(false);
    expect(result.passed).toBe(false);
  });

  it("returns no percentage when nothing is entered", () => {
    const result = summarizeResult([score(null, { entered: false })], bands);
    expect(result.percentage).toBeNull();
    expect(result.grade).toBeNull();
  });
});

describe("validateGradeBands", () => {
  it("accepts a well-formed scale", () => {
    expect(validateGradeBands(bands)).toEqual([]);
  });

  it("requires a band starting at 0%", () => {
    expect(validateGradeBands([{ label: "A", minPercent: 50, isPassing: true }])).toContain(
      "One band must start at 0% so every score receives a grade.",
    );
  });

  it("rejects duplicate labels and duplicate minimums", () => {
    const errors = validateGradeBands([
      { label: "A", minPercent: 0, isPassing: true },
      { label: "a", minPercent: 0, isPassing: true },
    ]);
    expect(errors.some((e) => e.includes("Duplicate grade label"))).toBe(true);
    expect(errors.some((e) => e.includes("Two bands start at 0%"))).toBe(true);
  });
});

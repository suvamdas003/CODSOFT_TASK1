export type GradeBandLike = {
  label: string;
  minPercent: number;
  gradePoint?: number | null;
  remark?: string | null;
  isPassing: boolean;
};

export type SubjectScore = {
  maxMarks: number;
  passMarks: number;
  /** null when absent or not yet entered */
  marksObtained: number | null;
  isAbsent: boolean;
  entered: boolean;
};

export type ResultSummary = {
  totalObtained: number;
  totalMax: number;
  percentage: number | null;
  grade: GradeBandLike | null;
  /** every subject has an entry (a score or "absent") */
  complete: boolean;
  /** complete, every subject >= its pass marks, and the overall grade is a passing band */
  passed: boolean;
  subjectsFailed: number;
};

export function roundTo(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Highest band whose minimum is <= percentage. Bands may be passed in any order. */
export function resolveGrade(percentage: number, bands: GradeBandLike[]): GradeBandLike | null {
  const sorted = [...bands].sort((a, b) => b.minPercent - a.minPercent);
  return sorted.find((band) => percentage >= band.minPercent) ?? null;
}

export function subjectPercentage(score: SubjectScore): number | null {
  if (!score.entered || score.maxMarks <= 0) return null;
  return roundTo(((score.marksObtained ?? 0) / score.maxMarks) * 100);
}

export function subjectPassed(score: SubjectScore): boolean {
  return score.entered && !score.isAbsent && (score.marksObtained ?? 0) >= score.passMarks;
}

/** Totals, percentage and grade for one student's exam. Absent subjects score zero. */
export function summarizeResult(scores: SubjectScore[], bands: GradeBandLike[]): ResultSummary {
  const totalMax = scores.reduce((sum, s) => sum + s.maxMarks, 0);
  const totalObtained = roundTo(
    scores.reduce((sum, s) => sum + (s.entered && !s.isAbsent ? (s.marksObtained ?? 0) : 0), 0),
  );
  const complete = scores.length > 0 && scores.every((s) => s.entered);
  const enteredAny = scores.some((s) => s.entered);
  const percentage = totalMax > 0 && enteredAny ? roundTo((totalObtained / totalMax) * 100) : null;
  const grade = percentage === null ? null : resolveGrade(percentage, bands);
  const subjectsFailed = scores.filter((s) => s.entered && !subjectPassed(s)).length;
  return {
    totalObtained,
    totalMax,
    percentage,
    grade,
    complete,
    passed: complete && subjectsFailed === 0 && (grade?.isPassing ?? false),
    subjectsFailed,
  };
}

/**
 * Validate a grade scale: unique labels and minimums within 0–100, plus a band starting
 * at 0 so every percentage maps to a grade. Returns a list of error messages.
 */
export function validateGradeBands(bands: GradeBandLike[]): string[] {
  const errors: string[] = [];
  if (bands.length === 0) errors.push("Add at least one grade band.");
  const labels = new Set<string>();
  const minimums = new Set<number>();
  for (const band of bands) {
    const label = band.label.trim().toUpperCase();
    if (labels.has(label)) errors.push(`Duplicate grade label "${band.label}".`);
    labels.add(label);
    if (minimums.has(band.minPercent)) errors.push(`Two bands start at ${band.minPercent}%.`);
    minimums.add(band.minPercent);
    if (band.minPercent < 0 || band.minPercent > 100) {
      errors.push("Minimum percentages must be between 0 and 100.");
    }
  }
  if (bands.length > 0 && !minimums.has(0)) {
    errors.push("One band must start at 0% so every score receives a grade.");
  }
  return errors;
}

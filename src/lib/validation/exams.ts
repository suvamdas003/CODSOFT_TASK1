import { z } from "zod";
import { checkboxField, idField, intField, optionalDate, optionalText, requiredText } from "./common";

export const examSchema = z
  .object({
    name: requiredText("Exam name", 80),
    academicSessionId: idField("Academic session"),
    classId: idField("Class"),
    gradeScaleId: idField("Grade scale"),
    startDate: optionalDate("start date"),
    endDate: optionalDate("end date"),
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
    path: ["endDate"],
    message: "End date must not be before the start date.",
  });

export const examSubjectSchema = z
  .object({
    subjectId: idField("Subject"),
    maxMarks: intField("Maximum marks", 1, 1000),
    passMarks: intField("Pass marks", 0, 1000),
    examDate: optionalDate("exam date"),
  })
  .refine((v) => v.passMarks <= v.maxMarks, {
    path: ["passMarks"],
    message: "Pass marks cannot exceed maximum marks.",
  });

/** A mark as typed: "" (not entered), or a number with at most two decimals. */
const markValue = z
  .string()
  .trim()
  .max(10)
  .refine((v) => v === "" || /^\d{1,4}(\.\d{1,2})?$/.test(v), "Enter a number with up to 2 decimals.");

export const markEntrySchema = z.object({
  studentId: idField("Student"),
  marks: markValue,
  isAbsent: checkboxField,
  remarks: optionalText(200),
});

export const saveMarksSchema = z.object({
  examSubjectId: idField("Exam subject"),
  sectionId: idField("Section"),
  entries: z
    .array(markEntrySchema)
    .min(1, "There are no students to record.")
    .max(500)
    .refine(
      (entries) => new Set(entries.map((e) => e.studentId)).size === entries.length,
      "Each student can only appear once.",
    ),
});

export const gradeBandSchema = z.object({
  label: requiredText("Label", 8),
  minPercent: z.coerce
    .number({ error: "Minimum % is required." })
    .min(0, "Minimum % must be at least 0.")
    .max(100, "Minimum % must be at most 100."),
  gradePoint: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.coerce.number().min(0).max(10).nullable(),
  ),
  remark: optionalText(60),
  isPassing: checkboxField,
});

export const gradeScaleSchema = z.object({
  name: requiredText("Scale name", 60),
  description: optionalText(200),
  isDefault: checkboxField,
  bands: z.array(gradeBandSchema).min(1, "Add at least one grade band.").max(20),
});

export type ExamInput = z.output<typeof examSchema>;
export type ExamSubjectInput = z.output<typeof examSubjectSchema>;
export type SaveMarksInput = z.output<typeof saveMarksSchema>;
export type GradeScaleInput = z.output<typeof gradeScaleSchema>;

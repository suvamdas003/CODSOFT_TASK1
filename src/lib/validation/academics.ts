import { z } from "zod";
import {
  checkboxField,
  dateField,
  idField,
  intField,
  optionalId,
  optionalInt,
  optionalText,
  requiredText,
} from "./common";

export const academicSessionSchema = z
  .object({
    name: requiredText("Name", 40),
    startDate: dateField("Start date"),
    endDate: dateField("End date"),
    isCurrent: checkboxField,
  })
  .refine((v) => v.endDate > v.startDate, {
    path: ["endDate"],
    message: "End date must be after the start date.",
  });

export const classSchema = z.object({
  name: requiredText("Class name", 40),
  level: intField("Level", 0, 50),
  description: optionalText(200),
});

export const sectionSchema = z.object({
  classId: idField("Class"),
  academicSessionId: idField("Academic session"),
  name: requiredText("Section name", 20).toUpperCase(),
  classTeacherId: optionalId(),
  capacity: optionalInt("Capacity", 1, 500),
  room: optionalText(40),
});

export const subjectSchema = z.object({
  code: requiredText("Code", 16)
    .toUpperCase()
    .regex(/^[A-Z0-9-]+$/, "Use letters, numbers or '-'."),
  name: requiredText("Name", 80),
  description: optionalText(200),
  isActive: checkboxField,
});

export const assignmentSchema = z.object({
  teacherId: idField("Teacher"),
  sectionId: idField("Section"),
  subjectId: idField("Subject"),
});

export type AcademicSessionInput = z.output<typeof academicSessionSchema>;
export type ClassInput = z.output<typeof classSchema>;
export type SectionInput = z.output<typeof sectionSchema>;
export type SubjectInput = z.output<typeof subjectSchema>;
export type AssignmentInput = z.output<typeof assignmentSchema>;

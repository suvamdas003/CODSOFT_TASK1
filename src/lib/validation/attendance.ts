import { z } from "zod";
import { AttendanceStatus } from "@/generated/prisma/enums";
import { dateField, idField, optionalText } from "./common";

export const attendanceEntrySchema = z.object({
  studentId: idField("Student"),
  status: z.enum(AttendanceStatus, { error: "Choose an attendance status." }),
  remarks: optionalText(200),
});

export const saveAttendanceSchema = z.object({
  sectionId: idField("Section"),
  date: dateField("Date"),
  entries: z
    .array(attendanceEntrySchema)
    .min(1, "There are no students to record.")
    .max(500)
    .refine(
      (entries) => new Set(entries.map((e) => e.studentId)).size === entries.length,
      "Each student can only appear once.",
    ),
});

export const attendanceReportSchema = z
  .object({
    sectionId: idField("Section"),
    from: dateField("Start date"),
    to: dateField("End date"),
  })
  .refine((v) => v.to >= v.from, { path: ["to"], message: "End date must not be before start date." });

export type SaveAttendanceInput = z.output<typeof saveAttendanceSchema>;

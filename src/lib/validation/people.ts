import { z } from "zod";
import { Gender, StudentStatus, TeacherStatus } from "@/generated/prisma/enums";
import {
  dateField,
  emailField,
  optionalDate,
  optionalEmail,
  optionalId,
  optionalPhone,
  optionalText,
  passwordField,
  phoneField,
  requiredText,
} from "./common";

const notInFuture = (date: Date | null) => !date || date.getTime() <= Date.now();

export const studentFieldsSchema = z.object({
  admissionNumber: requiredText("Admission number", 30)
    .toUpperCase()
    .regex(/^[A-Z0-9/-]+$/, "Use letters, numbers, '-' or '/'."),
  firstName: requiredText("First name", 60),
  lastName: requiredText("Last name", 60),
  email: emailField,
  dateOfBirth: optionalDate("date of birth").refine(notInFuture, "Date of birth cannot be in the future."),
  gender: z.enum(Gender).default(Gender.UNDISCLOSED),
  phone: optionalPhone,
  address: optionalText(300),
  guardianName: requiredText("Guardian name", 120),
  guardianRelation: requiredText("Guardian relation", 40),
  guardianPhone: phoneField("Guardian phone"),
  guardianEmail: optionalEmail,
  sectionId: optionalId(),
  enrollmentDate: dateField("Enrollment date"),
  status: z.enum(StudentStatus).default(StudentStatus.ACTIVE),
});

export const createStudentSchema = studentFieldsSchema.extend({ password: passwordField });
export const updateStudentSchema = studentFieldsSchema;

export type CreateStudentInput = z.output<typeof createStudentSchema>;
export type UpdateStudentInput = z.output<typeof updateStudentSchema>;

export const teacherFieldsSchema = z.object({
  employeeId: requiredText("Employee ID", 30)
    .toUpperCase()
    .regex(/^[A-Z0-9/-]+$/, "Use letters, numbers, '-' or '/'."),
  firstName: requiredText("First name", 60),
  lastName: requiredText("Last name", 60),
  email: emailField,
  phone: optionalPhone,
  qualification: optionalText(120),
  specialization: optionalText(120),
  joiningDate: dateField("Joining date"),
  status: z.enum(TeacherStatus).default(TeacherStatus.ACTIVE),
});

export const createTeacherSchema = teacherFieldsSchema.extend({ password: passwordField });
export const updateTeacherSchema = teacherFieldsSchema;

export type CreateTeacherInput = z.output<typeof createTeacherSchema>;
export type UpdateTeacherInput = z.output<typeof updateTeacherSchema>;

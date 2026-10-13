import { hashPassword } from "better-auth/crypto";
import { expect } from "vitest";
import { Role } from "@/generated/prisma/enums";
import { AppError, type ErrorCode } from "@/lib/errors";
import { addDays, toDateOnlyString, todayDateOnly } from "@/lib/utils/dates";
import type { Actor } from "@/server/auth/actor";
import { prisma } from "@/server/db";
import * as academics from "@/server/services/academics.service";
import { saveGradeScale } from "@/server/services/settings.service";
import { createStudent } from "@/server/services/student.service";
import { createTeacher } from "@/server/services/teacher.service";
import { createLoginUser } from "@/server/services/user.service";

export const TEST_PASSWORD = "Testpass123";

/** Remove every row (keeps the migrations table). Only ever runs against TEST_DATABASE_URL. */
export async function resetDatabase() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

/** Assert that a promise rejects with an AppError of the given code. */
export async function expectAppError(promise: Promise<unknown>, code: ErrorCode): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return error as AppError;
  }
  throw new Error(`Expected the operation to fail with ${code}, but it succeeded.`);
}

let passwordHash: string | null = null;
async function hash() {
  passwordHash ??= await hashPassword(TEST_PASSWORD);
  return passwordHash;
}

export async function createAdmin(email = "admin@school.test"): Promise<Actor> {
  const passwordHashValue = await hash();
  const userId = await prisma.$transaction((tx) =>
    createLoginUser(tx, { name: "Test Admin", email, role: Role.ADMIN, passwordHash: passwordHashValue }),
  );
  return { userId, name: "Test Admin", email, role: Role.ADMIN, studentId: null, teacherId: null };
}

export async function actorForUser(userId: string): Promise<Actor> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { studentProfile: true, teacherProfile: true },
  });
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    studentId: user.studentProfile?.id ?? null,
    teacherId: user.teacherProfile?.id ?? null,
  };
}

let counter = 0;
export const unique = (prefix: string) => `${prefix}${Date.now().toString(36).toUpperCase()}${(counter += 1)}`;

export function studentInput(overrides: Record<string, unknown> = {}) {
  const n = unique("");
  return {
    admissionNumber: `ADM-${n}`,
    firstName: "Test",
    lastName: `Student${n}`,
    email: `student-${n.toLowerCase()}@school.test`,
    password: TEST_PASSWORD,
    gender: "UNDISCLOSED",
    guardianName: "Guardian Person",
    guardianRelation: "Mother",
    guardianPhone: "+1 555 0100",
    enrollmentDate: toDateOnlyString(addDays(todayDateOnly(), -60)),
    status: "ACTIVE",
    ...overrides,
  };
}

export async function createTeacherActor(admin: Actor): Promise<Actor> {
  const n = unique("");
  const teacherId = await createTeacher(admin, {
    employeeId: `EMP-${n}`,
    firstName: "Terry",
    lastName: `Teacher${n}`,
    email: `teacher-${n.toLowerCase()}@school.test`,
    password: TEST_PASSWORD,
    joiningDate: "2020-01-01",
    status: "ACTIVE",
  });
  const teacher = await prisma.teacherProfile.findUniqueOrThrow({ where: { id: teacherId } });
  return actorForUser(teacher.userId);
}

export async function createStudentActor(
  admin: Actor,
  sectionId: string | null,
  overrides: Record<string, unknown> = {},
) {
  const studentId = await createStudent(admin, studentInput({ sectionId, ...overrides }));
  const student = await prisma.studentProfile.findUniqueOrThrow({ where: { id: studentId } });
  return actorForUser(student.userId);
}

/**
 * A current academic session (covering today) with one class, two sections, two
 * subjects, a default grade scale, and a teacher assigned to MATH in section A only.
 */
export async function createSchool() {
  await resetDatabase();
  const admin = await createAdmin();
  const today = todayDateOnly();
  const session = await academics.createSession(admin, {
    name: "Test Session",
    startDate: toDateOnlyString(addDays(today, -180)),
    endDate: toDateOnlyString(addDays(today, 180)),
    isCurrent: "on",
  });
  const klass = await academics.createClass(admin, { name: "Grade 5", level: "5" });
  const sectionA = await academics.createSection(admin, {
    classId: klass.id,
    academicSessionId: session.id,
    name: "A",
  });
  const sectionB = await academics.createSection(admin, {
    classId: klass.id,
    academicSessionId: session.id,
    name: "B",
  });
  const math = await academics.createSubject(admin, { code: "MATH", name: "Mathematics", isActive: "on" });
  const science = await academics.createSubject(admin, { code: "SCI", name: "Science", isActive: "on" });
  await saveGradeScale(admin, null, {
    name: "Test Scale",
    isDefault: "on",
    bands: [
      { label: "A", minPercent: "80", isPassing: "on" },
      { label: "B", minPercent: "60", isPassing: "on" },
      { label: "C", minPercent: "40", isPassing: "on" },
      { label: "F", minPercent: "0", isPassing: "" },
    ],
  });
  const scale = await prisma.gradeScale.findFirstOrThrow({ where: { isDefault: true } });
  const teacher = await createTeacherActor(admin);
  await academics.createAssignment(admin, { teacherId: teacher.teacherId, sectionId: sectionA.id, subjectId: math.id });
  return { admin, session, klass, sectionA, sectionB, math, science, scale, teacher };
}

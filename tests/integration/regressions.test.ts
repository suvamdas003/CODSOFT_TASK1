import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ExamStatus, StudentStatus } from "@/generated/prisma/enums";
import { addDays, toDateOnlyString, todayDateOnly } from "@/lib/utils/dates";
import { auth } from "@/server/auth/auth";
import { failedSignInLimit } from "@/server/auth/sign-in-throttle";
import { prisma } from "@/server/db";
import { saveAttendance } from "@/server/services/attendance.service";
import { addExamSubject, createExam, saveMarks } from "@/server/services/exam.service";
import { createFeeStructure, createInvoice } from "@/server/services/fee.service";
import { getSettings, updateSettings } from "@/server/services/settings.service";
import { setStudentStatus } from "@/server/services/student.service";
import { resetUserPassword, setUserActive } from "@/server/services/user.service";
import { createSchool, createStudentActor, expectAppError, TEST_PASSWORD } from "./fixtures";

/** Regression tests for defects found in the 2026-10 audit (see docs/SECURITY.md). */

const BASE = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const day = (offset: number) => toDateOnlyString(addDays(todayDateOnly(), offset));

function signIn(email: string, password: string, ip: string) {
  return auth.handler(
    new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": ip },
      body: JSON.stringify({ email, password }),
    }),
  );
}

let school: Awaited<ReturnType<typeof createSchool>>;

beforeAll(async () => {
  school = await createSchool();
});
afterAll(() => prisma.$disconnect());

describe("sign-in throttling", () => {
  it("locks an account after repeated failures even when the client IP changes every attempt", async () => {
    const student = await createStudentActor(school.admin, school.sectionA.id);
    const limit = failedSignInLimit();
    // A forged X-Forwarded-For per request defeats the per-IP limit, not the per-account one.
    for (let i = 0; i < limit; i++) {
      expect((await signIn(student.email, "WrongPass999", `192.0.2.${i + 1}`)).status).toBe(401);
    }
    expect((await signIn(student.email, "WrongPass999", "192.0.2.200")).status).toBe(429);
    // While locked, even the right password is refused (no password oracle).
    expect((await signIn(student.email, TEST_PASSWORD, "192.0.2.201")).status).toBe(429);
    expect(await prisma.session.count({ where: { userId: student.userId } })).toBe(0);

    // An administrator password reset lifts the lock.
    await resetUserPassword(school.admin, { userId: student.userId, password: "Newpass1234" });
    expect((await signIn(student.email, "Newpass1234", "192.0.2.202")).status).toBe(200);
  });

  it("a successful sign-in clears earlier failures", async () => {
    const student = await createStudentActor(school.admin, school.sectionA.id);
    for (let i = 0; i < failedSignInLimit() - 1; i++) await signIn(student.email, "WrongPass999", `192.0.2.${50 + i}`);
    expect((await signIn(student.email, TEST_PASSWORD, "192.0.2.90")).status).toBe(200);
    expect((await signIn(student.email, "WrongPass999", "192.0.2.91")).status).toBe(401);
    expect((await signIn(student.email, TEST_PASSWORD, "192.0.2.92")).status).toBe(200);
  });

  it("does not create throttle rows for unknown email addresses", async () => {
    await signIn("nobody-here@school.test", "WrongPass999", "192.0.2.150");
    expect(await prisma.rateLimit.count({ where: { key: { contains: "nobody-here@school.test" } } })).toBe(0);
  });
});

describe("account activation follows the profile status", () => {
  it("cannot re-enable sign-in for a deactivated student from the users page", async () => {
    const student = await createStudentActor(school.admin, school.sectionA.id);
    await setStudentStatus(school.admin, student.studentId!, StudentStatus.GRADUATED);
    await expectAppError(setUserActive(school.admin, student.userId, true), "VALIDATION");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: student.userId } })).isActive).toBe(false);
    expect((await signIn(student.email, TEST_PASSWORD, "192.0.2.160")).status).toBe(401);
  });
});

describe("deactivated students receive no new records", () => {
  it("rejects new attendance for an inactive student but allows correcting an existing record", async () => {
    const student = await createStudentActor(school.admin, school.sectionB.id);
    const entry = (status: string) => ({
      sectionId: school.sectionB.id,
      date: day(-2),
      entries: [{ studentId: student.studentId!, status, remarks: "" }],
    });
    await saveAttendance(school.admin, entry("PRESENT"));
    await setStudentStatus(school.admin, student.studentId!, StudentStatus.INACTIVE);
    await saveAttendance(school.admin, entry("EXCUSED")); // correction of an existing record
    await expectAppError(saveAttendance(school.admin, { ...entry("PRESENT"), date: day(-1) }), "VALIDATION");
  });

  it("rejects new marks for an inactive student", async () => {
    const student = await createStudentActor(school.admin, school.sectionB.id);
    const exam = await createExam(school.admin, {
      name: "Inactive student check",
      academicSessionId: school.session.id,
      classId: school.klass.id,
      gradeScaleId: school.scale.id,
    });
    const es = await addExamSubject(school.admin, exam.id, {
      subjectId: school.math.id,
      maxMarks: "100",
      passMarks: "35",
    });
    await setStudentStatus(school.admin, student.studentId!, StudentStatus.TRANSFERRED);
    await expectAppError(
      saveMarks(school.admin, {
        examSubjectId: es.id,
        sectionId: school.sectionB.id,
        entries: [{ studentId: student.studentId!, marks: "50", isAbsent: "" }],
      }),
      "VALIDATION",
    );
  });
});

describe("marks entry and publishing", () => {
  it("does not write marks to an exam that is published while the save is in progress", async () => {
    const student = await createStudentActor(school.admin, school.sectionA.id);
    const exam = await createExam(school.admin, {
      name: "Publish race",
      academicSessionId: school.session.id,
      classId: school.klass.id,
      gradeScaleId: school.scale.id,
    });
    const es = await addExamSubject(school.admin, exam.id, {
      subjectId: school.math.id,
      maxMarks: "100",
      passMarks: "35",
    });

    // Hold an uncommitted "publish" on the exam row, start a marks save, then commit.
    let locked!: () => void;
    let release!: () => void;
    const lockTaken = new Promise<void>((resolve) => (locked = resolve));
    const gate = new Promise<void>((resolve) => (release = resolve));
    const publishing = prisma.$transaction(
      async (tx) => {
        await tx.exam.update({
          where: { id: exam.id },
          data: { status: ExamStatus.PUBLISHED, publishedAt: new Date() },
        });
        locked();
        await gate;
      },
      { timeout: 20_000 },
    );
    await lockTaken;
    const saving = saveMarks(school.admin, {
      examSubjectId: es.id,
      sectionId: school.sectionA.id,
      entries: [{ studentId: student.studentId!, marks: "70", isAbsent: "" }],
    });
    saving.catch(() => undefined); // asserted below
    await new Promise((resolve) => setTimeout(resolve, 500));
    release();
    await publishing;

    await expectAppError(saving, "CONFLICT");
    expect(await prisma.mark.count({ where: { examSubjectId: es.id } })).toBe(0);
  });
});

describe("money safety", () => {
  it("rejects an invoice whose total exceeds the 32-bit total column with a validation error", async () => {
    const student = await createStudentActor(school.admin, school.sectionA.id);
    await expectAppError(
      createInvoice(school.admin, {
        studentId: student.studentId,
        issueDate: day(0),
        dueDate: day(30),
        items: [
          { description: "Line 1", amount: "15000000.00" },
          { description: "Line 2", amount: "15000000.00" },
        ],
      }),
      "VALIDATION",
    );
  });

  it("locks the currency once fee structures exist (stored amounts are in its minor unit)", async () => {
    const settings = await getSettings();
    const form = {
      name: settings.name,
      currencyCode: "JPY",
      locale: settings.locale,
      lateCountsAsPresent: "on",
      excusedExcludedFromTotal: "on",
      lowAttendanceThreshold: "75",
      invoicePrefix: settings.invoicePrefix,
      receiptPrefix: settings.receiptPrefix,
    };
    expect(await prisma.invoice.count()).toBe(0); // only the fee-structure rule applies here
    await createFeeStructure(school.admin, {
      name: "Lab fee",
      academicSessionId: school.session.id,
      amount: "450.00",
      frequency: "TERM",
      isActive: "on",
    });
    await expectAppError(updateSettings(school.admin, form), "VALIDATION");
    expect((await getSettings()).currencyCode).toBe(settings.currencyCode);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, toDateOnlyString, todayDateOnly } from "@/lib/utils/dates";
import { parsePagination } from "@/lib/utils/pagination";
import type { Actor } from "@/server/auth/actor";
import { prisma } from "@/server/db";
import { getStudentAttendanceSummary } from "@/server/services/attendance.service";
import { listAuditLogs } from "@/server/services/audit.service";
import {
  addExamSubject,
  createExam,
  getReportCard,
  getStudentResults,
  setExamPublished,
} from "@/server/services/exam.service";
import { createInvoice, getInvoice, getStudentFees, listInvoices } from "@/server/services/fee.service";
import { getStudent, listStudents } from "@/server/services/student.service";
import { listUsers, resetUserPassword } from "@/server/services/user.service";
import { createSchool, createStudentActor, expectAppError } from "./fixtures";

let school: Awaited<ReturnType<typeof createSchool>>;
let alice: Actor; // student in section A
let bob: Actor; // student in section B
let bobInvoiceId: string;
let examId: string;

beforeAll(async () => {
  school = await createSchool();
  alice = await createStudentActor(school.admin, school.sectionA.id);
  bob = await createStudentActor(school.admin, school.sectionB.id);
  const today = todayDateOnly();
  const invoice = await createInvoice(school.admin, {
    studentId: bob.studentId,
    issueDate: toDateOnlyString(today),
    dueDate: toDateOnlyString(addDays(today, 30)),
    items: [{ description: "Tuition", amount: "100.00" }],
  });
  bobInvoiceId = invoice.id;
  const exam = await createExam(school.admin, {
    name: "Midterm",
    academicSessionId: school.session.id,
    classId: school.klass.id,
    gradeScaleId: school.scale.id,
  });
  await addExamSubject(school.admin, exam.id, { subjectId: school.math.id, maxMarks: "100", passMarks: "35" });
  examId = exam.id;
});
afterAll(() => prisma.$disconnect());

describe("students cannot reach other students' records (IDOR)", () => {
  it("can read their own profile but not another student's", async () => {
    expect((await getStudent(alice, alice.studentId!)).id).toBe(alice.studentId);
    await expectAppError(getStudent(alice, bob.studentId!), "NOT_FOUND");
  });

  it("cannot read another student's attendance, results or fees", async () => {
    await expectAppError(getStudentAttendanceSummary(alice, bob.studentId!), "NOT_FOUND");
    await expectAppError(getStudentResults(alice, bob.studentId!), "NOT_FOUND");
    await expectAppError(getStudentFees(alice, bob.studentId!), "NOT_FOUND");
  });

  it("cannot open another student's invoice by ID", async () => {
    await expectAppError(getInvoice(alice, bobInvoiceId), "NOT_FOUND");
    expect((await getInvoice(bob, bobInvoiceId)).id).toBe(bobInvoiceId);
  });

  it("cannot open another student's report card, nor their own before publication", async () => {
    await expectAppError(getReportCard(alice, examId, bob.studentId!), "NOT_FOUND");
    await expectAppError(getReportCard(alice, examId, alice.studentId!), "NOT_FOUND"); // draft
    await setExamPublished(school.admin, examId, true);
    expect((await getReportCard(alice, examId, alice.studentId!)).student.id).toBe(alice.studentId);
    await expectAppError(getReportCard(alice, examId, bob.studentId!), "NOT_FOUND");
  });
});

describe("role restrictions", () => {
  it("students cannot use staff or admin functions", async () => {
    await expectAppError(listStudents(alice, {}, parsePagination()), "FORBIDDEN");
    await expectAppError(listInvoices(alice, {}, parsePagination()), "FORBIDDEN");
    await expectAppError(listUsers(alice, {}, parsePagination()), "FORBIDDEN");
    await expectAppError(listAuditLogs(alice, {}, parsePagination()), "FORBIDDEN");
  });

  it("teachers cannot manage fees, users or see students outside their sections", async () => {
    await expectAppError(listInvoices(school.teacher, {}, parsePagination()), "FORBIDDEN");
    await expectAppError(getInvoice(school.teacher, bobInvoiceId), "NOT_FOUND");
    await expectAppError(getStudentFees(school.teacher, alice.studentId!), "FORBIDDEN");
    await expectAppError(
      resetUserPassword(school.teacher, { userId: alice.userId, password: "Hacked1234" }),
      "FORBIDDEN",
    );
    // Section A is taught by the teacher; section B is not.
    expect((await getStudent(school.teacher, alice.studentId!)).id).toBe(alice.studentId);
    await expectAppError(getStudent(school.teacher, bob.studentId!), "NOT_FOUND");
    await expectAppError(getStudentAttendanceSummary(school.teacher, bob.studentId!), "NOT_FOUND");
  });

  it("administrators can access every record", async () => {
    expect((await getStudent(school.admin, bob.studentId!)).id).toBe(bob.studentId);
    expect((await getStudentFees(school.admin, bob.studentId!)).invoices).toHaveLength(1);
  });
});

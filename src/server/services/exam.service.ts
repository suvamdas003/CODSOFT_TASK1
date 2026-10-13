import type { Prisma } from "@/generated/prisma/client";
import { ExamStatus, Role, StudentStatus } from "@/generated/prisma/enums";
import { conflict, invalid, notFound, parseInput, type FieldErrors } from "@/lib/errors";
import { attendancePercentage, countsFromGroups } from "@/lib/utils/attendance";
import { fullName, sectionLabel } from "@/lib/utils/format";
import {
  resolveGrade,
  roundTo,
  subjectPassed,
  subjectPercentage,
  summarizeResult,
  type GradeBandLike,
  type SubjectScore,
} from "@/lib/utils/grades";
import { examSchema, examSubjectSchema, saveMarksSchema } from "@/lib/validation/exams";
import type { Actor } from "@/server/auth/actor";
import {
  assertRole,
  assertSectionAccess,
  assertStudentAccess,
  assertSubjectTeachingAccess,
  visibleSectionIds,
} from "@/server/auth/policy";
import { prisma, type Db } from "@/server/db";
import { recordAudit } from "./audit.service";
import { getAttendancePolicy } from "./attendance.service";
import { getCurrentSession } from "./academics.service";
import { getGradeBands, getSettings } from "./settings.service";

type MarkRow = {
  examSubjectId: string;
  studentId: string;
  marksObtained: Prisma.Decimal | null;
  isAbsent: boolean;
  remarks: string | null;
};
type ExamSubjectRow = {
  id: string;
  maxMarks: number;
  passMarks: number;
  subject: { id: string; code: string; name: string };
};

function scoreFor(subject: ExamSubjectRow, mark: MarkRow | undefined): SubjectScore {
  return {
    maxMarks: subject.maxMarks,
    passMarks: subject.passMarks,
    marksObtained: mark?.marksObtained == null ? null : Number(mark.marksObtained),
    isAbsent: mark?.isAbsent ?? false,
    entered: Boolean(mark),
  };
}

const examInclude = {
  class: { select: { id: true, name: true } },
  academicSession: { select: { id: true, name: true, isCurrent: true } },
  gradeScale: { select: { id: true, name: true } },
  subjects: {
    include: { subject: { select: { id: true, code: true, name: true } } },
    orderBy: { subject: { name: "asc" } },
  },
} satisfies Prisma.ExamInclude;

/** Sections of an exam's class/session that the actor may see. */
async function examSectionsForActor(
  actor: Actor,
  exam: { classId: string; academicSessionId: string },
  db: Db = prisma,
) {
  const visible = await visibleSectionIds(actor, db);
  return db.section.findMany({
    where: {
      classId: exam.classId,
      academicSessionId: exam.academicSessionId,
      ...(visible ? { id: { in: visible } } : {}),
    },
    include: { class: true, _count: { select: { students: { where: { status: StudentStatus.ACTIVE } } } } },
    orderBy: { name: "asc" },
  });
}

async function loadExamForStaff(actor: Actor, examId: string, db: Db = prisma) {
  assertRole(actor, Role.ADMIN, Role.TEACHER);
  const exam = await db.exam.findUnique({ where: { id: examId }, include: examInclude });
  if (!exam) throw notFound("Exam");
  if (actor.role === Role.TEACHER && (await examSectionsForActor(actor, exam, db)).length === 0) {
    throw notFound("Exam");
  }
  return exam;
}

function assertDraft(exam: { status: ExamStatus }) {
  if (exam.status !== ExamStatus.DRAFT) {
    throw conflict("This exam is published and locked. Unpublish it to make changes.");
  }
}

// ───────────── Exams ─────────────

export async function listExams(actor: Actor, filters: { academicSessionId?: string; classId?: string } = {}) {
  let scope: Prisma.ExamWhereInput = {};
  if (actor.role === Role.TEACHER) {
    const ids = (await visibleSectionIds(actor)) ?? [];
    const sections = await prisma.section.findMany({
      where: { id: { in: ids } },
      select: { classId: true, academicSessionId: true },
    });
    scope = sections.length
      ? { OR: sections.map((s) => ({ classId: s.classId, academicSessionId: s.academicSessionId })) }
      : { id: "__none__" };
  } else if (actor.role === Role.STUDENT) {
    const student = actor.studentId
      ? await prisma.studentProfile.findUnique({
          where: { id: actor.studentId },
          select: { section: { select: { classId: true, academicSessionId: true } } },
        })
      : null;
    scope = student?.section
      ? {
          classId: student.section.classId,
          academicSessionId: student.section.academicSessionId,
          status: ExamStatus.PUBLISHED,
        }
      : { id: "__none__" };
  }
  return prisma.exam.findMany({
    where: {
      AND: [
        scope,
        filters.academicSessionId ? { academicSessionId: filters.academicSessionId } : {},
        filters.classId ? { classId: filters.classId } : {},
      ],
    },
    include: {
      class: { select: { name: true, level: true } },
      academicSession: { select: { name: true } },
      _count: { select: { subjects: true } },
    },
    orderBy: [
      { academicSession: { startDate: "desc" } },
      { class: { level: "asc" } },
      { startDate: "asc" },
      { name: "asc" },
    ],
  });
}

export async function getExamDetail(actor: Actor, examId: string) {
  const exam = await loadExamForStaff(actor, examId);
  const sections = await examSectionsForActor(actor, exam);

  // Which (section, subject) pairs can this actor enter marks for?
  let allowedPairs: Set<string> | null = null;
  if (actor.role === Role.TEACHER && actor.teacherId) {
    const assignments = await prisma.teachingAssignment.findMany({
      where: {
        teacherId: actor.teacherId,
        section: { classId: exam.classId, academicSessionId: exam.academicSessionId },
      },
      select: { sectionId: true, subjectId: true },
    });
    allowedPairs = new Set(assignments.map((a) => `${a.sectionId}:${a.subjectId}`));
  }

  const marks = await prisma.mark.findMany({
    where: { examSubject: { examId }, student: { sectionId: { in: sections.map((s) => s.id) } } },
    select: { examSubjectId: true, student: { select: { sectionId: true } } },
  });
  const progress = new Map<string, number>();
  for (const m of marks) {
    const key = `${m.student.sectionId}:${m.examSubjectId}`;
    progress.set(key, (progress.get(key) ?? 0) + 1);
  }

  return {
    exam,
    canManage: actor.role === Role.ADMIN,
    sections: sections.map((section) => ({
      id: section.id,
      label: sectionLabel(section),
      students: section._count.students,
      subjects: exam.subjects.map((es) => ({
        examSubjectId: es.id,
        subjectName: es.subject.name,
        entered: progress.get(`${section.id}:${es.id}`) ?? 0,
        canEnter: allowedPairs ? allowedPairs.has(`${section.id}:${es.subject.id}`) : true,
      })),
    })),
  };
}

async function validateExamRefs(db: Db, data: { academicSessionId: string; classId: string; gradeScaleId: string }) {
  const session = await db.academicSession.findUnique({ where: { id: data.academicSessionId }, select: { id: true } });
  const klass = await db.schoolClass.findUnique({ where: { id: data.classId }, select: { id: true } });
  const scale = await db.gradeScale.findUnique({ where: { id: data.gradeScaleId }, select: { id: true } });
  if (!session) throw invalid("Choose a valid session.", { academicSessionId: ["Session not found."] });
  if (!klass) throw invalid("Choose a valid class.", { classId: ["Class not found."] });
  if (!scale) throw invalid("Choose a valid grade scale.", { gradeScaleId: ["Grade scale not found."] });
}

async function assertExamNameFree(
  db: Db,
  data: { academicSessionId: string; classId: string; name: string },
  exceptId?: string,
) {
  const clash = await db.exam.findFirst({
    where: {
      academicSessionId: data.academicSessionId,
      classId: data.classId,
      name: { equals: data.name, mode: "insensitive" },
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
  });
  if (clash)
    throw conflict("This class already has an exam with that name in the session.", { name: ["Name is taken."] });
}

export async function createExam(actor: Actor, input: unknown) {
  assertRole(actor, Role.ADMIN);
  const data = parseInput(examSchema, input);
  return prisma.$transaction(async (tx) => {
    await validateExamRefs(tx, data);
    await assertExamNameFree(tx, data);
    const exam = await tx.exam.create({ data, include: { class: true } });
    await recordAudit(tx, actor, {
      action: "exam.created",
      entityType: "Exam",
      entityId: exam.id,
      summary: `Created exam ${exam.name} for ${exam.class.name}`,
    });
    return exam;
  });
}

export async function updateExam(actor: Actor, examId: string, input: unknown) {
  assertRole(actor, Role.ADMIN);
  const data = parseInput(examSchema, input);
  return prisma.$transaction(async (tx) => {
    const exam = await tx.exam.findUnique({ where: { id: examId } });
    if (!exam) throw notFound("Exam");
    assertDraft(exam);
    const markCount = await tx.mark.count({ where: { examSubject: { examId } } });
    if (markCount > 0 && (exam.classId !== data.classId || exam.academicSessionId !== data.academicSessionId)) {
      throw conflict("Class and session cannot change after marks have been entered.");
    }
    await validateExamRefs(tx, data);
    await assertExamNameFree(tx, data, examId);
    const updated = await tx.exam.update({ where: { id: examId }, data });
    await recordAudit(tx, actor, {
      action: "exam.updated",
      entityType: "Exam",
      entityId: examId,
      summary: `Updated exam ${updated.name}`,
    });
    return updated;
  });
}

export async function deleteExam(actor: Actor, examId: string) {
  assertRole(actor, Role.ADMIN);
  return prisma.$transaction(async (tx) => {
    const exam = await tx.exam.findUnique({ where: { id: examId } });
    if (!exam) throw notFound("Exam");
    assertDraft(exam);
    if ((await tx.mark.count({ where: { examSubject: { examId } } })) > 0) {
      throw conflict("Exams with entered marks cannot be deleted.");
    }
    await tx.examSubject.deleteMany({ where: { examId } });
    await tx.exam.delete({ where: { id: examId } });
    await recordAudit(tx, actor, {
      action: "exam.deleted",
      entityType: "Exam",
      entityId: examId,
      summary: `Deleted exam ${exam.name}`,
    });
  });
}

export async function setExamPublished(actor: Actor, examId: string, publish: boolean) {
  assertRole(actor, Role.ADMIN);
  return prisma.$transaction(async (tx) => {
    const exam = await tx.exam.findUnique({
      where: { id: examId },
      include: { _count: { select: { subjects: true } } },
    });
    if (!exam) throw notFound("Exam");
    if (publish && exam._count.subjects === 0) throw invalid("Add at least one subject before publishing.");
    await tx.exam.update({
      where: { id: examId },
      data: publish
        ? { status: ExamStatus.PUBLISHED, publishedAt: new Date() }
        : { status: ExamStatus.DRAFT, publishedAt: null },
    });
    await recordAudit(tx, actor, {
      action: publish ? "exam.published" : "exam.unpublished",
      entityType: "Exam",
      entityId: examId,
      summary: `${publish ? "Published" : "Unpublished"} results for ${exam.name}`,
    });
  });
}

// ───────────── Exam subjects ─────────────

export async function addExamSubject(actor: Actor, examId: string, input: unknown) {
  assertRole(actor, Role.ADMIN);
  const data = parseInput(examSubjectSchema, input);
  return prisma.$transaction(async (tx) => {
    const exam = await tx.exam.findUnique({ where: { id: examId } });
    if (!exam) throw notFound("Exam");
    assertDraft(exam);
    const subject = await tx.subject.findUnique({ where: { id: data.subjectId } });
    if (!subject?.isActive) throw invalid("Choose an active subject.", { subjectId: ["Subject is not active."] });
    if (await tx.examSubject.findUnique({ where: { examId_subjectId: { examId, subjectId: data.subjectId } } })) {
      throw conflict("This subject is already part of the exam.", { subjectId: ["Already added."] });
    }
    const created = await tx.examSubject.create({ data: { ...data, examId } });
    await recordAudit(tx, actor, {
      action: "exam.subjectAdded",
      entityType: "Exam",
      entityId: examId,
      summary: `Added ${subject.name} (max ${data.maxMarks}) to ${exam.name}`,
    });
    return created;
  });
}

export async function updateExamSubject(actor: Actor, examSubjectId: string, input: unknown) {
  assertRole(actor, Role.ADMIN);
  const data = parseInput(examSubjectSchema, input);
  return prisma.$transaction(async (tx) => {
    const es = await tx.examSubject.findUnique({
      where: { id: examSubjectId },
      include: { exam: true, subject: true },
    });
    if (!es) throw notFound("Exam subject");
    assertDraft(es.exam);
    const highest = await tx.mark.aggregate({
      where: { examSubjectId },
      _max: { marksObtained: true },
      _count: { _all: true },
    });
    if (highest._count._all > 0 && data.subjectId !== es.subjectId) {
      throw conflict("The subject cannot be changed after marks have been entered.");
    }
    const maxEntered = highest._max.marksObtained == null ? 0 : Number(highest._max.marksObtained);
    if (data.maxMarks < maxEntered) {
      throw invalid(`Maximum marks cannot be below the highest mark already entered (${maxEntered}).`, {
        maxMarks: [`Must be at least ${maxEntered}.`],
      });
    }
    const updated = await tx.examSubject.update({ where: { id: examSubjectId }, data });
    await recordAudit(tx, actor, {
      action: "exam.subjectUpdated",
      entityType: "Exam",
      entityId: es.examId,
      summary: `Updated ${es.subject.name} in ${es.exam.name} (max ${data.maxMarks}, pass ${data.passMarks})`,
    });
    return updated;
  });
}

export async function removeExamSubject(actor: Actor, examSubjectId: string) {
  assertRole(actor, Role.ADMIN);
  return prisma.$transaction(async (tx) => {
    const es = await tx.examSubject.findUnique({
      where: { id: examSubjectId },
      include: { exam: true, subject: true, _count: { select: { marks: true } } },
    });
    if (!es) throw notFound("Exam subject");
    assertDraft(es.exam);
    if (es._count.marks > 0) throw conflict("Subjects with entered marks cannot be removed.");
    await tx.examSubject.delete({ where: { id: examSubjectId } });
    await recordAudit(tx, actor, {
      action: "exam.subjectRemoved",
      entityType: "Exam",
      entityId: es.examId,
      summary: `Removed ${es.subject.name} from ${es.exam.name}`,
    });
  });
}

// ───────────── Marks ─────────────

async function loadMarksContext(actor: Actor, examSubjectId: string, sectionId: string, db: Db = prisma) {
  assertRole(actor, Role.ADMIN, Role.TEACHER);
  const examSubject = await db.examSubject.findUnique({
    where: { id: examSubjectId },
    include: { exam: { include: { class: true } }, subject: true },
  });
  if (!examSubject) throw notFound("Exam subject");
  const section = await db.section.findUnique({ where: { id: sectionId }, include: { class: true } });
  if (
    !section ||
    section.classId !== examSubject.exam.classId ||
    section.academicSessionId !== examSubject.exam.academicSessionId
  ) {
    throw invalid("This section does not take this exam.");
  }
  await assertSubjectTeachingAccess(actor, sectionId, examSubject.subjectId, db);
  return { examSubject, section };
}

/** Students of a section with their current mark for one exam subject. */
export async function getMarksSheet(actor: Actor, examSubjectId: string, sectionId: string) {
  const { examSubject, section } = await loadMarksContext(actor, examSubjectId, sectionId);
  const students = await prisma.studentProfile.findMany({
    where: {
      sectionId,
      OR: [{ status: StudentStatus.ACTIVE }, { marks: { some: { examSubjectId } } }],
    },
    select: { id: true, admissionNumber: true, firstName: true, lastName: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const marks = await prisma.mark.findMany({
    where: { examSubjectId, studentId: { in: students.map((s) => s.id) } },
    select: { studentId: true, marksObtained: true, isAbsent: true, remarks: true },
  });
  const byStudent = new Map(marks.map((m) => [m.studentId, m]));
  return {
    exam: { id: examSubject.exam.id, name: examSubject.exam.name, status: examSubject.exam.status },
    examSubject: {
      id: examSubject.id,
      maxMarks: examSubject.maxMarks,
      passMarks: examSubject.passMarks,
      subjectName: examSubject.subject.name,
    },
    section: { id: section.id, label: sectionLabel(section) },
    locked: examSubject.exam.status !== ExamStatus.DRAFT,
    rows: students.map((student) => {
      const mark = byStudent.get(student.id);
      return {
        student,
        marks: mark?.marksObtained == null ? "" : String(Number(mark.marksObtained)),
        isAbsent: mark?.isAbsent ?? false,
        remarks: mark?.remarks ?? "",
      };
    }),
  };
}

/**
 * Save marks for one subject and section. Marks are validated against the subject's
 * maximum; a blank, non-absent entry clears any existing mark. Locked once published.
 */
export async function saveMarks(actor: Actor, input: unknown) {
  const data = parseInput(saveMarksSchema, input);
  const { examSubject, section } = await loadMarksContext(actor, data.examSubjectId, data.sectionId);
  assertDraft(examSubject.exam);

  // Same roster as the marks sheet: active students, plus anyone who already has a mark
  // (so an existing entry for a since-deactivated student can still be corrected).
  const students = await prisma.studentProfile.findMany({
    where: {
      id: { in: data.entries.map((e) => e.studentId) },
      sectionId: data.sectionId,
      OR: [{ status: StudentStatus.ACTIVE }, { marks: { some: { examSubjectId: data.examSubjectId } } }],
    },
    select: { id: true },
  });
  const inSection = new Set(students.map((s) => s.id));

  const fieldErrors: FieldErrors = {};
  const upserts: { studentId: string; marksObtained: string | null; isAbsent: boolean; remarks: string | null }[] = [];
  const clears: string[] = [];
  for (const entry of data.entries) {
    if (!inSection.has(entry.studentId)) throw invalid("One or more students do not belong to this section.");
    if (entry.isAbsent) {
      upserts.push({ studentId: entry.studentId, marksObtained: null, isAbsent: true, remarks: entry.remarks });
    } else if (entry.marks === "") {
      clears.push(entry.studentId);
    } else if (Number(entry.marks) > examSubject.maxMarks) {
      fieldErrors[`marks.${entry.studentId}`] = [`Cannot exceed ${examSubject.maxMarks}.`];
    } else {
      upserts.push({ studentId: entry.studentId, marksObtained: entry.marks, isAbsent: false, remarks: entry.remarks });
    }
  }
  if (Object.keys(fieldErrors).length) {
    throw invalid(`Marks cannot exceed the maximum of ${examSubject.maxMarks}.`, fieldErrors);
  }

  return prisma.$transaction(async (tx) => {
    // Re-check inside the transaction so marks cannot be written to a just-published exam.
    // FOR SHARE blocks a concurrent publish (which updates this row) until these marks
    // commit, and waits for an in-flight publish so its new status is seen here.
    const rows = await tx.$queryRaw<{ status: ExamStatus }[]>`
      SELECT status::text AS status FROM exams WHERE id = ${examSubject.examId} FOR SHARE`;
    if (!rows[0]) throw notFound("Exam");
    assertDraft(rows[0]);
    for (const row of upserts) {
      await tx.mark.upsert({
        where: { examSubjectId_studentId: { examSubjectId: examSubject.id, studentId: row.studentId } },
        create: { ...row, examSubjectId: examSubject.id, enteredById: actor.userId },
        update: {
          marksObtained: row.marksObtained,
          isAbsent: row.isAbsent,
          remarks: row.remarks,
          enteredById: actor.userId,
        },
      });
    }
    if (clears.length) {
      await tx.mark.deleteMany({ where: { examSubjectId: examSubject.id, studentId: { in: clears } } });
    }
    await recordAudit(tx, actor, {
      action: "marks.saved",
      entityType: "Exam",
      entityId: examSubject.examId,
      summary: `Saved ${examSubject.subject.name} marks for ${sectionLabel(section)} in ${examSubject.exam.name}`,
      metadata: { saved: upserts.length, cleared: clears.length },
    });
    return { saved: upserts.length, cleared: clears.length };
  });
}

// ───────────── Results ─────────────

function buildResultRows(subjects: ExamSubjectRow[], marks: MarkRow[], bands: GradeBandLike[]) {
  const byKey = new Map(marks.map((m) => [`${m.studentId}:${m.examSubjectId}`, m]));
  return (studentId: string) => {
    const scores = subjects.map((es) => scoreFor(es, byKey.get(`${studentId}:${es.id}`)));
    const subjectRows = subjects.map((es, i) => {
      const score = scores[i]!;
      const pct = subjectPercentage(score);
      return {
        examSubjectId: es.id,
        subject: es.subject,
        maxMarks: es.maxMarks,
        passMarks: es.passMarks,
        marksObtained: score.marksObtained,
        isAbsent: score.isAbsent,
        entered: score.entered,
        remarks: byKey.get(`${studentId}:${es.id}`)?.remarks ?? null,
        percentage: pct,
        grade: pct === null ? null : (resolveGrade(pct, bands)?.label ?? null),
        passed: subjectPassed(score),
      };
    });
    return { subjects: subjectRows, summary: summarizeResult(scores, bands) };
  };
}

/** Assign competition ranks (1, 2, 2, 4) by percentage among students with results. */
function rankByPercentage<T extends { summary: { percentage: number | null } }>(rows: T[]) {
  const sorted = rows
    .filter((r) => r.summary.percentage !== null)
    .sort((a, b) => b.summary.percentage! - a.summary.percentage!);
  const ranks = new Map<T, number>();
  sorted.forEach((row, index) => {
    const prev = sorted[index - 1];
    ranks.set(row, prev && prev.summary.percentage === row.summary.percentage ? ranks.get(prev)! : index + 1);
  });
  return ranks;
}

export async function getSectionResults(actor: Actor, examId: string, sectionId: string) {
  const exam = await loadExamForStaff(actor, examId);
  const section = await prisma.section.findUnique({ where: { id: sectionId }, include: { class: true } });
  if (!section || section.classId !== exam.classId || section.academicSessionId !== exam.academicSessionId) {
    throw invalid("This section does not take this exam.");
  }
  await assertSectionAccess(actor, sectionId);

  const students = await prisma.studentProfile.findMany({
    where: { sectionId, OR: [{ status: StudentStatus.ACTIVE }, { marks: { some: { examSubject: { examId } } } }] },
    select: { id: true, admissionNumber: true, firstName: true, lastName: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const [marks, bands] = await Promise.all([
    prisma.mark.findMany({
      where: { examSubject: { examId }, studentId: { in: students.map((s) => s.id) } },
      select: { examSubjectId: true, studentId: true, marksObtained: true, isAbsent: true, remarks: true },
    }),
    getGradeBands(exam.gradeScaleId),
  ]);
  const resultFor = buildResultRows(exam.subjects, marks, bands);
  const rows = students.map((student) => ({ student, name: fullName(student), ...resultFor(student.id) }));
  const ranks = rankByPercentage(rows);

  const subjectStats = exam.subjects.map((es, i) => {
    const entered = rows.map((r) => r.subjects[i]!).filter((s) => s.entered);
    const scored = entered.filter((s) => !s.isAbsent).map((s) => s.marksObtained ?? 0);
    return {
      subject: es.subject,
      maxMarks: es.maxMarks,
      entered: entered.length,
      average: scored.length ? roundTo(scored.reduce((a, b) => a + b, 0) / scored.length) : null,
      highest: scored.length ? Math.max(...scored) : null,
      passCount: entered.filter((s) => s.passed).length,
    };
  });

  return {
    exam,
    section: { id: section.id, label: sectionLabel(section) },
    rows: rows.map((r) => ({ ...r, rank: ranks.get(r) ?? null })),
    subjectStats,
  };
}

/** Full report card for one student and exam. Students only see published exams. */
export async function getReportCard(actor: Actor, examId: string, studentId: string) {
  await assertStudentAccess(actor, studentId);
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { ...examInclude, academicSession: true },
  });
  if (!exam) throw notFound("Report card");
  if (actor.role === Role.STUDENT && exam.status !== ExamStatus.PUBLISHED) throw notFound("Report card");

  const student = await prisma.studentProfile.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      admissionNumber: true,
      firstName: true,
      lastName: true,
      dateOfBirth: true,
      guardianName: true,
      section: { select: { id: true, name: true, classId: true, class: { select: { name: true } } } },
    },
  });
  if (!student) throw notFound("Student");
  const marks = await prisma.mark.findMany({
    where: { examSubject: { examId }, studentId },
    select: { examSubjectId: true, studentId: true, marksObtained: true, isAbsent: true, remarks: true },
  });
  if (marks.length === 0 && student.section?.classId !== exam.classId) throw notFound("Report card");

  const [bands, settings, attendanceGroups, policy] = await Promise.all([
    getGradeBands(exam.gradeScaleId),
    getSettings(),
    prisma.attendanceRecord.groupBy({
      by: ["status"],
      where: { studentId, date: { gte: exam.academicSession.startDate, lte: exam.academicSession.endDate } },
      _count: { _all: true },
    }),
    getAttendancePolicy(),
  ]);
  const result = buildResultRows(exam.subjects, marks, bands)(studentId);
  const attendanceCounts = countsFromGroups(attendanceGroups.map((g) => ({ status: g.status, count: g._count._all })));

  return {
    institution: {
      name: settings.name,
      address: settings.address,
      phone: settings.phone,
      email: settings.email,
      locale: settings.locale,
    },
    exam: {
      id: exam.id,
      name: exam.name,
      status: exam.status,
      sessionName: exam.academicSession.name,
      className: exam.class.name,
      scaleName: exam.gradeScale.name,
      publishedAt: exam.publishedAt,
    },
    student: {
      ...student,
      name: fullName(student),
      sectionName: student.section ? `${student.section.class.name} – ${student.section.name}` : "—",
    },
    ...result,
    bands,
    attendance: { counts: attendanceCounts, percentage: attendancePercentage(attendanceCounts, policy) },
  };
}

/** Exam history for one student (all sessions). Students see published exams only. */
export async function getStudentResults(actor: Actor, studentId: string) {
  await assertStudentAccess(actor, studentId);
  const student = await prisma.studentProfile.findUnique({
    where: { id: studentId },
    select: { section: { select: { classId: true, academicSessionId: true } } },
  });
  if (!student) throw notFound("Student");
  const publishedOnly = actor.role === Role.STUDENT;
  const exams = await prisma.exam.findMany({
    where: {
      ...(publishedOnly ? { status: ExamStatus.PUBLISHED } : {}),
      OR: [
        { subjects: { some: { marks: { some: { studentId } } } } },
        ...(student.section
          ? [{ classId: student.section.classId, academicSessionId: student.section.academicSessionId }]
          : []),
      ],
    },
    include: examInclude,
    orderBy: [{ academicSession: { startDate: "desc" } }, { startDate: "desc" }, { createdAt: "desc" }],
  });
  const marks = await prisma.mark.findMany({
    where: { studentId, examSubject: { examId: { in: exams.map((e) => e.id) } } },
    select: { examSubjectId: true, studentId: true, marksObtained: true, isAbsent: true, remarks: true },
  });
  const bandCache = new Map<string, GradeBandLike[]>();
  const results = [];
  for (const exam of exams) {
    if (!bandCache.has(exam.gradeScaleId)) bandCache.set(exam.gradeScaleId, await getGradeBands(exam.gradeScaleId));
    const result = buildResultRows(exam.subjects, marks, bandCache.get(exam.gradeScaleId)!)(studentId);
    results.push({
      exam: {
        id: exam.id,
        name: exam.name,
        status: exam.status,
        sessionName: exam.academicSession.name,
        className: exam.class.name,
      },
      ...result,
    });
  }
  return results;
}

/** Aggregate performance per exam (administrators): average %, pass rate, subject averages. */
export async function getExamPerformance(actor: Actor, opts: { academicSessionId?: string } = {}) {
  assertRole(actor, Role.ADMIN);
  const sessionId = opts.academicSessionId ?? (await getCurrentSession())?.id;
  if (!sessionId) return [];
  const exams = await prisma.exam.findMany({
    where: { academicSessionId: sessionId },
    include: examInclude,
    orderBy: [{ class: { level: "asc" } }, { startDate: "asc" }],
  });
  const marks = await prisma.mark.findMany({
    where: { examSubject: { examId: { in: exams.map((e) => e.id) } } },
    select: {
      examSubjectId: true,
      studentId: true,
      marksObtained: true,
      isAbsent: true,
      remarks: true,
      examSubject: { select: { examId: true } },
    },
  });
  const output = [];
  for (const exam of exams) {
    const examMarks = marks.filter((m) => m.examSubject.examId === exam.id);
    const studentIds = [...new Set(examMarks.map((m) => m.studentId))];
    const bands = await getGradeBands(exam.gradeScaleId);
    const resultFor = buildResultRows(exam.subjects, examMarks, bands);
    const summaries = studentIds.map((id) => resultFor(id));
    const withPct = summaries.filter((s) => s.summary.percentage !== null);
    const complete = summaries.filter((s) => s.summary.complete);
    output.push({
      exam: { id: exam.id, name: exam.name, className: exam.class.name, status: exam.status },
      students: studentIds.length,
      averagePercentage: withPct.length
        ? roundTo(withPct.reduce((a, s) => a + s.summary.percentage!, 0) / withPct.length)
        : null,
      passRate: complete.length
        ? roundTo((complete.filter((s) => s.summary.passed).length / complete.length) * 100)
        : null,
      subjects: exam.subjects.map((es, i) => {
        const scored = summaries.map((s) => s.subjects[i]!).filter((s) => s.entered && !s.isAbsent);
        return {
          name: es.subject.name,
          average: scored.length ? roundTo(scored.reduce((a, s) => a + (s.percentage ?? 0), 0) / scored.length) : null,
        };
      }),
    });
  }
  return output;
}

/** Marks-entry tasks for a teacher: draft exams (current session) with incomplete marks. */
export async function pendingMarksTasks(actor: Actor) {
  assertRole(actor, Role.TEACHER);
  if (!actor.teacherId) return [];
  const session = await getCurrentSession();
  if (!session) return [];
  const assignments = await prisma.teachingAssignment.findMany({
    where: { teacherId: actor.teacherId, section: { academicSessionId: session.id } },
    include: {
      section: {
        include: { class: true, _count: { select: { students: { where: { status: StudentStatus.ACTIVE } } } } },
      },
      subject: true,
    },
  });
  const tasks = [];
  for (const a of assignments) {
    const examSubjects = await prisma.examSubject.findMany({
      where: {
        subjectId: a.subjectId,
        exam: { classId: a.section.classId, academicSessionId: session.id, status: ExamStatus.DRAFT },
      },
      include: { exam: { select: { id: true, name: true } } },
    });
    for (const es of examSubjects) {
      const entered = await prisma.mark.count({ where: { examSubjectId: es.id, student: { sectionId: a.sectionId } } });
      if (entered < a.section._count.students) {
        tasks.push({
          examId: es.exam.id,
          examName: es.exam.name,
          examSubjectId: es.id,
          sectionId: a.sectionId,
          label: `${a.subject.name} · ${sectionLabel(a.section)}`,
          entered,
          total: a.section._count.students,
        });
      }
    }
  }
  return tasks;
}

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/server/auth/actor";
import { prisma } from "@/server/db";
import {
  addExamSubject,
  createExam,
  getReportCard,
  getSectionResults,
  getStudentResults,
  saveMarks,
  setExamPublished,
  updateExamSubject,
} from "@/server/services/exam.service";
import { createSchool, createStudentActor, expectAppError } from "./fixtures";

let school: Awaited<ReturnType<typeof createSchool>>;
let s1: Actor;
let s2: Actor;
let examId: string;
let mathId: string;
let sciId: string;

beforeAll(async () => {
  school = await createSchool();
  s1 = await createStudentActor(school.admin, school.sectionA.id, { firstName: "First" });
  s2 = await createStudentActor(school.admin, school.sectionA.id, { firstName: "Second" });
  const exam = await createExam(school.admin, {
    name: "Term 1",
    academicSessionId: school.session.id,
    classId: school.klass.id,
    gradeScaleId: school.scale.id,
  });
  examId = exam.id;
  mathId = (await addExamSubject(school.admin, examId, { subjectId: school.math.id, maxMarks: "50", passMarks: "20" }))
    .id;
  sciId = (
    await addExamSubject(school.admin, examId, { subjectId: school.science.id, maxMarks: "100", passMarks: "35" })
  ).id;
});
afterAll(() => prisma.$disconnect());

const marks = (examSubjectId: string, rows: [Actor, string, boolean?][]) => ({
  examSubjectId,
  sectionId: school.sectionA.id,
  entries: rows.map(([student, value, absent]) => ({
    studentId: student.studentId!,
    marks: value,
    isAbsent: absent ? "on" : "",
  })),
});

describe("exam configuration", () => {
  it("prevents adding the same subject twice and pass marks above maximum", async () => {
    await expectAppError(
      addExamSubject(school.admin, examId, { subjectId: school.math.id, maxMarks: "50", passMarks: "20" }),
      "CONFLICT",
    );
    await expectAppError(
      updateExamSubject(school.admin, mathId, { subjectId: school.math.id, maxMarks: "50", passMarks: "60" }),
      "VALIDATION",
    );
  });

  it("prevents duplicate exam names for the same class and session", async () => {
    await expectAppError(
      createExam(school.admin, {
        name: "term 1",
        academicSessionId: school.session.id,
        classId: school.klass.id,
        gradeScaleId: school.scale.id,
      }),
      "CONFLICT",
    );
  });
});

describe("marks entry", () => {
  it("rejects marks above the subject maximum with a per-student field error", async () => {
    const error = await expectAppError(
      saveMarks(
        school.teacher,
        marks(mathId, [
          [s1, "51"],
          [s2, "40"],
        ]),
      ),
      "VALIDATION",
    );
    expect(error.fieldErrors?.[`marks.${s1.studentId}`]).toBeDefined();
    expect(await prisma.mark.count({ where: { examSubjectId: mathId } })).toBe(0); // nothing partially saved
  });

  it("rejects negative and malformed marks", async () => {
    await expectAppError(saveMarks(school.teacher, marks(mathId, [[s1, "-2"]])), "VALIDATION");
    await expectAppError(saveMarks(school.teacher, marks(mathId, [[s1, "4o"]])), "VALIDATION");
  });

  it("only the assigned teacher (or an admin) can enter a subject's marks", async () => {
    // The fixture teacher teaches MATH in section A, not Science.
    await expectAppError(saveMarks(school.teacher, marks(sciId, [[s1, "70"]])), "FORBIDDEN");
    await expectAppError(saveMarks(s1, marks(mathId, [[s1, "50"]])), "FORBIDDEN");
  });

  it("saves, updates and clears marks", async () => {
    await saveMarks(
      school.teacher,
      marks(mathId, [
        [s1, "45.5"],
        [s2, "18"],
      ]),
    );
    await saveMarks(
      school.admin,
      marks(sciId, [
        [s1, "80"],
        [s2, "", true],
      ]),
    );
    expect(await prisma.mark.count({ where: { examSubject: { examId } } })).toBe(4);

    await saveMarks(
      school.teacher,
      marks(mathId, [
        [s1, "46"],
        [s2, ""],
      ]),
    ); // blank clears s2
    const s1Math = await prisma.mark.findUniqueOrThrow({
      where: { examSubjectId_studentId: { examSubjectId: mathId, studentId: s1.studentId! } },
    });
    expect(Number(s1Math.marksObtained)).toBe(46);
    expect(await prisma.mark.count({ where: { examSubjectId: mathId, studentId: s2.studentId! } })).toBe(0);
    await saveMarks(
      school.teacher,
      marks(mathId, [
        [s1, "46"],
        [s2, "18"],
      ]),
    );
  });

  it("does not let maximum marks drop below a mark already entered", async () => {
    await expectAppError(
      updateExamSubject(school.admin, mathId, { subjectId: school.math.id, maxMarks: "40", passMarks: "20" }),
      "VALIDATION",
    );
  });
});

describe("results", () => {
  it("calculates totals, percentages, grades, pass/fail and ranks", async () => {
    const results = await getSectionResults(school.admin, examId, school.sectionA.id);
    const first = results.rows.find((r) => r.student.id === s1.studentId)!;
    const second = results.rows.find((r) => r.student.id === s2.studentId)!;
    // s1: 46/50 + 80/100 = 126/150 = 84% -> A, passes both.
    expect(first.summary.totalObtained).toBe(126);
    expect(first.summary.totalMax).toBe(150);
    expect(first.summary.percentage).toBe(84);
    expect(first.summary.grade?.label).toBe("A");
    expect(first.summary.passed).toBe(true);
    expect(first.rank).toBe(1);
    // s2: 18/50 (below pass 20) + absent in Science -> 12%, F, failed.
    expect(second.summary.percentage).toBe(12);
    expect(second.summary.grade?.label).toBe("F");
    expect(second.summary.passed).toBe(false);
    expect(second.summary.subjectsFailed).toBe(2);
    expect(second.rank).toBe(2);
  });

  it("locks marks once results are published and shows them to students", async () => {
    await expectAppError(getReportCard(s1, examId, s1.studentId!), "NOT_FOUND");
    expect(await getStudentResults(s1, s1.studentId!)).toHaveLength(0);

    await setExamPublished(school.admin, examId, true);
    await expectAppError(saveMarks(school.teacher, marks(mathId, [[s1, "50"]])), "CONFLICT");

    const card = await getReportCard(s1, examId, s1.studentId!);
    expect(card.summary.percentage).toBe(84);
    expect(card.subjects.map((s) => s.grade)).toEqual(["A", "A"]); // Mathematics 92%, Science 80%
    expect(await getStudentResults(s1, s1.studentId!)).toHaveLength(1);
  });

  it("retains historical results after the student changes section", async () => {
    await prisma.studentProfile.update({ where: { id: s1.studentId! }, data: { sectionId: school.sectionB.id } });
    const results = await getStudentResults(school.admin, s1.studentId!);
    expect(results.find((r) => r.exam.id === examId)?.summary.percentage).toBe(84);
  });
});

"use server";

import { Role } from "@/generated/prisma/enums";
import type { FormValues } from "@/lib/action-result";
import { runAction } from "@/server/action";
import * as exams from "@/server/services/exam.service";

const ADMIN = [Role.ADMIN];

export async function createExamAction(values: FormValues) {
  return runAction(ADMIN, async (actor) => {
    const exam = await exams.createExam(actor, values);
    return {
      message: "Exam created. Add its subjects next.",
      redirectTo: `/examinations/${exam.id}`,
      revalidate: ["/examinations"],
    };
  });
}

export async function updateExamAction(examId: string, values: FormValues) {
  return runAction(ADMIN, async (actor) => {
    await exams.updateExam(actor, examId, values);
    return { message: "Exam updated.", revalidate: [`/examinations/${examId}`, "/examinations"] };
  });
}

export async function deleteExamAction(examId: string) {
  return runAction(ADMIN, async (actor) => {
    await exams.deleteExam(actor, examId);
    return { message: "Exam deleted.", redirectTo: "/examinations", revalidate: ["/examinations"] };
  });
}

export async function setExamPublishedAction(examId: string, publish: boolean) {
  return runAction(ADMIN, async (actor) => {
    await exams.setExamPublished(actor, examId, publish);
    return {
      message: publish
        ? "Results published. Students can now see them."
        : "Results unpublished and unlocked for editing.",
      revalidate: [`/examinations/${examId}`, "/examinations"],
    };
  });
}

export async function addExamSubjectAction(examId: string, values: FormValues) {
  return runAction(ADMIN, async (actor) => {
    await exams.addExamSubject(actor, examId, values);
    return { message: "Subject added to the exam.", revalidate: [`/examinations/${examId}`] };
  });
}

export async function updateExamSubjectAction(examId: string, examSubjectId: string, values: FormValues) {
  return runAction(ADMIN, async (actor) => {
    await exams.updateExamSubject(actor, examSubjectId, values);
    return { message: "Exam subject updated.", revalidate: [`/examinations/${examId}`] };
  });
}

export async function removeExamSubjectAction(examId: string, examSubjectId: string) {
  return runAction(ADMIN, async (actor) => {
    await exams.removeExamSubject(actor, examSubjectId);
    return { message: "Subject removed from the exam.", revalidate: [`/examinations/${examId}`] };
  });
}

/** Form fields: examSubjectId, sectionId, marks.<studentId>, absent.<studentId>, remarks.<studentId>. */
export async function saveMarksAction(values: FormValues) {
  return runAction([Role.ADMIN, Role.TEACHER], async (actor) => {
    const entries = Object.keys(values)
      .filter((key) => key.startsWith("marks."))
      .map((key) => {
        const studentId = key.slice("marks.".length);
        return {
          studentId,
          marks: values[key],
          isAbsent: values[`absent.${studentId}`],
          remarks: values[`remarks.${studentId}`],
        };
      });
    const result = await exams.saveMarks(actor, {
      examSubjectId: values.examSubjectId,
      sectionId: values.sectionId,
      entries,
    });
    return {
      message: `Saved ${result.saved} mark${result.saved === 1 ? "" : "s"}${result.cleared ? `, cleared ${result.cleared}` : ""}.`,
      revalidate: ["/examinations", "/dashboard"],
    };
  });
}

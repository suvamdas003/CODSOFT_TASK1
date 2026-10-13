"use server";

import { Role, StudentStatus } from "@/generated/prisma/enums";
import type { FormValues } from "@/lib/action-result";
import { invalid } from "@/lib/errors";
import { runAction } from "@/server/action";
import { createStudent, setStudentStatus, updateStudent } from "@/server/services/student.service";

export async function createStudentAction(values: FormValues) {
  return runAction([Role.ADMIN], async (actor) => {
    const id = await createStudent(actor, values);
    return { message: "Student created.", redirectTo: `/students/${id}`, revalidate: ["/students"] };
  });
}

export async function updateStudentAction(studentId: string, values: FormValues) {
  return runAction([Role.ADMIN], async (actor) => {
    await updateStudent(actor, studentId, values);
    return { message: "Student updated.", redirectTo: `/students/${studentId}`, revalidate: ["/students"] };
  });
}

export async function setStudentStatusAction(studentId: string, status: StudentStatus) {
  return runAction([Role.ADMIN], async (actor) => {
    if (!Object.values(StudentStatus).includes(status)) throw invalid("Invalid status.");
    await setStudentStatus(actor, studentId, status);
    return {
      message: status === StudentStatus.ACTIVE ? "Student reactivated." : "Student deactivated.",
      revalidate: ["/students", `/students/${studentId}`],
    };
  });
}

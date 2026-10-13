"use server";

import { Role, TeacherStatus } from "@/generated/prisma/enums";
import type { FormValues } from "@/lib/action-result";
import { invalid } from "@/lib/errors";
import { runAction } from "@/server/action";
import { createTeacher, setTeacherStatus, updateTeacher } from "@/server/services/teacher.service";

export async function createTeacherAction(values: FormValues) {
  return runAction([Role.ADMIN], async (actor) => {
    const id = await createTeacher(actor, values);
    return { message: "Teacher created.", redirectTo: `/teachers/${id}`, revalidate: ["/teachers"] };
  });
}

export async function updateTeacherAction(teacherId: string, values: FormValues) {
  return runAction([Role.ADMIN], async (actor) => {
    await updateTeacher(actor, teacherId, values);
    return { message: "Teacher updated.", redirectTo: `/teachers/${teacherId}`, revalidate: ["/teachers"] };
  });
}

export async function setTeacherStatusAction(teacherId: string, status: TeacherStatus) {
  return runAction([Role.ADMIN], async (actor) => {
    if (!Object.values(TeacherStatus).includes(status)) throw invalid("Invalid status.");
    await setTeacherStatus(actor, teacherId, status);
    return {
      message: status === TeacherStatus.ACTIVE ? "Teacher reactivated." : "Teacher deactivated.",
      revalidate: ["/teachers", `/teachers/${teacherId}`],
    };
  });
}

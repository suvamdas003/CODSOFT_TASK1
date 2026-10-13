"use server";

import { Role } from "@/generated/prisma/enums";
import type { FormValues } from "@/lib/action-result";
import { runAction } from "@/server/action";
import * as academics from "@/server/services/academics.service";

const ADMIN = [Role.ADMIN];

export async function createSessionAction(values: FormValues) {
  return runAction(ADMIN, async (actor) => {
    await academics.createSession(actor, values);
    return { message: "Academic session created.", revalidate: ["/academics/sessions"] };
  });
}

export async function updateSessionAction(id: string, values: FormValues) {
  return runAction(ADMIN, async (actor) => {
    await academics.updateSession(actor, id, values);
    return { message: "Academic session updated.", revalidate: ["/academics/sessions"] };
  });
}

export async function setCurrentSessionAction(id: string) {
  return runAction(ADMIN, async (actor) => {
    await academics.setCurrentSession(actor, id);
    return { message: "Current session changed.", revalidate: ["/", "/academics/sessions"] };
  });
}

export async function deleteSessionAction(id: string) {
  return runAction(ADMIN, async (actor) => {
    await academics.deleteSession(actor, id);
    return { message: "Academic session deleted.", revalidate: ["/academics/sessions"] };
  });
}

export async function createClassAction(values: FormValues) {
  return runAction(ADMIN, async (actor) => {
    await academics.createClass(actor, values);
    return { message: "Class created.", revalidate: ["/academics/classes"] };
  });
}

export async function updateClassAction(id: string, values: FormValues) {
  return runAction(ADMIN, async (actor) => {
    await academics.updateClass(actor, id, values);
    return { message: "Class updated.", revalidate: ["/academics/classes"] };
  });
}

export async function deleteClassAction(id: string) {
  return runAction(ADMIN, async (actor) => {
    await academics.deleteClass(actor, id);
    return { message: "Class deleted.", revalidate: ["/academics/classes"] };
  });
}

export async function createSectionAction(values: FormValues) {
  return runAction(ADMIN, async (actor) => {
    await academics.createSection(actor, values);
    return { message: "Section created.", revalidate: ["/academics/classes"] };
  });
}

export async function updateSectionAction(id: string, values: FormValues) {
  return runAction(ADMIN, async (actor) => {
    await academics.updateSection(actor, id, values);
    return { message: "Section updated.", revalidate: ["/academics/classes"] };
  });
}

export async function deleteSectionAction(id: string) {
  return runAction(ADMIN, async (actor) => {
    await academics.deleteSection(actor, id);
    return { message: "Section deleted.", revalidate: ["/academics/classes"] };
  });
}

export async function createSubjectAction(values: FormValues) {
  return runAction(ADMIN, async (actor) => {
    await academics.createSubject(actor, values);
    return { message: "Subject created.", revalidate: ["/academics/subjects"] };
  });
}

export async function updateSubjectAction(id: string, values: FormValues) {
  return runAction(ADMIN, async (actor) => {
    await academics.updateSubject(actor, id, values);
    return { message: "Subject updated.", revalidate: ["/academics/subjects"] };
  });
}

export async function deleteSubjectAction(id: string) {
  return runAction(ADMIN, async (actor) => {
    await academics.deleteSubject(actor, id);
    return { message: "Subject deleted.", revalidate: ["/academics/subjects"] };
  });
}

export async function createAssignmentAction(values: FormValues) {
  return runAction(ADMIN, async (actor) => {
    await academics.createAssignment(actor, values);
    return { message: "Teacher assigned.", revalidate: ["/academics/assignments"] };
  });
}

export async function deleteAssignmentAction(id: string) {
  return runAction(ADMIN, async (actor) => {
    await academics.deleteAssignment(actor, id);
    return { message: "Assignment removed.", revalidate: ["/academics/assignments"] };
  });
}

import { Role } from "@/generated/prisma/enums";
import { forbidden, notFound } from "@/lib/errors";
import { prisma, type Db } from "@/server/db";
import type { Actor } from "./actor";

/**
 * Central authorization rules. Services call these before touching data.
 *
 *  ADMIN   – full access.
 *  TEACHER – sections where they are class teacher or have a teaching assignment;
 *            marks only for the (section, subject) pairs they are assigned to.
 *  STUDENT – only their own records.
 *
 * Record-level denials for teachers/students raise NOT_FOUND rather than FORBIDDEN so
 * that probing IDs does not reveal whether another student's record exists (IDOR).
 */

export function assertRole(actor: Actor, ...roles: Role[]): void {
  if (!roles.includes(actor.role)) throw forbidden();
}

export function isAdmin(actor: Actor): boolean {
  return actor.role === Role.ADMIN;
}

/** IDs of sections a teacher may work with. */
export async function teacherSectionIds(teacherId: string, db: Db = prisma): Promise<string[]> {
  // Sequential on purpose: `db` may be a transaction client, which runs one query at a time.
  const assigned = await db.teachingAssignment.findMany({ where: { teacherId }, select: { sectionId: true } });
  const classTeacherOf = await db.section.findMany({ where: { classTeacherId: teacherId }, select: { id: true } });
  return [...new Set([...assigned.map((a) => a.sectionId), ...classTeacherOf.map((s) => s.id)])];
}

/** Section IDs visible to the actor, or null meaning "all sections" (admin). */
export async function visibleSectionIds(actor: Actor, db: Db = prisma): Promise<string[] | null> {
  if (actor.role === Role.ADMIN) return null;
  if (actor.role === Role.TEACHER && actor.teacherId) return teacherSectionIds(actor.teacherId, db);
  return [];
}

export async function assertSectionAccess(actor: Actor, sectionId: string, db: Db = prisma) {
  if (actor.role === Role.ADMIN) return;
  if (actor.role !== Role.TEACHER || !actor.teacherId) throw forbidden();
  const ids = await teacherSectionIds(actor.teacherId, db);
  if (!ids.includes(sectionId)) throw forbidden("You are not assigned to this class section.");
}

/** Marks entry: admins, or the teacher assigned to teach this subject in this section. */
export async function assertSubjectTeachingAccess(actor: Actor, sectionId: string, subjectId: string, db: Db = prisma) {
  if (actor.role === Role.ADMIN) return;
  if (actor.role !== Role.TEACHER || !actor.teacherId) throw forbidden();
  const assignment = await db.teachingAssignment.findFirst({
    where: { teacherId: actor.teacherId, sectionId, subjectId },
    select: { id: true },
  });
  if (!assignment) throw forbidden("You are not assigned to teach this subject in this section.");
}

/** Read access to a single student's records. */
export async function assertStudentAccess(actor: Actor, studentId: string, db: Db = prisma) {
  if (actor.role === Role.ADMIN) return;
  if (actor.role === Role.STUDENT) {
    if (actor.studentId !== studentId) throw notFound("Student");
    return;
  }
  if (actor.role === Role.TEACHER && actor.teacherId) {
    const student = await db.studentProfile.findUnique({
      where: { id: studentId },
      select: { sectionId: true },
    });
    const ids = await teacherSectionIds(actor.teacherId, db);
    if (!student?.sectionId || !ids.includes(student.sectionId)) throw notFound("Student");
    return;
  }
  throw notFound("Student");
}

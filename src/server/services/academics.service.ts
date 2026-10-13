import type { Prisma } from "@/generated/prisma/client";
import { Role, TeacherStatus } from "@/generated/prisma/enums";
import { conflict, invalid, notFound, parseInput } from "@/lib/errors";
import { sectionLabel } from "@/lib/utils/format";
import {
  academicSessionSchema,
  assignmentSchema,
  classSchema,
  sectionSchema,
  subjectSchema,
} from "@/lib/validation/academics";
import type { Actor } from "@/server/auth/actor";
import { assertRole, visibleSectionIds } from "@/server/auth/policy";
import { prisma, type Db } from "@/server/db";
import { sectionWithClassSelect } from "@/server/repositories/selects";
import { recordAudit } from "./audit.service";

// ───────────── Academic sessions ─────────────

export async function getCurrentSession(db: Db = prisma) {
  return db.academicSession.findFirst({
    where: { isCurrent: true },
    orderBy: { startDate: "desc" },
  });
}

export async function listSessions(db: Db = prisma) {
  return db.academicSession.findMany({
    orderBy: { startDate: "desc" },
    include: { _count: { select: { sections: true, exams: true, invoices: true } } },
  });
}

async function assertNoOverlap(db: Db, startDate: Date, endDate: Date, exceptId?: string) {
  const overlapping = await db.academicSession.findFirst({
    where: {
      startDate: { lt: endDate },
      endDate: { gt: startDate },
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
    select: { name: true },
  });
  if (overlapping) {
    throw invalid(`Dates overlap with session ${overlapping.name}.`, {
      startDate: ["Overlaps an existing session."],
    });
  }
}

export async function createSession(actor: Actor, input: unknown) {
  assertRole(actor, Role.ADMIN);
  const data = parseInput(academicSessionSchema, input);
  return prisma.$transaction(async (tx) => {
    if (await tx.academicSession.findUnique({ where: { name: data.name } })) {
      throw conflict("A session with this name already exists.", { name: ["Name is taken."] });
    }
    await assertNoOverlap(tx, data.startDate, data.endDate);
    const hasCurrent = (await tx.academicSession.count({ where: { isCurrent: true } })) > 0;
    const makeCurrent = data.isCurrent || !hasCurrent;
    if (makeCurrent) await tx.academicSession.updateMany({ data: { isCurrent: false } });
    const session = await tx.academicSession.create({ data: { ...data, isCurrent: makeCurrent } });
    await recordAudit(tx, actor, {
      action: "academicSession.created",
      entityType: "AcademicSession",
      entityId: session.id,
      summary: `Created academic session ${session.name}`,
    });
    return session;
  });
}

export async function updateSession(actor: Actor, id: string, input: unknown) {
  assertRole(actor, Role.ADMIN);
  const data = parseInput(academicSessionSchema, input);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.academicSession.findUnique({ where: { id } });
    if (!existing) throw notFound("Academic session");
    const sameName = await tx.academicSession.findUnique({ where: { name: data.name } });
    if (sameName && sameName.id !== id) {
      throw conflict("A session with this name already exists.", { name: ["Name is taken."] });
    }
    await assertNoOverlap(tx, data.startDate, data.endDate, id);
    if (data.isCurrent) await tx.academicSession.updateMany({ data: { isCurrent: false } });
    // The current session can only be changed by making another session current.
    const session = await tx.academicSession.update({
      where: { id },
      data: { ...data, isCurrent: data.isCurrent || existing.isCurrent },
    });
    await recordAudit(tx, actor, {
      action: "academicSession.updated",
      entityType: "AcademicSession",
      entityId: id,
      summary: `Updated academic session ${session.name}`,
    });
    return session;
  });
}

export async function setCurrentSession(actor: Actor, id: string) {
  assertRole(actor, Role.ADMIN);
  return prisma.$transaction(async (tx) => {
    const session = await tx.academicSession.findUnique({ where: { id } });
    if (!session) throw notFound("Academic session");
    await tx.academicSession.updateMany({ data: { isCurrent: false } });
    await tx.academicSession.update({ where: { id }, data: { isCurrent: true } });
    await recordAudit(tx, actor, {
      action: "academicSession.setCurrent",
      entityType: "AcademicSession",
      entityId: id,
      summary: `Set ${session.name} as the current academic session`,
    });
  });
}

export async function deleteSession(actor: Actor, id: string) {
  assertRole(actor, Role.ADMIN);
  return prisma.$transaction(async (tx) => {
    const session = await tx.academicSession.findUnique({
      where: { id },
      include: { _count: { select: { sections: true, exams: true, invoices: true, feeStructures: true } } },
    });
    if (!session) throw notFound("Academic session");
    const { sections, exams, invoices, feeStructures } = session._count;
    if (sections + exams + invoices + feeStructures > 0) {
      throw conflict("This session has sections, exams or fees and cannot be deleted.");
    }
    if (session.isCurrent) throw conflict("Make another session current before deleting this one.");
    await tx.academicSession.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: "academicSession.deleted",
      entityType: "AcademicSession",
      entityId: id,
      summary: `Deleted academic session ${session.name}`,
    });
  });
}

// ───────────── Classes ─────────────

export async function listClasses(db: Db = prisma) {
  return db.schoolClass.findMany({
    orderBy: { level: "asc" },
    include: { _count: { select: { sections: true, exams: true } } },
  });
}

async function assertClassUnique(db: Db, name: string, level: number, exceptId?: string) {
  const clash = await db.schoolClass.findFirst({
    where: {
      OR: [{ name: { equals: name, mode: "insensitive" } }, { level }],
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
  });
  if (clash) {
    throw conflict("Another class already uses this name or level.", {
      ...(clash.name.toLowerCase() === name.toLowerCase() ? { name: ["Name is taken."] } : {}),
      ...(clash.level === level ? { level: ["Level is taken."] } : {}),
    });
  }
}

export async function createClass(actor: Actor, input: unknown) {
  assertRole(actor, Role.ADMIN);
  const data = parseInput(classSchema, input);
  return prisma.$transaction(async (tx) => {
    await assertClassUnique(tx, data.name, data.level);
    const created = await tx.schoolClass.create({ data });
    await recordAudit(tx, actor, {
      action: "class.created",
      entityType: "Class",
      entityId: created.id,
      summary: `Created class ${created.name}`,
    });
    return created;
  });
}

export async function updateClass(actor: Actor, id: string, input: unknown) {
  assertRole(actor, Role.ADMIN);
  const data = parseInput(classSchema, input);
  return prisma.$transaction(async (tx) => {
    if (!(await tx.schoolClass.findUnique({ where: { id } }))) throw notFound("Class");
    await assertClassUnique(tx, data.name, data.level, id);
    const updated = await tx.schoolClass.update({ where: { id }, data });
    await recordAudit(tx, actor, {
      action: "class.updated",
      entityType: "Class",
      entityId: id,
      summary: `Updated class ${updated.name}`,
    });
    return updated;
  });
}

export async function deleteClass(actor: Actor, id: string) {
  assertRole(actor, Role.ADMIN);
  return prisma.$transaction(async (tx) => {
    const found = await tx.schoolClass.findUnique({
      where: { id },
      include: { _count: { select: { sections: true, exams: true, feeStructures: true } } },
    });
    if (!found) throw notFound("Class");
    if (found._count.sections + found._count.exams + found._count.feeStructures > 0) {
      throw conflict("Remove this class's sections, exams and fees before deleting it.");
    }
    await tx.schoolClass.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: "class.deleted",
      entityType: "Class",
      entityId: id,
      summary: `Deleted class ${found.name}`,
    });
  });
}

// ───────────── Sections ─────────────

export async function listSections(filters: { academicSessionId?: string } = {}, db: Db = prisma) {
  return db.section.findMany({
    where: filters.academicSessionId ? { academicSessionId: filters.academicSessionId } : {},
    orderBy: [{ academicSession: { startDate: "desc" } }, { class: { level: "asc" } }, { name: "asc" }],
    include: {
      class: { select: { id: true, name: true, level: true } },
      academicSession: { select: { id: true, name: true, isCurrent: true } },
      classTeacher: { select: { id: true, firstName: true, lastName: true } },
      _count: { select: { students: true, assignments: true } },
    },
  });
}

async function validateSectionRefs(
  db: Db,
  data: { classId: string; academicSessionId: string; classTeacherId: string | null },
) {
  const klass = await db.schoolClass.findUnique({ where: { id: data.classId }, select: { id: true } });
  const session = await db.academicSession.findUnique({ where: { id: data.academicSessionId }, select: { id: true } });
  const teacher = data.classTeacherId
    ? await db.teacherProfile.findUnique({ where: { id: data.classTeacherId }, select: { status: true } })
    : null;
  if (!klass) throw invalid("Choose a valid class.", { classId: ["Class not found."] });
  if (!session) throw invalid("Choose a valid session.", { academicSessionId: ["Session not found."] });
  if (data.classTeacherId && teacher?.status !== TeacherStatus.ACTIVE) {
    throw invalid("The class teacher must be an active teacher.", {
      classTeacherId: ["Choose an active teacher."],
    });
  }
}

async function assertSectionUnique(
  db: Db,
  data: { classId: string; academicSessionId: string; name: string },
  exceptId?: string,
) {
  const clash = await db.section.findFirst({
    where: {
      classId: data.classId,
      academicSessionId: data.academicSessionId,
      name: data.name,
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
  });
  if (clash)
    throw conflict("This class already has a section with that name in this session.", { name: ["Section exists."] });
}

export async function createSection(actor: Actor, input: unknown) {
  assertRole(actor, Role.ADMIN);
  const data = parseInput(sectionSchema, input);
  return prisma.$transaction(async (tx) => {
    await validateSectionRefs(tx, data);
    await assertSectionUnique(tx, data);
    const section = await tx.section.create({ data, include: { class: true } });
    await recordAudit(tx, actor, {
      action: "section.created",
      entityType: "Section",
      entityId: section.id,
      summary: `Created section ${sectionLabel(section)}`,
    });
    return section;
  });
}

export async function updateSection(actor: Actor, id: string, input: unknown) {
  assertRole(actor, Role.ADMIN);
  const data = parseInput(sectionSchema, input);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.section.findUnique({
      where: { id },
      include: { _count: { select: { students: true, attendance: true } } },
    });
    if (!existing) throw notFound("Section");
    const movesClassOrSession =
      existing.classId !== data.classId || existing.academicSessionId !== data.academicSessionId;
    if (movesClassOrSession && existing._count.students + existing._count.attendance > 0) {
      throw conflict("A section with students or attendance cannot be moved to another class or session.");
    }
    if (data.capacity !== null && existing._count.students > data.capacity) {
      throw invalid("Capacity is lower than the number of enrolled students.", { capacity: ["Too small."] });
    }
    await validateSectionRefs(tx, data);
    await assertSectionUnique(tx, data, id);
    const section = await tx.section.update({ where: { id }, data, include: { class: true } });
    await recordAudit(tx, actor, {
      action: "section.updated",
      entityType: "Section",
      entityId: id,
      summary: `Updated section ${sectionLabel(section)}`,
    });
    return section;
  });
}

export async function deleteSection(actor: Actor, id: string) {
  assertRole(actor, Role.ADMIN);
  return prisma.$transaction(async (tx) => {
    const section = await tx.section.findUnique({
      where: { id },
      include: { class: true, _count: { select: { students: true, attendance: true, assignments: true } } },
    });
    if (!section) throw notFound("Section");
    if (section._count.students + section._count.attendance + section._count.assignments > 0) {
      throw conflict("Sections with students, attendance or teaching assignments cannot be deleted.");
    }
    await tx.section.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: "section.deleted",
      entityType: "Section",
      entityId: id,
      summary: `Deleted section ${sectionLabel(section)}`,
    });
  });
}

/** Sections the actor may work with, for dropdowns (current session by default). */
export async function sectionOptions(actor: Actor, opts: { academicSessionId?: string; allSessions?: boolean } = {}) {
  const visible = await visibleSectionIds(actor);
  const current = opts.academicSessionId || opts.allSessions ? null : await getCurrentSession();
  const where: Prisma.SectionWhereInput = {
    ...(visible ? { id: { in: visible } } : {}),
    ...(opts.academicSessionId ? { academicSessionId: opts.academicSessionId } : {}),
    ...(current ? { academicSessionId: current.id } : {}),
  };
  const sections = await prisma.section.findMany({
    where,
    select: sectionWithClassSelect,
    orderBy: [{ academicSession: { startDate: "desc" } }, { class: { level: "asc" } }, { name: "asc" }],
  });
  return sections.map((s) => ({
    id: s.id,
    label: opts.allSessions ? `${sectionLabel(s)} (${s.academicSession.name})` : sectionLabel(s),
    classId: s.classId,
    academicSessionId: s.academicSessionId,
  }));
}

// ───────────── Subjects ─────────────

export async function listSubjects(opts: { activeOnly?: boolean } = {}, db: Db = prisma) {
  return db.subject.findMany({
    where: opts.activeOnly ? { isActive: true } : {},
    orderBy: { name: "asc" },
    include: { _count: { select: { assignments: true, examSubjects: true } } },
  });
}

export async function createSubject(actor: Actor, input: unknown) {
  assertRole(actor, Role.ADMIN);
  const data = parseInput(subjectSchema, input);
  return prisma.$transaction(async (tx) => {
    if (await tx.subject.findUnique({ where: { code: data.code } })) {
      throw conflict("A subject with this code already exists.", { code: ["Code is taken."] });
    }
    const subject = await tx.subject.create({ data });
    await recordAudit(tx, actor, {
      action: "subject.created",
      entityType: "Subject",
      entityId: subject.id,
      summary: `Created subject ${subject.code} ${subject.name}`,
    });
    return subject;
  });
}

export async function updateSubject(actor: Actor, id: string, input: unknown) {
  assertRole(actor, Role.ADMIN);
  const data = parseInput(subjectSchema, input);
  return prisma.$transaction(async (tx) => {
    if (!(await tx.subject.findUnique({ where: { id } }))) throw notFound("Subject");
    const clash = await tx.subject.findUnique({ where: { code: data.code } });
    if (clash && clash.id !== id)
      throw conflict("A subject with this code already exists.", { code: ["Code is taken."] });
    const subject = await tx.subject.update({ where: { id }, data });
    await recordAudit(tx, actor, {
      action: "subject.updated",
      entityType: "Subject",
      entityId: id,
      summary: `Updated subject ${subject.code} ${subject.name}`,
    });
    return subject;
  });
}

export async function deleteSubject(actor: Actor, id: string) {
  assertRole(actor, Role.ADMIN);
  return prisma.$transaction(async (tx) => {
    const subject = await tx.subject.findUnique({
      where: { id },
      include: { _count: { select: { assignments: true, examSubjects: true } } },
    });
    if (!subject) throw notFound("Subject");
    if (subject._count.assignments + subject._count.examSubjects > 0) {
      throw conflict("This subject is used by assignments or exams. Mark it inactive instead.");
    }
    await tx.subject.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: "subject.deleted",
      entityType: "Subject",
      entityId: id,
      summary: `Deleted subject ${subject.code}`,
    });
  });
}

// ───────────── Teaching assignments ─────────────

export async function listAssignments(filters: { academicSessionId?: string; teacherId?: string } = {}) {
  return prisma.teachingAssignment.findMany({
    where: {
      ...(filters.teacherId ? { teacherId: filters.teacherId } : {}),
      ...(filters.academicSessionId ? { section: { academicSessionId: filters.academicSessionId } } : {}),
    },
    orderBy: [{ section: { class: { level: "asc" } } }, { section: { name: "asc" } }, { subject: { name: "asc" } }],
    include: {
      teacher: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
      subject: { select: { id: true, code: true, name: true } },
      section: { select: sectionWithClassSelect },
    },
  });
}

export async function createAssignment(actor: Actor, input: unknown) {
  assertRole(actor, Role.ADMIN);
  const data = parseInput(assignmentSchema, input);
  return prisma.$transaction(async (tx) => {
    const teacher = await tx.teacherProfile.findUnique({ where: { id: data.teacherId } });
    const section = await tx.section.findUnique({ where: { id: data.sectionId }, include: { class: true } });
    const subject = await tx.subject.findUnique({ where: { id: data.subjectId } });
    if (!teacher || teacher.status !== TeacherStatus.ACTIVE) {
      throw invalid("Choose an active teacher.", { teacherId: ["Teacher is not active."] });
    }
    if (!section) throw invalid("Choose a valid section.", { sectionId: ["Section not found."] });
    if (!subject || !subject.isActive)
      throw invalid("Choose an active subject.", { subjectId: ["Subject is not active."] });
    const existing = await tx.teachingAssignment.findUnique({
      where: { sectionId_subjectId: { sectionId: data.sectionId, subjectId: data.subjectId } },
      include: { teacher: true },
    });
    if (existing) {
      throw conflict(
        `${subject.name} in ${sectionLabel(section)} is already assigned to ${existing.teacher.firstName} ${existing.teacher.lastName}.`,
        { subjectId: ["Already assigned for this section."] },
      );
    }
    const assignment = await tx.teachingAssignment.create({ data });
    await recordAudit(tx, actor, {
      action: "assignment.created",
      entityType: "TeachingAssignment",
      entityId: assignment.id,
      summary: `Assigned ${teacher.firstName} ${teacher.lastName} to ${subject.name} in ${sectionLabel(section)}`,
    });
    return assignment;
  });
}

export async function deleteAssignment(actor: Actor, id: string) {
  assertRole(actor, Role.ADMIN);
  return prisma.$transaction(async (tx) => {
    const assignment = await tx.teachingAssignment.findUnique({
      where: { id },
      include: { teacher: true, subject: true, section: { include: { class: true } } },
    });
    if (!assignment) throw notFound("Assignment");
    await tx.teachingAssignment.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: "assignment.deleted",
      entityType: "TeachingAssignment",
      entityId: id,
      summary: `Removed ${assignment.teacher.firstName} ${assignment.teacher.lastName} from ${assignment.subject.name} in ${sectionLabel(assignment.section)}`,
    });
  });
}

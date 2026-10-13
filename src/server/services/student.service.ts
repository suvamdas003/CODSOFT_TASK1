import { hashPassword } from "better-auth/crypto";
import type { Prisma } from "@/generated/prisma/client";
import { Role, StudentStatus } from "@/generated/prisma/enums";
import { conflict, forbidden, invalid, notFound, parseInput } from "@/lib/errors";
import { fullName } from "@/lib/utils/format";
import { paginated, type Pagination } from "@/lib/utils/pagination";
import { createStudentSchema, updateStudentSchema, type UpdateStudentInput } from "@/lib/validation/people";
import type { Actor } from "@/server/auth/actor";
import { assertRole, assertStudentAccess, visibleSectionIds } from "@/server/auth/policy";
import { prisma, type Db } from "@/server/db";
import { studentDetailSelect, studentListSelect } from "@/server/repositories/selects";
import { recordAudit } from "./audit.service";
import { assertEmailAvailable, createLoginUser, revokeSessions } from "./user.service";

export type StudentFilters = {
  q?: string;
  sectionId?: string;
  classId?: string;
  status?: StudentStatus;
};

/** Search / filter / paginate students visible to the actor. */
export async function listStudents(actor: Actor, filters: StudentFilters, pagination: Pagination) {
  assertRole(actor, Role.ADMIN, Role.TEACHER);
  const visible = await visibleSectionIds(actor);
  const where: Prisma.StudentProfileWhereInput = {
    AND: [
      visible ? { sectionId: { in: visible } } : {},
      filters.sectionId ? { sectionId: filters.sectionId } : {},
      filters.classId ? { section: { classId: filters.classId } } : {},
      filters.status ? { status: filters.status } : {},
      filters.q
        ? {
            OR: [
              { firstName: { contains: filters.q, mode: "insensitive" } },
              { lastName: { contains: filters.q, mode: "insensitive" } },
              { admissionNumber: { contains: filters.q, mode: "insensitive" } },
              { guardianName: { contains: filters.q, mode: "insensitive" } },
            ],
          }
        : {},
    ],
  };
  const [items, total] = await Promise.all([
    prisma.studentProfile.findMany({
      where,
      select: studentListSelect,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.studentProfile.count({ where }),
  ]);
  return paginated(items, total, pagination);
}

export async function getStudent(actor: Actor, studentId: string) {
  await assertStudentAccess(actor, studentId);
  const student = await prisma.studentProfile.findUnique({
    where: { id: studentId },
    select: studentDetailSelect,
  });
  if (!student) throw notFound("Student");
  return student;
}

export type StudentDetail = Awaited<ReturnType<typeof getStudent>>;

/** Validate uniqueness and section rules shared by create and update. */
async function validateStudent(
  db: Db,
  data: Pick<UpdateStudentInput, "admissionNumber" | "email" | "sectionId" | "status">,
  existing?: { id: string; userId: string; sectionId: string | null },
) {
  const sameAdmission = await db.studentProfile.findUnique({
    where: { admissionNumber: data.admissionNumber },
    select: { id: true },
  });
  if (sameAdmission && sameAdmission.id !== existing?.id) {
    throw conflict("Another student already has this admission number.", {
      admissionNumber: ["Admission number must be unique."],
    });
  }
  await assertEmailAvailable(db, data.email, existing?.userId);

  if (data.sectionId) {
    const section = await db.section.findUnique({
      where: { id: data.sectionId },
      select: { capacity: true, _count: { select: { students: { where: { status: StudentStatus.ACTIVE } } } } },
    });
    if (!section) throw invalid("Choose a valid class section.", { sectionId: ["Section not found."] });
    const joining = data.status === StudentStatus.ACTIVE && existing?.sectionId !== data.sectionId;
    if (joining && section.capacity !== null && section._count.students >= section.capacity) {
      throw invalid("This section is full.", { sectionId: ["Section has reached its capacity."] });
    }
  }
}

const profileData = (data: UpdateStudentInput) => ({
  admissionNumber: data.admissionNumber,
  firstName: data.firstName,
  lastName: data.lastName,
  dateOfBirth: data.dateOfBirth,
  gender: data.gender,
  phone: data.phone,
  address: data.address,
  guardianName: data.guardianName,
  guardianRelation: data.guardianRelation,
  guardianPhone: data.guardianPhone,
  guardianEmail: data.guardianEmail,
  sectionId: data.sectionId,
  enrollmentDate: data.enrollmentDate,
  status: data.status,
});

export async function createStudent(actor: Actor, input: unknown): Promise<string> {
  assertRole(actor, Role.ADMIN);
  const data = parseInput(createStudentSchema, input);
  await validateStudent(prisma, data); // fail fast before the expensive hash
  const passwordHash = await hashPassword(data.password);

  return prisma.$transaction(async (tx) => {
    await validateStudent(tx, data);
    const userId = await createLoginUser(tx, {
      name: fullName(data),
      email: data.email,
      role: Role.STUDENT,
      passwordHash,
      isActive: data.status === StudentStatus.ACTIVE,
    });
    const student = await tx.studentProfile.create({
      data: { ...profileData(data), userId },
      select: { id: true },
    });
    await recordAudit(tx, actor, {
      action: "student.created",
      entityType: "Student",
      entityId: student.id,
      summary: `Created student ${fullName(data)} (${data.admissionNumber})`,
    });
    return student.id;
  });
}

export async function updateStudent(actor: Actor, studentId: string, input: unknown) {
  assertRole(actor, Role.ADMIN);
  const data = parseInput(updateStudentSchema, input);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.studentProfile.findUnique({
      where: { id: studentId },
      select: { id: true, userId: true, sectionId: true, status: true },
    });
    if (!existing) throw notFound("Student");
    await validateStudent(tx, data, existing);

    await tx.studentProfile.update({ where: { id: studentId }, data: profileData(data) });
    // Sign-in is allowed only while the student is ACTIVE.
    const canSignIn = data.status === StudentStatus.ACTIVE;
    await tx.user.update({
      where: { id: existing.userId },
      data: { name: fullName(data), email: data.email, isActive: canSignIn },
    });
    if (!canSignIn) await revokeSessions(tx, existing.userId);

    await recordAudit(tx, actor, {
      action: "student.updated",
      entityType: "Student",
      entityId: studentId,
      summary: `Updated student ${fullName(data)} (${data.admissionNumber})`,
      metadata: existing.status !== data.status ? { statusFrom: existing.status, statusTo: data.status } : undefined,
    });
  });
}

/** Deactivate (soft-delete) or reactivate a student. History is always retained. */
export async function setStudentStatus(actor: Actor, studentId: string, status: StudentStatus) {
  assertRole(actor, Role.ADMIN);
  return prisma.$transaction(async (tx) => {
    const student = await tx.studentProfile.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        userId: true,
        firstName: true,
        lastName: true,
        admissionNumber: true,
        sectionId: true,
        status: true,
      },
    });
    if (!student) throw notFound("Student");
    if (status === StudentStatus.ACTIVE && student.sectionId) {
      const section = await tx.section.findUnique({
        where: { id: student.sectionId },
        select: { capacity: true, _count: { select: { students: { where: { status: StudentStatus.ACTIVE } } } } },
      });
      if (
        section?.capacity != null &&
        student.status !== StudentStatus.ACTIVE &&
        section._count.students >= section.capacity
      ) {
        throw invalid("The student's section is full. Move the student to another section first.");
      }
    }
    await tx.studentProfile.update({ where: { id: studentId }, data: { status } });
    await tx.user.update({ where: { id: student.userId }, data: { isActive: status === StudentStatus.ACTIVE } });
    if (status !== StudentStatus.ACTIVE) await revokeSessions(tx, student.userId);
    await recordAudit(tx, actor, {
      action: status === StudentStatus.ACTIVE ? "student.reactivated" : "student.deactivated",
      entityType: "Student",
      entityId: studentId,
      summary: `Set ${fullName(student)} (${student.admissionNumber}) to ${status}`,
    });
  });
}

/** Lightweight lookup for selects (admin only), e.g. choosing an invoice recipient. */
export async function studentOptions(actor: Actor, opts: { sectionId?: string } = {}) {
  if (actor.role !== Role.ADMIN) throw forbidden();
  const students = await prisma.studentProfile.findMany({
    where: { status: StudentStatus.ACTIVE, ...(opts.sectionId ? { sectionId: opts.sectionId } : {}) },
    select: {
      id: true,
      admissionNumber: true,
      firstName: true,
      lastName: true,
      section: { select: { classId: true, name: true, class: { select: { name: true } } } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 1000,
  });
  return students.map((s) => ({
    id: s.id,
    label: `${fullName(s)} (${s.admissionNumber})${s.section ? ` – ${s.section.class.name} ${s.section.name}` : ""}`,
    classId: s.section?.classId ?? null,
  }));
}

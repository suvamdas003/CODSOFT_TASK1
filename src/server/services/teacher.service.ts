import { hashPassword } from "better-auth/crypto";
import type { Prisma } from "@/generated/prisma/client";
import { Role, TeacherStatus } from "@/generated/prisma/enums";
import { conflict, notFound, parseInput } from "@/lib/errors";
import { fullName } from "@/lib/utils/format";
import { paginated, type Pagination } from "@/lib/utils/pagination";
import { createTeacherSchema, updateTeacherSchema, type UpdateTeacherInput } from "@/lib/validation/people";
import type { Actor } from "@/server/auth/actor";
import { assertRole } from "@/server/auth/policy";
import { prisma, type Db } from "@/server/db";
import { sectionWithClassSelect, teacherListSelect } from "@/server/repositories/selects";
import { recordAudit } from "./audit.service";
import { assertEmailAvailable, createLoginUser, revokeSessions } from "./user.service";

export async function listTeachers(
  actor: Actor,
  filters: { q?: string; status?: TeacherStatus },
  pagination: Pagination,
) {
  assertRole(actor, Role.ADMIN);
  const where: Prisma.TeacherProfileWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.q
      ? {
          OR: [
            { firstName: { contains: filters.q, mode: "insensitive" } },
            { lastName: { contains: filters.q, mode: "insensitive" } },
            { employeeId: { contains: filters.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.teacherProfile.findMany({
      where,
      select: teacherListSelect,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.teacherProfile.count({ where }),
  ]);
  return paginated(items, total, pagination);
}

export async function getTeacher(actor: Actor, teacherId: string) {
  // Teachers may view their own profile; administrators any.
  if (!(actor.role === Role.ADMIN || actor.teacherId === teacherId)) throw notFound("Teacher");
  const teacher = await prisma.teacherProfile.findUnique({
    where: { id: teacherId },
    select: {
      ...teacherListSelect,
      userId: true,
      qualification: true,
      user: { select: { email: true, isActive: true, lastLoginAt: true } },
      assignments: {
        select: {
          id: true,
          subject: { select: { code: true, name: true } },
          section: { select: sectionWithClassSelect },
        },
        orderBy: [{ section: { class: { level: "asc" } } }, { subject: { name: "asc" } }],
      },
      classSections: { select: sectionWithClassSelect },
    },
  });
  if (!teacher) throw notFound("Teacher");
  return teacher;
}

export async function teacherOptions(opts: { activeOnly?: boolean } = { activeOnly: true }) {
  const teachers = await prisma.teacherProfile.findMany({
    where: opts.activeOnly ? { status: TeacherStatus.ACTIVE } : {},
    select: { id: true, firstName: true, lastName: true, employeeId: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return teachers.map((t) => ({ id: t.id, label: `${fullName(t)} (${t.employeeId})` }));
}

async function validateTeacher(
  db: Db,
  data: Pick<UpdateTeacherInput, "employeeId" | "email">,
  existing?: { id: string; userId: string },
) {
  const same = await db.teacherProfile.findUnique({ where: { employeeId: data.employeeId }, select: { id: true } });
  if (same && same.id !== existing?.id) {
    throw conflict("Another teacher already has this employee ID.", {
      employeeId: ["Employee ID must be unique."],
    });
  }
  await assertEmailAvailable(db, data.email, existing?.userId);
}

const profileData = (data: UpdateTeacherInput) => ({
  employeeId: data.employeeId,
  firstName: data.firstName,
  lastName: data.lastName,
  phone: data.phone,
  qualification: data.qualification,
  specialization: data.specialization,
  joiningDate: data.joiningDate,
  status: data.status,
});

export async function createTeacher(actor: Actor, input: unknown): Promise<string> {
  assertRole(actor, Role.ADMIN);
  const data = parseInput(createTeacherSchema, input);
  await validateTeacher(prisma, data);
  const passwordHash = await hashPassword(data.password);
  return prisma.$transaction(async (tx) => {
    await validateTeacher(tx, data);
    const userId = await createLoginUser(tx, {
      name: fullName(data),
      email: data.email,
      role: Role.TEACHER,
      passwordHash,
      isActive: data.status === TeacherStatus.ACTIVE,
    });
    const teacher = await tx.teacherProfile.create({ data: { ...profileData(data), userId }, select: { id: true } });
    await recordAudit(tx, actor, {
      action: "teacher.created",
      entityType: "Teacher",
      entityId: teacher.id,
      summary: `Created teacher ${fullName(data)} (${data.employeeId})`,
    });
    return teacher.id;
  });
}

export async function updateTeacher(actor: Actor, teacherId: string, input: unknown) {
  assertRole(actor, Role.ADMIN);
  const data = parseInput(updateTeacherSchema, input);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.teacherProfile.findUnique({
      where: { id: teacherId },
      select: { id: true, userId: true },
    });
    if (!existing) throw notFound("Teacher");
    await validateTeacher(tx, data, existing);
    await tx.teacherProfile.update({ where: { id: teacherId }, data: profileData(data) });
    const canSignIn = data.status === TeacherStatus.ACTIVE;
    await tx.user.update({
      where: { id: existing.userId },
      data: { name: fullName(data), email: data.email, isActive: canSignIn },
    });
    if (!canSignIn) await revokeSessions(tx, existing.userId);
    await recordAudit(tx, actor, {
      action: "teacher.updated",
      entityType: "Teacher",
      entityId: teacherId,
      summary: `Updated teacher ${fullName(data)} (${data.employeeId})`,
    });
  });
}

export async function setTeacherStatus(actor: Actor, teacherId: string, status: TeacherStatus) {
  assertRole(actor, Role.ADMIN);
  return prisma.$transaction(async (tx) => {
    const teacher = await tx.teacherProfile.findUnique({ where: { id: teacherId } });
    if (!teacher) throw notFound("Teacher");
    await tx.teacherProfile.update({ where: { id: teacherId }, data: { status } });
    await tx.user.update({ where: { id: teacher.userId }, data: { isActive: status === TeacherStatus.ACTIVE } });
    if (status !== TeacherStatus.ACTIVE) await revokeSessions(tx, teacher.userId);
    await recordAudit(tx, actor, {
      action: status === TeacherStatus.ACTIVE ? "teacher.reactivated" : "teacher.deactivated",
      entityType: "Teacher",
      entityId: teacherId,
      summary: `Set ${fullName(teacher)} (${teacher.employeeId}) to ${status}`,
    });
  });
}

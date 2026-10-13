import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { Prisma } from "@/generated/prisma/client";
import { Role, StudentStatus, TeacherStatus } from "@/generated/prisma/enums";
import { conflict, invalid, notFound, parseInput } from "@/lib/errors";
import { paginated, type Pagination } from "@/lib/utils/pagination";
import { createAdminSchema, resetPasswordSchema } from "@/lib/validation/users";
import type { Actor } from "@/server/auth/actor";
import { assertRole } from "@/server/auth/policy";
import { clearFailedSignIns } from "@/server/auth/sign-in-throttle";
import { prisma, type Db } from "@/server/db";
import { userAccountSelect } from "@/server/repositories/selects";
import { recordAudit } from "./audit.service";

/** Better Auth's provider id for email + password accounts. */
export const CREDENTIAL_PROVIDER = "credential";

export async function assertEmailAvailable(db: Db, email: string, exceptUserId?: string) {
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing && existing.id !== exceptUserId) {
    throw conflict("This email address is already used by another account.", {
      email: ["Email is already in use."],
    });
  }
}

/**
 * Create a login (User + credential Account) inside a transaction. The password must be
 * hashed beforehand with hashPassword() — hashing is CPU-heavy and must not hold a
 * transaction open. The hash is never returned.
 */
export async function createLoginUser(
  tx: Db,
  data: { name: string; email: string; role: Role; passwordHash: string; isActive?: boolean },
) {
  const id = randomUUID();
  await tx.user.create({
    data: {
      id,
      name: data.name,
      email: data.email,
      role: data.role,
      isActive: data.isActive ?? true,
      emailVerified: true,
      accounts: {
        create: { providerId: CREDENTIAL_PROVIDER, accountId: id, password: data.passwordHash },
      },
    },
    select: { id: true },
  });
  return id;
}

/** Revoke every session of a user (used on deactivation and password resets). */
export async function revokeSessions(db: Db, userId: string) {
  await db.session.deleteMany({ where: { userId } });
}

export async function listUsers(
  actor: Actor,
  filters: { q?: string; role?: Role; active?: boolean },
  pagination: Pagination,
) {
  assertRole(actor, Role.ADMIN);
  const where: Prisma.UserWhereInput = {
    ...(filters.role ? { role: filters.role } : {}),
    ...(filters.active === undefined ? {} : { isActive: filters.active }),
    ...(filters.q
      ? {
          OR: [
            { name: { contains: filters.q, mode: "insensitive" } },
            { email: { contains: filters.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: userAccountSelect,
      orderBy: [{ role: "asc" }, { name: "asc" }],
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.user.count({ where }),
  ]);
  return paginated(items, total, pagination);
}

export async function createAdminUser(actor: Actor, input: unknown) {
  assertRole(actor, Role.ADMIN);
  const data = parseInput(createAdminSchema, input);
  await assertEmailAvailable(prisma, data.email);
  const passwordHash = await hashPassword(data.password);
  return prisma.$transaction(async (tx) => {
    await assertEmailAvailable(tx, data.email);
    const userId = await createLoginUser(tx, {
      name: data.name,
      email: data.email,
      role: Role.ADMIN,
      passwordHash,
    });
    await recordAudit(tx, actor, {
      action: "user.created",
      entityType: "User",
      entityId: userId,
      summary: `Created administrator account ${data.email}`,
    });
    return userId;
  });
}

/** Enable or disable sign-in for any account. Disabling also ends active sessions. */
export async function setUserActive(actor: Actor, userId: string, isActive: boolean) {
  assertRole(actor, Role.ADMIN);
  if (userId === actor.userId && !isActive) {
    throw invalid("You cannot deactivate your own account.");
  }
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        studentProfile: { select: { status: true } },
        teacherProfile: { select: { status: true } },
      },
    });
    if (!user) throw notFound("User");
    // Sign-in follows the profile status; enabling it here would bypass a deactivation.
    if (isActive && user.studentProfile && user.studentProfile.status !== StudentStatus.ACTIVE) {
      throw invalid("This student is not active. Reactivate the student record to restore sign-in.");
    }
    if (isActive && user.teacherProfile && user.teacherProfile.status !== TeacherStatus.ACTIVE) {
      throw invalid("This teacher is not active. Reactivate the teacher record to restore sign-in.");
    }
    if (!isActive && user.role === Role.ADMIN) {
      const activeAdmins = await tx.user.count({ where: { role: Role.ADMIN, isActive: true } });
      if (activeAdmins <= 1) throw invalid("At least one active administrator is required.");
    }
    await tx.user.update({ where: { id: userId }, data: { isActive } });
    if (!isActive) await revokeSessions(tx, userId);
    await recordAudit(tx, actor, {
      action: isActive ? "user.activated" : "user.deactivated",
      entityType: "User",
      entityId: userId,
      summary: `${isActive ? "Activated" : "Deactivated"} sign-in for ${user.email}`,
    });
  });
}

/** Administrator password reset. Signs the user out everywhere. */
export async function resetUserPassword(actor: Actor, input: unknown) {
  assertRole(actor, Role.ADMIN);
  const data = parseInput(resetPasswordSchema, input);
  const passwordHash = await hashPassword(data.password);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: data.userId }, select: { id: true, email: true } });
    if (!user) throw notFound("User");
    const updated = await tx.account.updateMany({
      where: { userId: user.id, providerId: CREDENTIAL_PROVIDER },
      data: { password: passwordHash },
    });
    if (updated.count === 0) {
      await tx.account.create({
        data: { userId: user.id, providerId: CREDENTIAL_PROVIDER, accountId: user.id, password: passwordHash },
      });
    }
    await revokeSessions(tx, user.id);
    await clearFailedSignIns(tx, user.email);
    await recordAudit(tx, actor, {
      action: "user.passwordReset",
      entityType: "User",
      entityId: user.id,
      summary: `Reset password for ${user.email}`,
    });
  });
}

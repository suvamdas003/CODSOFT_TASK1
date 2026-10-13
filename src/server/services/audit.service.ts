import type { Prisma } from "@/generated/prisma/client";
import { Role } from "@/generated/prisma/enums";
import { paginated, type Pagination } from "@/lib/utils/pagination";
import type { Actor } from "@/server/auth/actor";
import { assertRole } from "@/server/auth/policy";
import { prisma, type Db } from "@/server/db";

export type AuditEntry = {
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  /** Never include passwords, hashes, tokens or other secrets. */
  metadata?: Prisma.InputJsonValue;
};

/** Append an audit event. Pass the transaction client so the event commits atomically. */
export async function recordAudit(db: Db, actor: Actor | null, entry: AuditEntry) {
  await db.auditLog.create({
    data: {
      actorId: actor?.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      summary: entry.summary,
      metadata: entry.metadata,
    },
  });
}

export async function listAuditLogs(
  actor: Actor,
  filters: { entityType?: string; q?: string },
  pagination: Pagination,
) {
  assertRole(actor, Role.ADMIN);
  const where: Prisma.AuditLogWhereInput = {
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.q
      ? {
          OR: [
            { summary: { contains: filters.q, mode: "insensitive" } },
            { action: { contains: filters.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        summary: true,
        createdAt: true,
        actor: { select: { name: true, role: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return paginated(items, total, pagination);
}

export async function listAuditEntityTypes(actor: Actor): Promise<string[]> {
  assertRole(actor, Role.ADMIN);
  const rows = await prisma.auditLog.findMany({
    distinct: ["entityType"],
    select: { entityType: true },
    orderBy: { entityType: "asc" },
  });
  return rows.map((r) => r.entityType);
}

export async function recentActivity(actor: Actor, take = 8) {
  assertRole(actor, Role.ADMIN);
  return prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      summary: true,
      createdAt: true,
      entityType: true,
      actor: { select: { name: true } },
    },
  });
}

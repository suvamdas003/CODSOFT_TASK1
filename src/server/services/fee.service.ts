import type { Prisma } from "@/generated/prisma/client";
import { InvoiceStatus, Role, StudentStatus } from "@/generated/prisma/enums";
import { conflict, forbidden, invalid, notFound, parseInput } from "@/lib/errors";
import { addDays, todayDateOnly } from "@/lib/utils/dates";
import { invoiceStatusFor, isOverdue, outstandingMinor } from "@/lib/utils/fees";
import { fullName, sectionLabel } from "@/lib/utils/format";
import { formatMoney, parseMoneyToMinor } from "@/lib/utils/money";
import { paginated, type Pagination } from "@/lib/utils/pagination";
import {
  cancelInvoiceSchema,
  createInvoiceSchema,
  feeStructureSchema,
  generateInvoicesSchema,
  recordPaymentSchema,
} from "@/lib/validation/fees";
import type { Actor } from "@/server/auth/actor";
import { assertRole, assertStudentAccess } from "@/server/auth/policy";
import { prisma, type Db } from "@/server/db";
import { nextDocumentNumber } from "@/server/repositories/sequence.repository";
import { recordAudit } from "./audit.service";
import { getCurrentSession } from "./academics.service";
import { getSettings } from "./settings.service";

const OPEN_STATUSES = [InvoiceStatus.UNPAID, InvoiceStatus.PARTIALLY_PAID];
const MAX_INVOICE_TOTAL_MINOR = 2_000_000_000;

async function toMinorOrThrow(amount: string, field: string, db: Db = prisma) {
  const { currencyCode } = await getSettings(db);
  const minor = parseMoneyToMinor(amount, currencyCode);
  if (minor === null || minor <= 0) {
    throw invalid("Enter a valid positive amount.", { [field]: ["Enter a valid positive amount for the currency."] });
  }
  return minor;
}

/** Serialize concurrent invoice creation for a fee structure (transaction-scoped lock). */
async function lockKey(tx: Db, key: string) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${key}))`;
}

// ───────────── Fee structures ─────────────

export async function listFeeStructures(actor: Actor, filters: { academicSessionId?: string } = {}) {
  assertRole(actor, Role.ADMIN);
  return prisma.feeStructure.findMany({
    where: filters.academicSessionId ? { academicSessionId: filters.academicSessionId } : {},
    include: {
      class: { select: { id: true, name: true } },
      academicSession: { select: { id: true, name: true } },
      _count: { select: { invoiceItems: true } },
    },
    orderBy: [{ academicSession: { startDate: "desc" } }, { class: { level: "asc" } }, { name: "asc" }],
  });
}

async function feeStructureData(db: Db, input: unknown) {
  const data = parseInput(feeStructureSchema, input);
  const amountMinor = await toMinorOrThrow(data.amount, "amount", db);
  const session = await db.academicSession.findUnique({ where: { id: data.academicSessionId }, select: { id: true } });
  const klass = data.classId
    ? await db.schoolClass.findUnique({ where: { id: data.classId }, select: { id: true } })
    : true;
  if (!session) throw invalid("Choose a valid session.", { academicSessionId: ["Session not found."] });
  if (!klass) throw invalid("Choose a valid class.", { classId: ["Class not found."] });
  return {
    name: data.name,
    academicSessionId: data.academicSessionId,
    classId: data.classId,
    amountMinor,
    frequency: data.frequency,
    description: data.description,
    isActive: data.isActive,
  };
}

async function assertFeeNameFree(
  db: Db,
  data: { name: string; academicSessionId: string; classId: string | null },
  exceptId?: string,
) {
  const clash = await db.feeStructure.findFirst({
    where: {
      name: { equals: data.name, mode: "insensitive" },
      academicSessionId: data.academicSessionId,
      classId: data.classId,
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
  });
  if (clash)
    throw conflict("A fee with this name already exists for this class and session.", { name: ["Name is taken."] });
}

export async function createFeeStructure(actor: Actor, input: unknown) {
  assertRole(actor, Role.ADMIN);
  return prisma.$transaction(async (tx) => {
    const data = await feeStructureData(tx, input);
    await assertFeeNameFree(tx, data);
    const fee = await tx.feeStructure.create({ data });
    await recordAudit(tx, actor, {
      action: "fee.created",
      entityType: "FeeStructure",
      entityId: fee.id,
      summary: `Created fee ${fee.name}`,
      metadata: { amountMinor: fee.amountMinor },
    });
    return fee;
  });
}

/** Changing a fee's amount never alters invoices that were already issued. */
export async function updateFeeStructure(actor: Actor, id: string, input: unknown) {
  assertRole(actor, Role.ADMIN);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.feeStructure.findUnique({
      where: { id },
      include: { _count: { select: { invoiceItems: true } } },
    });
    if (!existing) throw notFound("Fee structure");
    const data = await feeStructureData(tx, input);
    if (
      existing._count.invoiceItems > 0 &&
      (existing.academicSessionId !== data.academicSessionId || existing.classId !== data.classId)
    ) {
      throw conflict("Session and class cannot change after invoices were issued for this fee.");
    }
    await assertFeeNameFree(tx, data, id);
    const fee = await tx.feeStructure.update({ where: { id }, data });
    await recordAudit(tx, actor, {
      action: "fee.updated",
      entityType: "FeeStructure",
      entityId: id,
      summary: `Updated fee ${fee.name}`,
    });
    return fee;
  });
}

export async function deleteFeeStructure(actor: Actor, id: string) {
  assertRole(actor, Role.ADMIN);
  return prisma.$transaction(async (tx) => {
    const fee = await tx.feeStructure.findUnique({
      where: { id },
      include: { _count: { select: { invoiceItems: true } } },
    });
    if (!fee) throw notFound("Fee structure");
    if (fee._count.invoiceItems > 0) throw conflict("This fee has been invoiced. Mark it inactive instead.");
    await tx.feeStructure.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: "fee.deleted",
      entityType: "FeeStructure",
      entityId: id,
      summary: `Deleted fee ${fee.name}`,
    });
  });
}

/** Active fee structures applicable to a student's class in its session. */
export async function feeOptionsForStudent(actor: Actor, studentId: string) {
  assertRole(actor, Role.ADMIN);
  const student = await prisma.studentProfile.findUnique({
    where: { id: studentId },
    select: { section: { select: { classId: true, academicSessionId: true } } },
  });
  if (!student) throw notFound("Student");
  const sessionId = student.section?.academicSessionId ?? (await getCurrentSession())?.id;
  if (!sessionId) return [];
  return prisma.feeStructure.findMany({
    where: {
      isActive: true,
      academicSessionId: sessionId,
      OR: [{ classId: null }, ...(student.section ? [{ classId: student.section.classId }] : [])],
    },
    select: { id: true, name: true, amountMinor: true, frequency: true },
    orderBy: { name: "asc" },
  });
}

// ───────────── Invoices ─────────────

async function assertNotAlreadyBilled(db: Db, studentId: string, feeStructureId: string, periodLabel: string) {
  const existing = await db.invoiceItem.findFirst({
    where: { feeStructureId, periodLabel, invoice: { studentId, status: { not: InvoiceStatus.CANCELLED } } },
    select: { invoice: { select: { invoiceNumber: true } } },
  });
  if (existing) {
    throw conflict(
      `This fee${periodLabel ? ` for ${periodLabel}` : ""} is already billed on invoice ${existing.invoice.invoiceNumber}.`,
    );
  }
}

export async function createInvoice(actor: Actor, input: unknown) {
  assertRole(actor, Role.ADMIN);
  const data = parseInput(createInvoiceSchema, input);
  const settings = await getSettings();

  const items = data.items.map((item, index) => {
    const minor = parseMoneyToMinor(item.amount, settings.currencyCode);
    if (minor === null || minor <= 0) {
      throw invalid("Enter a valid positive amount for every line.", {
        [`items.${index}.amount`]: ["Enter a valid amount."],
      });
    }
    return { ...item, amountMinor: minor };
  });
  const keys = items.filter((i) => i.feeStructureId).map((i) => `${i.feeStructureId}:${i.periodLabel}`);
  if (new Set(keys).size !== keys.length) throw invalid("The same fee and billing period appears twice.");
  // invoices.totalMinor is a 32-bit integer column.
  if (items.reduce((sum, i) => sum + i.amountMinor, 0) > MAX_INVOICE_TOTAL_MINOR) {
    throw invalid("The invoice total is too large. Split it into several invoices.");
  }

  return prisma.$transaction(async (tx) => {
    const student = await tx.studentProfile.findUnique({
      where: { id: data.studentId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        admissionNumber: true,
        section: { select: { classId: true, academicSessionId: true } },
      },
    });
    if (!student) throw invalid("Choose a valid student.", { studentId: ["Student not found."] });
    const sessionId = student.section?.academicSessionId ?? (await getCurrentSession(tx))?.id;
    if (!sessionId) throw invalid("Create an academic session before issuing invoices.");

    const structureIds = [...new Set(items.map((i) => i.feeStructureId).filter((v): v is string => Boolean(v)))].sort();
    for (const id of structureIds) await lockKey(tx, `fee:${id}`);
    const structures = await tx.feeStructure.findMany({ where: { id: { in: structureIds } } });
    for (const item of items) {
      if (!item.feeStructureId) continue;
      const fee = structures.find((s) => s.id === item.feeStructureId);
      if (!fee || !fee.isActive || fee.academicSessionId !== sessionId) {
        throw invalid("One of the selected fees is not available for this student's session.");
      }
      if (fee.classId && fee.classId !== student.section?.classId) {
        throw invalid(`The fee "${fee.name}" does not apply to this student's class.`);
      }
      await assertNotAlreadyBilled(tx, student.id, fee.id, item.periodLabel);
    }

    const totalMinor = items.reduce((sum, i) => sum + i.amountMinor, 0);
    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber: await nextDocumentNumber(tx, "invoice", settings.invoicePrefix),
        studentId: student.id,
        academicSessionId: sessionId,
        issueDate: data.issueDate,
        dueDate: data.dueDate,
        notes: data.notes,
        totalMinor,
        createdById: actor.userId,
        items: {
          create: items.map((i) => ({
            feeStructureId: i.feeStructureId,
            description: i.description,
            periodLabel: i.periodLabel,
            amountMinor: i.amountMinor,
          })),
        },
      },
    });
    await recordAudit(tx, actor, {
      action: "invoice.created",
      entityType: "Invoice",
      entityId: invoice.id,
      summary: `Issued invoice ${invoice.invoiceNumber} to ${fullName(student)} (${student.admissionNumber}) for ${formatMoney(totalMinor, settings.currencyCode, settings.locale)}`,
    });
    return invoice;
  });
}

/** Bill one fee to every active student of a section (or of all applicable sections). */
export async function generateInvoices(actor: Actor, input: unknown) {
  assertRole(actor, Role.ADMIN);
  const data = parseInput(generateInvoicesSchema, input);
  const settings = await getSettings();
  const fee = await prisma.feeStructure.findUnique({ where: { id: data.feeStructureId } });
  if (!fee || !fee.isActive) throw invalid("Choose an active fee.", { feeStructureId: ["Fee is not active."] });

  if (data.sectionId) {
    const section = await prisma.section.findUnique({ where: { id: data.sectionId } });
    if (
      !section ||
      section.academicSessionId !== fee.academicSessionId ||
      (fee.classId && section.classId !== fee.classId)
    ) {
      throw invalid("This fee does not apply to the chosen section.", {
        sectionId: ["Section does not match the fee."],
      });
    }
  }

  return prisma.$transaction(
    async (tx) => {
      await lockKey(tx, `fee:${fee.id}`);
      const students = await tx.studentProfile.findMany({
        where: {
          status: StudentStatus.ACTIVE,
          section: {
            academicSessionId: fee.academicSessionId,
            ...(fee.classId ? { classId: fee.classId } : {}),
            ...(data.sectionId ? { id: data.sectionId } : {}),
          },
        },
        select: { id: true },
      });
      const billed = await tx.invoiceItem.findMany({
        where: {
          feeStructureId: fee.id,
          periodLabel: data.periodLabel,
          invoice: { status: { not: InvoiceStatus.CANCELLED }, studentId: { in: students.map((s) => s.id) } },
        },
        select: { invoice: { select: { studentId: true } } },
      });
      const alreadyBilled = new Set(billed.map((b) => b.invoice.studentId));
      let created = 0;
      for (const student of students) {
        if (alreadyBilled.has(student.id)) continue;
        await tx.invoice.create({
          data: {
            invoiceNumber: await nextDocumentNumber(tx, "invoice", settings.invoicePrefix),
            studentId: student.id,
            academicSessionId: fee.academicSessionId,
            issueDate: data.issueDate,
            dueDate: data.dueDate,
            totalMinor: fee.amountMinor,
            createdById: actor.userId,
            items: {
              create: {
                feeStructureId: fee.id,
                description: fee.name,
                periodLabel: data.periodLabel,
                amountMinor: fee.amountMinor,
              },
            },
          },
        });
        created += 1;
      }
      await recordAudit(tx, actor, {
        action: "invoice.bulkGenerated",
        entityType: "FeeStructure",
        entityId: fee.id,
        summary: `Generated ${created} invoice(s) for ${fee.name} – ${data.periodLabel}`,
        metadata: { created, skipped: alreadyBilled.size },
      });
      return { created, skipped: alreadyBilled.size, eligible: students.length };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}

export type InvoiceFilters = { q?: string; status?: InvoiceStatus; overdue?: boolean; studentId?: string };

export async function listInvoices(actor: Actor, filters: InvoiceFilters, pagination: Pagination) {
  assertRole(actor, Role.ADMIN);
  const today = todayDateOnly();
  const where: Prisma.InvoiceWhereInput = {
    AND: [
      filters.status ? { status: filters.status } : {},
      filters.studentId ? { studentId: filters.studentId } : {},
      filters.overdue ? { status: { in: OPEN_STATUSES }, dueDate: { lt: today } } : {},
      filters.q
        ? {
            OR: [
              { invoiceNumber: { contains: filters.q, mode: "insensitive" } },
              { student: { admissionNumber: { contains: filters.q, mode: "insensitive" } } },
              { student: { firstName: { contains: filters.q, mode: "insensitive" } } },
              { student: { lastName: { contains: filters.q, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };
  const [items, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: { student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } } },
      orderBy: [{ issueDate: "desc" }, { invoiceNumber: "desc" }],
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.invoice.count({ where }),
  ]);
  return paginated(
    items.map((inv) => ({ ...inv, outstandingMinor: outstandingMinor(inv), overdue: isOverdue(inv, today) })),
    total,
    pagination,
  );
}

/** Invoices are visible to administrators and to the student they belong to. */
async function assertInvoiceAccess(actor: Actor, studentId: string) {
  if (actor.role === Role.ADMIN) return;
  if (actor.role === Role.STUDENT && actor.studentId === studentId) return;
  throw notFound("Invoice");
}

export async function getInvoice(actor: Actor, invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true,
          guardianName: true,
          section: { select: { name: true, class: { select: { name: true } } } },
        },
      },
      academicSession: { select: { name: true } },
      items: { orderBy: { id: "asc" } },
      payments: { orderBy: { paidAt: "asc" }, include: { recordedBy: { select: { name: true } } } },
      createdBy: { select: { name: true } },
    },
  });
  if (!invoice) throw notFound("Invoice");
  await assertInvoiceAccess(actor, invoice.studentId);
  return { ...invoice, outstandingMinor: outstandingMinor(invoice), overdue: isOverdue(invoice, todayDateOnly()) };
}

/**
 * Record a manually received payment. The invoice row is locked (SELECT ... FOR UPDATE)
 * so concurrent payments cannot over-pay it; an idempotency key turns accidental
 * double submissions into a no-op. No external payment gateway is involved.
 */
export async function recordPayment(actor: Actor, input: unknown) {
  assertRole(actor, Role.ADMIN);
  const data = parseInput(recordPaymentSchema, input);
  const settings = await getSettings();
  const amountMinor = await toMinorOrThrow(data.amount, "amount");
  if (data.paidAt > todayDateOnly()) {
    throw invalid("The payment date cannot be in the future.", { paidAt: ["Choose today or an earlier date."] });
  }

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { id: string; totalMinor: number; paidMinor: number; status: InvoiceStatus; invoiceNumber: string }[]
    >`
      SELECT id, "totalMinor", "paidMinor", status::text AS status, "invoiceNumber"
      FROM invoices WHERE id = ${data.invoiceId} FOR UPDATE`;
    const invoice = rows[0];
    if (!invoice) throw notFound("Invoice");

    const duplicate = await tx.payment.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
    if (duplicate) {
      if (duplicate.invoiceId !== invoice.id)
        throw conflict("This payment form was already used. Reload and try again.");
      return { paymentId: duplicate.id, receiptNumber: duplicate.receiptNumber, duplicate: true };
    }
    if (invoice.status === InvoiceStatus.CANCELLED)
      throw conflict("Payments cannot be recorded on a cancelled invoice.");
    const outstanding = invoice.totalMinor - invoice.paidMinor;
    if (outstanding <= 0) throw conflict("This invoice is already fully paid.");
    if (amountMinor > outstanding) {
      const formatted = formatMoney(outstanding, settings.currencyCode, settings.locale);
      throw invalid(`The amount exceeds the outstanding balance of ${formatted}.`, {
        amount: [`Cannot exceed the outstanding balance (${formatted}).`],
      });
    }

    const payment = await tx.payment.create({
      data: {
        receiptNumber: await nextDocumentNumber(tx, "receipt", settings.receiptPrefix),
        invoiceId: invoice.id,
        amountMinor,
        method: data.method,
        reference: data.reference,
        notes: data.notes,
        paidAt: data.paidAt,
        recordedById: actor.userId,
        idempotencyKey: data.idempotencyKey,
      },
    });
    const paidMinor = invoice.paidMinor + amountMinor;
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { paidMinor, status: invoiceStatusFor(invoice.totalMinor, paidMinor) },
    });
    await recordAudit(tx, actor, {
      action: "payment.recorded",
      entityType: "Invoice",
      entityId: invoice.id,
      summary: `Recorded manual payment ${payment.receiptNumber} of ${formatMoney(amountMinor, settings.currencyCode, settings.locale)} on ${invoice.invoiceNumber}`,
      metadata: { amountMinor, method: data.method },
    });
    return { paymentId: payment.id, receiptNumber: payment.receiptNumber, duplicate: false };
  });
}

export async function cancelInvoice(actor: Actor, input: unknown) {
  assertRole(actor, Role.ADMIN);
  const data = parseInput(cancelInvoiceSchema, input);
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM invoices WHERE id = ${data.invoiceId} FOR UPDATE`;
    if (!rows[0]) throw notFound("Invoice");
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: data.invoiceId } });
    if (invoice.status === InvoiceStatus.CANCELLED) throw conflict("This invoice is already cancelled.");
    if (invoice.paidMinor > 0) throw conflict("Invoices with recorded payments cannot be cancelled.");
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: InvoiceStatus.CANCELLED, cancelledAt: new Date(), cancelReason: data.reason },
    });
    await recordAudit(tx, actor, {
      action: "invoice.cancelled",
      entityType: "Invoice",
      entityId: invoice.id,
      summary: `Cancelled invoice ${invoice.invoiceNumber}: ${data.reason}`,
    });
  });
}

export async function getReceipt(actor: Actor, paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      recordedBy: { select: { name: true } },
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          totalMinor: true,
          paidMinor: true,
          status: true,
          studentId: true,
          student: {
            select: {
              firstName: true,
              lastName: true,
              admissionNumber: true,
              section: { select: { name: true, class: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });
  if (!payment) throw notFound("Receipt");
  if (!(actor.role === Role.ADMIN || (actor.role === Role.STUDENT && actor.studentId === payment.invoice.studentId))) {
    throw notFound("Receipt");
  }
  const settings = await getSettings();
  return { payment, settings, outstandingMinor: outstandingMinor(payment.invoice) };
}

/** Billing totals, invoices and payments for one student (admin or the student). */
export async function getStudentFees(actor: Actor, studentId: string) {
  if (actor.role === Role.TEACHER) throw forbidden();
  await assertStudentAccess(actor, studentId);
  const today = todayDateOnly();
  const invoices = await prisma.invoice.findMany({
    where: { studentId },
    include: { payments: { orderBy: { paidAt: "desc" } }, academicSession: { select: { name: true } } },
    orderBy: [{ issueDate: "desc" }, { invoiceNumber: "desc" }],
  });
  const active = invoices.filter((i) => i.status !== InvoiceStatus.CANCELLED);
  const billed = active.reduce((sum, i) => sum + i.totalMinor, 0);
  const paid = active.reduce((sum, i) => sum + i.paidMinor, 0);
  const open = active.filter((i) => outstandingMinor(i) > 0).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  return {
    totals: {
      billedMinor: billed,
      paidMinor: paid,
      outstandingMinor: billed - paid,
      overdueMinor: open.filter((i) => i.dueDate < today).reduce((sum, i) => sum + outstandingMinor(i), 0),
    },
    nextDue: open[0]
      ? {
          invoiceId: open[0].id,
          invoiceNumber: open[0].invoiceNumber,
          dueDate: open[0].dueDate,
          amountMinor: outstandingMinor(open[0]),
        }
      : null,
    invoices: invoices.map((i) => ({ ...i, outstandingMinor: outstandingMinor(i), overdue: isOverdue(i, today) })),
    payments: invoices
      .flatMap((i) => i.payments.map((p) => ({ ...p, invoiceNumber: i.invoiceNumber })))
      .sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime()),
  };
}

/** Institution-wide fee figures for the admin dashboard and reports. */
export async function getFeeOverview(actor: Actor) {
  assertRole(actor, Role.ADMIN);
  const today = todayDateOnly();
  const [totals, overdue, collected30, openInvoices] = await Promise.all([
    prisma.invoice.aggregate({
      where: { status: { not: InvoiceStatus.CANCELLED } },
      _sum: { totalMinor: true, paidMinor: true },
      _count: { _all: true },
    }),
    prisma.invoice.findMany({
      where: { status: { in: OPEN_STATUSES }, dueDate: { lt: today } },
      select: { totalMinor: true, paidMinor: true },
    }),
    prisma.payment.aggregate({ where: { paidAt: { gte: addDays(today, -29) } }, _sum: { amountMinor: true } }),
    prisma.invoice.findMany({
      where: { status: { in: OPEN_STATUSES } },
      select: {
        totalMinor: true,
        paidMinor: true,
        student: { select: { section: { select: { class: { select: { name: true, level: true } } } } } },
      },
    }),
  ]);
  const byClass = new Map<string, { className: string; level: number; outstandingMinor: number; invoices: number }>();
  for (const inv of openInvoices) {
    const klass = inv.student.section?.class;
    const key = klass?.name ?? "Unassigned";
    const row = byClass.get(key) ?? { className: key, level: klass?.level ?? 999, outstandingMinor: 0, invoices: 0 };
    row.outstandingMinor += inv.totalMinor - inv.paidMinor;
    row.invoices += 1;
    byClass.set(key, row);
  }
  const billed = totals._sum.totalMinor ?? 0;
  const paid = totals._sum.paidMinor ?? 0;
  return {
    invoiceCount: totals._count._all,
    billedMinor: billed,
    collectedMinor: paid,
    outstandingMinor: billed - paid,
    overdueCount: overdue.length,
    overdueMinor: overdue.reduce((sum, i) => sum + (i.totalMinor - i.paidMinor), 0),
    collectedLast30Minor: collected30._sum.amountMinor ?? 0,
    byClass: [...byClass.values()].sort((a, b) => a.level - b.level),
  };
}

/** Overdue invoices with student and section, for the fees report and CSV export. */
export async function listOverdueInvoices(actor: Actor) {
  assertRole(actor, Role.ADMIN);
  const today = todayDateOnly();
  const invoices = await prisma.invoice.findMany({
    where: { status: { in: OPEN_STATUSES }, dueDate: { lt: today } },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true,
          guardianPhone: true,
          section: { select: { name: true, class: { select: { name: true } } } },
        },
      },
    },
    orderBy: { dueDate: "asc" },
    take: 1000,
  });
  return invoices.map((inv) => ({
    ...inv,
    outstandingMinor: inv.totalMinor - inv.paidMinor,
    daysOverdue: Math.round((today.getTime() - inv.dueDate.getTime()) / 86_400_000),
    sectionName: inv.student.section ? sectionLabel(inv.student.section) : "—",
  }));
}

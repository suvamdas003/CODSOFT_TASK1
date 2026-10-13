import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, toDateOnlyString, todayDateOnly } from "@/lib/utils/dates";
import type { Actor } from "@/server/auth/actor";
import { prisma } from "@/server/db";
import {
  cancelInvoice,
  createFeeStructure,
  createInvoice,
  generateInvoices,
  getInvoice,
  getStudentFees,
  recordPayment,
} from "@/server/services/fee.service";
import { createSchool, createStudentActor, expectAppError } from "./fixtures";

let school: Awaited<ReturnType<typeof createSchool>>;
let student: Actor;
const today = () => toDateOnlyString(todayDateOnly());
const inDays = (n: number) => toDateOnlyString(addDays(todayDateOnly(), n));

beforeAll(async () => {
  school = await createSchool();
  student = await createStudentActor(school.admin, school.sectionA.id);
});
afterAll(() => prisma.$disconnect());

async function newInvoice(amounts: string[], dueInDays = 30) {
  return createInvoice(school.admin, {
    studentId: student.studentId,
    issueDate: today(),
    dueDate: inDays(dueInDays),
    items: amounts.map((amount, i) => ({ description: `Item ${i + 1}`, amount })),
  });
}

const pay = (invoiceId: string, amount: string, key: string = randomUUID()) =>
  recordPayment(school.admin, { invoiceId, amount, method: "CASH", paidAt: today(), idempotencyKey: key });

describe("invoices", () => {
  it("totals line items in integer minor units and numbers invoices uniquely", async () => {
    const a = await newInvoice(["100.10", "0.20"]);
    const b = await newInvoice(["5"]);
    expect(a.totalMinor).toBe(10030); // 100.10 + 0.20 without float drift
    expect(a.status).toBe("UNPAID");
    expect(a.invoiceNumber).not.toBe(b.invoiceNumber);
    expect(a.invoiceNumber).toMatch(/^INV-\d{4}-\d{6}$/);
  });

  it("rejects invalid amounts and due dates before the issue date", async () => {
    await expectAppError(newInvoice(["0"]), "VALIDATION");
    await expectAppError(newInvoice(["12.345"]), "VALIDATION");
    await expectAppError(newInvoice(["10"], -1), "VALIDATION");
  });

  it("does not bill the same fee for the same period twice", async () => {
    const fee = await createFeeStructure(school.admin, {
      name: "Lab fee",
      academicSessionId: school.session.id,
      classId: school.klass.id,
      amount: "20.00",
      frequency: "TERM",
      isActive: "on",
    });
    const item = { feeStructureId: fee.id, description: "Lab fee", periodLabel: "Term 1", amount: "20.00" };
    await createInvoice(school.admin, {
      studentId: student.studentId,
      issueDate: today(),
      dueDate: inDays(10),
      items: [item],
    });
    await expectAppError(
      createInvoice(school.admin, {
        studentId: student.studentId,
        issueDate: today(),
        dueDate: inDays(10),
        items: [item],
      }),
      "CONFLICT",
    );
    // A different period is fine.
    await createInvoice(school.admin, {
      studentId: student.studentId,
      issueDate: today(),
      dueDate: inDays(10),
      items: [{ ...item, periodLabel: "Term 2" }],
    });
  });

  it("bulk generation skips students already billed for the period", async () => {
    await createStudentActor(school.admin, school.sectionA.id);
    const fee = await createFeeStructure(school.admin, {
      name: "Bus fee",
      academicSessionId: school.session.id,
      classId: school.klass.id,
      amount: "30.00",
      frequency: "MONTHLY",
      isActive: "on",
    });
    const input = {
      feeStructureId: fee.id,
      sectionId: school.sectionA.id,
      periodLabel: "October",
      issueDate: today(),
      dueDate: inDays(15),
    };
    const first = await generateInvoices(school.admin, input);
    expect(first.created).toBe(first.eligible);
    expect(first.created).toBeGreaterThanOrEqual(2);
    const second = await generateInvoices(school.admin, input);
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(first.created);
  });
});

describe("payments", () => {
  it("records partial and final payments and keeps balances consistent", async () => {
    const invoice = await newInvoice(["100.00"]);
    await pay(invoice.id, "40.00");
    let current = await getInvoice(school.admin, invoice.id);
    expect(current.status).toBe("PARTIALLY_PAID");
    expect(current.paidMinor).toBe(4000);
    expect(current.outstandingMinor).toBe(6000);

    await expectAppError(pay(invoice.id, "60.01"), "VALIDATION"); // overpayment
    await pay(invoice.id, "60.00");
    current = await getInvoice(school.admin, invoice.id);
    expect(current.status).toBe("PAID");
    expect(current.outstandingMinor).toBe(0);
    expect(current.payments).toHaveLength(2);
    expect(current.payments.every((p) => p.source === "MANUAL")).toBe(true);
    await expectAppError(pay(invoice.id, "1.00"), "CONFLICT"); // already paid
  });

  it("treats a repeated idempotency key as the same payment (double submit)", async () => {
    const invoice = await newInvoice(["50.00"]);
    const key = randomUUID();
    const first = await pay(invoice.id, "10.00", key);
    const again = await pay(invoice.id, "10.00", key);
    expect(again.duplicate).toBe(true);
    expect(again.paymentId).toBe(first.paymentId);
    expect((await getInvoice(school.admin, invoice.id)).paidMinor).toBe(1000);
  });

  it("serializes concurrent payments so an invoice can never be over-paid", async () => {
    const invoice = await newInvoice(["100.00"]);
    const results = await Promise.allSettled([pay(invoice.id, "70.00"), pay(invoice.id, "70.00")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const after = await getInvoice(school.admin, invoice.id);
    expect(after.paidMinor).toBe(7000);
    expect(after.payments).toHaveLength(1);
  });

  it("rejects future payment dates and non-admin recorders", async () => {
    const invoice = await newInvoice(["10.00"]);
    await expectAppError(
      recordPayment(school.admin, {
        invoiceId: invoice.id,
        amount: "1",
        method: "CASH",
        paidAt: inDays(1),
        idempotencyKey: randomUUID(),
      }),
      "VALIDATION",
    );
    await expectAppError(
      recordPayment(school.teacher, {
        invoiceId: invoice.id,
        amount: "1",
        method: "CASH",
        paidAt: today(),
        idempotencyKey: randomUUID(),
      }),
      "FORBIDDEN",
    );
    await expectAppError(
      recordPayment(student, {
        invoiceId: invoice.id,
        amount: "1",
        method: "CASH",
        paidAt: today(),
        idempotencyKey: randomUUID(),
      }),
      "FORBIDDEN",
    );
  });

  it("cancels only invoices without payments, and cancelled invoices accept no payments", async () => {
    const paid = await newInvoice(["10.00"]);
    await pay(paid.id, "5.00");
    await expectAppError(cancelInvoice(school.admin, { invoiceId: paid.id, reason: "Mistake" }), "CONFLICT");

    const unpaid = await newInvoice(["10.00"]);
    await cancelInvoice(school.admin, { invoiceId: unpaid.id, reason: "Issued in error" });
    await expectAppError(pay(unpaid.id, "1.00"), "CONFLICT");
  });

  it("summarizes a student's billed, paid, outstanding and overdue amounts", async () => {
    const overdue = await createInvoice(school.admin, {
      studentId: student.studentId,
      issueDate: inDays(-40),
      dueDate: inDays(-10),
      items: [{ description: "Old fee", amount: "25.00" }],
    });
    const fees = await getStudentFees(student, student.studentId!);
    const active = await prisma.invoice.findMany({
      where: { studentId: student.studentId!, status: { not: "CANCELLED" } },
    });
    const billed = active.reduce((sum, i) => sum + i.totalMinor, 0);
    const paid = active.reduce((sum, i) => sum + i.paidMinor, 0);
    expect(fees.totals.billedMinor).toBe(billed);
    expect(fees.totals.paidMinor).toBe(paid);
    expect(fees.totals.outstandingMinor).toBe(billed - paid);
    expect(fees.totals.overdueMinor).toBe(2500);
    expect(fees.invoices.find((i) => i.id === overdue.id)?.overdue).toBe(true);
  });

  it("database constraints reject a paid amount above the total", async () => {
    const invoice = await newInvoice(["10.00"]);
    await expect(prisma.invoice.update({ where: { id: invoice.id }, data: { paidMinor: 99999 } })).rejects.toThrow();
  });
});

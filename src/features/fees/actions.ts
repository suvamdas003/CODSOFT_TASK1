"use server";

import { Role } from "@/generated/prisma/enums";
import type { FormValues } from "@/lib/action-result";
import { runAction } from "@/server/action";
import * as fees from "@/server/services/fee.service";

const ADMIN = [Role.ADMIN];

export async function createFeeStructureAction(values: FormValues) {
  return runAction(ADMIN, async (actor) => {
    await fees.createFeeStructure(actor, values);
    return { message: "Fee created.", revalidate: ["/fees"] };
  });
}

export async function updateFeeStructureAction(id: string, values: FormValues) {
  return runAction(ADMIN, async (actor) => {
    await fees.updateFeeStructure(actor, id, values);
    return { message: "Fee updated.", revalidate: ["/fees"] };
  });
}

export async function deleteFeeStructureAction(id: string) {
  return runAction(ADMIN, async (actor) => {
    await fees.deleteFeeStructure(actor, id);
    return { message: "Fee deleted.", revalidate: ["/fees"] };
  });
}

/** Invoice form (React Hook Form) submits a structured object with line items. */
export async function createInvoiceAction(input: unknown) {
  return runAction(ADMIN, async (actor) => {
    const invoice = await fees.createInvoice(actor, input);
    return {
      message: `Invoice ${invoice.invoiceNumber} issued.`,
      redirectTo: `/fees/invoices/${invoice.id}`,
      revalidate: ["/fees/invoices"],
    };
  });
}

export async function generateInvoicesAction(values: FormValues) {
  return runAction(ADMIN, async (actor) => {
    const result = await fees.generateInvoices(actor, values);
    return {
      message: `Created ${result.created} invoice(s); ${result.skipped} student(s) were already billed for this period.`,
      redirectTo: "/fees/invoices",
      revalidate: ["/fees/invoices"],
    };
  });
}

export async function recordPaymentAction(values: FormValues) {
  return runAction(ADMIN, async (actor) => {
    const result = await fees.recordPayment(actor, values);
    return {
      message: result.duplicate
        ? `This payment was already recorded (receipt ${result.receiptNumber}).`
        : `Payment recorded. Receipt ${result.receiptNumber}.`,
      redirectTo: `/fees/receipts/${result.paymentId}`,
      revalidate: ["/fees/invoices", "/dashboard"],
    };
  });
}

export async function cancelInvoiceAction(values: FormValues) {
  return runAction(ADMIN, async (actor) => {
    await fees.cancelInvoice(actor, values);
    return { message: "Invoice cancelled.", revalidate: ["/fees/invoices"] };
  });
}

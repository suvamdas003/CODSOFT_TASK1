import { z } from "zod";
import { FeeFrequency, PaymentMethod } from "@/generated/prisma/enums";
import { amountField, checkboxField, dateField, idField, optionalId, optionalText, requiredText } from "./common";

export const feeStructureSchema = z.object({
  name: requiredText("Fee name", 80),
  academicSessionId: idField("Academic session"),
  classId: optionalId(),
  amount: amountField(),
  frequency: z.enum(FeeFrequency, { error: "Choose a frequency." }),
  description: optionalText(200),
  isActive: checkboxField,
});

export const invoiceItemSchema = z.object({
  feeStructureId: optionalId(),
  description: requiredText("Description", 120),
  periodLabel: optionalText(40).transform((v) => v ?? ""),
  amount: amountField(),
});

export const createInvoiceSchema = z
  .object({
    studentId: idField("Student"),
    issueDate: dateField("Issue date"),
    dueDate: dateField("Due date"),
    notes: optionalText(300),
    items: z.array(invoiceItemSchema).min(1, "Add at least one line item.").max(20),
  })
  .refine((v) => v.dueDate >= v.issueDate, {
    path: ["dueDate"],
    message: "Due date must not be before the issue date.",
  });

export const generateInvoicesSchema = z
  .object({
    feeStructureId: idField("Fee structure"),
    sectionId: optionalId(),
    periodLabel: requiredText("Billing period", 40),
    issueDate: dateField("Issue date"),
    dueDate: dateField("Due date"),
  })
  .refine((v) => v.dueDate >= v.issueDate, {
    path: ["dueDate"],
    message: "Due date must not be before the issue date.",
  });

export const recordPaymentSchema = z.object({
  invoiceId: idField("Invoice"),
  amount: amountField(),
  method: z.enum(PaymentMethod, { error: "Choose a payment method." }),
  paidAt: dateField("Payment date"),
  reference: optionalText(80),
  notes: optionalText(300),
  idempotencyKey: z.uuid({ error: "Reload the page and try again." }),
});

export const cancelInvoiceSchema = z.object({
  invoiceId: idField("Invoice"),
  reason: requiredText("Reason", 200),
});

export type FeeStructureInput = z.output<typeof feeStructureSchema>;
export type CreateInvoiceInput = z.output<typeof createInvoiceSchema>;
export type GenerateInvoicesInput = z.output<typeof generateInvoicesSchema>;
export type RecordPaymentInput = z.output<typeof recordPaymentSchema>;

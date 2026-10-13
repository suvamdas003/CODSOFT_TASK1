import type { InvoiceStatus } from "@/generated/prisma/enums";

/** Status implied by totals. CANCELLED is set explicitly and never derived. */
export function invoiceStatusFor(totalMinor: number, paidMinor: number): InvoiceStatus {
  if (paidMinor <= 0) return "UNPAID";
  if (paidMinor >= totalMinor) return "PAID";
  return "PARTIALLY_PAID";
}

export function outstandingMinor(invoice: { totalMinor: number; paidMinor: number; status: InvoiceStatus }): number {
  if (invoice.status === "CANCELLED") return 0;
  return Math.max(0, invoice.totalMinor - invoice.paidMinor);
}

export function isOverdue(
  invoice: { dueDate: Date; totalMinor: number; paidMinor: number; status: InvoiceStatus },
  today: Date,
): boolean {
  return outstandingMinor(invoice) > 0 && invoice.dueDate < today;
}

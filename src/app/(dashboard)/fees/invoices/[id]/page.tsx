import type { Metadata } from "next";
import Link from "next/link";
import { TextField } from "@/components/shared/action-form";
import { FormDialog } from "@/components/shared/form-dialog";
import { DetailList, EmptyState, PageHeader, StatusBadge } from "@/components/shared/page";
import { PrintButton } from "@/components/shared/print-button";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InvoiceStatus, Role } from "@/generated/prisma/enums";
import { cancelInvoiceAction } from "@/features/fees/actions";
import { PaymentForm } from "@/features/fees/payment-form";
import { formatDate, formatDateTime, todayDateOnlyString } from "@/lib/utils/dates";
import { fullName, humanize } from "@/lib/utils/format";
import { formatMoney, minorToMajorString } from "@/lib/utils/money";
import { requireActor } from "@/server/auth/session";
import { load } from "@/server/page";
import { getInvoice } from "@/server/services/fee.service";
import { getSettings } from "@/server/services/settings.service";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: PageProps<"/fees/invoices/[id]">) {
  const actor = await requireActor(Role.ADMIN, Role.STUDENT);
  const { id } = await params;
  const [invoice, settings] = await Promise.all([load(getInvoice(actor, id)), getSettings()]);
  const money = (minor: number) => formatMoney(minor, settings.currencyCode, settings.locale);
  const isAdmin = actor.role === Role.ADMIN;
  const canPay = isAdmin && invoice.status !== InvoiceStatus.CANCELLED && invoice.outstandingMinor > 0;
  const canCancel = isAdmin && invoice.status !== InvoiceStatus.CANCELLED && invoice.paidMinor === 0;

  return (
    <>
      <PageHeader
        title={`Invoice ${invoice.invoiceNumber}`}
        description={`${fullName(invoice.student)} · ${invoice.student.admissionNumber}`}
        back={isAdmin ? { href: "/fees/invoices", label: "Invoices" } : { href: "/my/fees", label: "My fees" }}
        actions={
          <>
            <PrintButton />
            {canCancel ? (
              <FormDialog
                action={cancelInvoiceAction}
                title="Cancel invoice"
                description="Cancelled invoices no longer count towards the balance. This cannot be undone."
                triggerLabel="Cancel invoice"
                triggerVariant="outline"
                submitLabel="Cancel invoice"
              >
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <TextField name="reason" label="Reason" required maxLength={200} />
              </FormDialog>
            ) : null}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          {invoice.status === InvoiceStatus.CANCELLED ? (
            <Alert variant="destructive">
              Cancelled {formatDateTime(invoice.cancelledAt)}: {invoice.cancelReason}
            </Alert>
          ) : invoice.overdue ? (
            <Alert variant="warning">Overdue since {formatDate(invoice.dueDate)}.</Alert>
          ) : null}
          <Card className="print-area">
            <CardHeader>
              <CardTitle>{settings.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <DetailList
                items={[
                  { label: "Invoice no.", value: <span className="font-mono">{invoice.invoiceNumber}</span> },
                  {
                    label: "Status",
                    value: (
                      <>
                        <StatusBadge status={invoice.status} />{" "}
                        {invoice.overdue ? <StatusBadge status="OVERDUE" /> : null}
                      </>
                    ),
                  },
                  { label: "Student", value: `${fullName(invoice.student)} (${invoice.student.admissionNumber})` },
                  {
                    label: "Class",
                    value: invoice.student.section
                      ? `${invoice.student.section.class.name} – ${invoice.student.section.name}`
                      : "—",
                  },
                  { label: "Issued", value: formatDate(invoice.issueDate) },
                  { label: "Due", value: formatDate(invoice.dueDate) },
                  { label: "Session", value: invoice.academicSession.name },
                  { label: "Issued by", value: invoice.createdBy?.name },
                ]}
              />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.description}</TableCell>
                      <TableCell>{item.periodLabel || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(item.amountMinor)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2}>Total</TableCell>
                    <TableCell className="text-right tabular-nums">{money(invoice.totalMinor)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={2}>Paid</TableCell>
                    <TableCell className="text-right tabular-nums">{money(invoice.paidMinor)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={2}>Balance due</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {money(invoice.outstandingMinor)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
              {invoice.notes ? <p className="text-muted-foreground text-sm">Notes: {invoice.notes}</p> : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 print:hidden">
          {canPay ? (
            <Card>
              <CardHeader>
                <CardTitle>Record payment</CardTitle>
              </CardHeader>
              <CardContent>
                <PaymentForm
                  invoiceId={invoice.id}
                  defaultAmount={minorToMajorString(invoice.outstandingMinor, settings.currencyCode)}
                  currency={settings.currencyCode}
                  today={todayDateOnlyString()}
                />
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            <CardContent>
              {invoice.payments.length === 0 ? (
                <EmptyState title="No payments yet" />
              ) : (
                <ul className="divide-y">
                  {invoice.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <div>
                        <Link
                          href={`/fees/receipts/${p.id}`}
                          className="text-primary font-mono text-xs font-medium hover:underline"
                        >
                          {p.receiptNumber}
                        </Link>
                        <div className="text-muted-foreground text-xs">
                          {formatDate(p.paidAt)} · {humanize(p.method)} · manual
                          {p.recordedBy ? ` · by ${p.recordedBy.name}` : ""}
                        </div>
                      </div>
                      <span className="tabular-nums">{money(p.amountMinor)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

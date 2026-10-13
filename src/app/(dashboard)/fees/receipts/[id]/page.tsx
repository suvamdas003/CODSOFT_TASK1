import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page";
import { PrintButton } from "@/components/shared/print-button";
import { Card, CardContent } from "@/components/ui/card";
import { Role } from "@/generated/prisma/enums";
import { formatDate, formatDateTime } from "@/lib/utils/dates";
import { fullName, humanize } from "@/lib/utils/format";
import { formatMoney } from "@/lib/utils/money";
import { requireActor } from "@/server/auth/session";
import { load } from "@/server/page";
import { getReceipt } from "@/server/services/fee.service";

export const metadata: Metadata = { title: "Receipt" };

export default async function ReceiptPage({ params }: PageProps<"/fees/receipts/[id]">) {
  const actor = await requireActor(Role.ADMIN, Role.STUDENT);
  const { id } = await params;
  const { payment, settings, outstandingMinor } = await load(getReceipt(actor, id));
  const money = (minor: number) => formatMoney(minor, settings.currencyCode, settings.locale);
  const { invoice } = payment;

  return (
    <>
      <PageHeader
        title={`Receipt ${payment.receiptNumber}`}
        back={{ href: `/fees/invoices/${invoice.id}`, label: `Invoice ${invoice.invoiceNumber}` }}
        actions={<PrintButton label="Print receipt" />}
      />
      <Card className="print-area mx-auto max-w-xl">
        <CardContent className="space-y-6 p-6 sm:p-8">
          <header className="border-b pb-4 text-center">
            <h2 className="text-xl font-bold">{settings.name}</h2>
            {settings.address ? <p className="text-muted-foreground text-sm">{settings.address}</p> : null}
            {settings.phone || settings.email ? (
              <p className="text-muted-foreground text-sm">
                {[settings.phone, settings.email].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            <p className="mt-2 text-sm font-semibold tracking-wide uppercase">Payment receipt</p>
          </header>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Receipt no.</dt>
              <dd className="font-mono">{payment.receiptNumber}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Date received</dt>
              <dd>{formatDate(payment.paidAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Student</dt>
              <dd>
                {fullName(invoice.student)} ({invoice.student.admissionNumber})
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Class</dt>
              <dd>
                {invoice.student.section
                  ? `${invoice.student.section.class.name} – ${invoice.student.section.name}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Invoice</dt>
              <dd className="font-mono">
                <Link href={`/fees/invoices/${invoice.id}`} className="hover:underline">
                  {invoice.invoiceNumber}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Method</dt>
              <dd>
                {humanize(payment.method)}
                {payment.reference ? ` · ${payment.reference}` : ""}
              </dd>
            </div>
          </dl>
          <div className="bg-muted/60 rounded-lg p-4 text-center">
            <p className="text-muted-foreground text-sm">Amount received</p>
            <p className="text-3xl font-bold tabular-nums">{money(payment.amountMinor)}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Balance remaining on invoice: {money(outstandingMinor)}
            </p>
          </div>
          {payment.notes ? <p className="text-sm">Notes: {payment.notes}</p> : null}
          <p className="text-muted-foreground border-t pt-4 text-xs">
            This receipt confirms a payment recorded manually by school staff ({humanize(payment.source)}). It was not
            processed by an online payment gateway. Recorded {formatDateTime(payment.createdAt)}
            {payment.recordedBy ? ` by ${payment.recordedBy.name}` : ""}.
          </p>
        </CardContent>
      </Card>
    </>
  );
}

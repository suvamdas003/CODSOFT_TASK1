import Link from "next/link";
import { EmptyState, StatCard, StatusBadge } from "@/components/shared/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils/dates";
import { humanize } from "@/lib/utils/format";
import { formatMoney } from "@/lib/utils/money";
import type { getStudentFees } from "@/server/services/fee.service";

type Fees = Awaited<ReturnType<typeof getStudentFees>>;

export function StudentFees({ fees, currency, locale }: { fees: Fees; currency: string; locale: string }) {
  const money = (minor: number) => formatMoney(minor, currency, locale);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total billed" value={money(fees.totals.billedMinor)} />
        <StatCard label="Paid" value={money(fees.totals.paidMinor)} tone="success" />
        <StatCard
          label="Outstanding"
          value={money(fees.totals.outstandingMinor)}
          tone={fees.totals.outstandingMinor > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Overdue"
          value={money(fees.totals.overdueMinor)}
          tone={fees.totals.overdueMinor > 0 ? "danger" : "default"}
          hint={fees.nextDue ? `Next due ${formatDate(fees.nextDue.dueDate)}` : "Nothing due"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {fees.invoices.length === 0 ? (
            <EmptyState title="No invoices" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead className="hidden sm:table-cell">Issued</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fees.invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <Link
                        href={`/fees/invoices/${inv.id}`}
                        className="text-primary font-mono text-xs font-medium hover:underline"
                      >
                        {inv.invoiceNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{formatDate(inv.issueDate)}</TableCell>
                    <TableCell>{formatDate(inv.dueDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(inv.totalMinor)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(inv.outstandingMinor)}</TableCell>
                    <TableCell className="space-x-1">
                      <StatusBadge status={inv.status} />
                      {inv.overdue ? <StatusBadge status="OVERDUE" /> : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
        </CardHeader>
        <CardContent>
          {fees.payments.length === 0 ? (
            <EmptyState title="No payments recorded" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="hidden sm:table-cell">Invoice</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fees.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link
                        href={`/fees/receipts/${p.id}`}
                        className="text-primary font-mono text-xs font-medium hover:underline"
                      >
                        {p.receiptNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{formatDate(p.paidAt)}</TableCell>
                    <TableCell className="hidden font-mono text-xs sm:table-cell">{p.invoiceNumber}</TableCell>
                    <TableCell>{humanize(p.method)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(p.amountMinor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

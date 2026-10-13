import { FilePlus2Icon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/shared/filter-bar";
import { EmptyState, PageHeader, Pagination, StatusBadge } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InvoiceStatus, Role } from "@/generated/prisma/enums";
import { invoiceStatusOptions, isEnumValue } from "@/lib/options";
import { formatDate } from "@/lib/utils/dates";
import { fullName } from "@/lib/utils/format";
import { formatMoney } from "@/lib/utils/money";
import { param, parsePagination } from "@/lib/utils/pagination";
import { requireActor } from "@/server/auth/session";
import { listInvoices } from "@/server/services/fee.service";
import { getSettings } from "@/server/services/settings.service";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage({ searchParams }: PageProps<"/fees/invoices">) {
  const actor = await requireActor(Role.ADMIN);
  const sp = await searchParams;
  const status = param(sp.status);
  const filters = {
    q: param(sp.q),
    status: isEnumValue(InvoiceStatus, status) ? status : undefined,
    overdue: param(sp.overdue) === "on",
  };
  const [result, settings] = await Promise.all([listInvoices(actor, filters, parsePagination(sp.page)), getSettings()]);
  const money = (minor: number) => formatMoney(minor, settings.currencyCode, settings.locale);

  return (
    <>
      <PageHeader
        title="Invoices"
        back={{ href: "/fees", label: "Fees & payments" }}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/fees/invoices/generate">
                <FilePlus2Icon aria-hidden /> Generate for a class
              </Link>
            </Button>
            <Button asChild>
              <Link href="/fees/invoices/new">
                <PlusIcon aria-hidden /> New invoice
              </Link>
            </Button>
          </>
        }
      />
      <FilterBar basePath="/fees/invoices">
        <FilterSearch defaultValue={filters.q} placeholder="Invoice no., student or admission no." />
        <FilterSelect name="status" label="Status" defaultValue={filters.status} options={invoiceStatusOptions} />
        <label className="flex h-9 items-center gap-2 text-sm">
          <Checkbox name="overdue" defaultChecked={filters.overdue} /> Overdue only
        </label>
      </FilterBar>
      {result.items.length === 0 ? (
        <EmptyState title="No invoices found" />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Student</TableHead>
                <TableHead className="hidden md:table-cell">Due</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell>
                    <Link
                      href={`/fees/invoices/${inv.id}`}
                      className="text-primary font-mono text-xs font-medium hover:underline"
                    >
                      {inv.invoiceNumber}
                    </Link>
                    <div className="text-muted-foreground text-xs">{formatDate(inv.issueDate)}</div>
                  </TableCell>
                  <TableCell>
                    <Link href={`/students/${inv.student.id}`} className="hover:underline">
                      {fullName(inv.student)}
                    </Link>
                    <div className="text-muted-foreground font-mono text-xs">{inv.student.admissionNumber}</div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{formatDate(inv.dueDate)}</TableCell>
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
        </Card>
      )}
      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        basePath="/fees/invoices"
        searchParams={sp}
      />
    </>
  );
}

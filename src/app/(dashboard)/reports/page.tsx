import { DownloadIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BarChart } from "@/components/shared/bar-chart";
import { FilterBar, FilterSelect } from "@/components/shared/filter-bar";
import { EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Role } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/utils/dates";
import { formatPercent, fullName } from "@/lib/utils/format";
import { formatMoney } from "@/lib/utils/money";
import { param } from "@/lib/utils/pagination";
import { requireActor } from "@/server/auth/session";
import { getCurrentSession, listSessions } from "@/server/services/academics.service";
import { getExamPerformance } from "@/server/services/exam.service";
import { getFeeOverview, listOverdueInvoices } from "@/server/services/fee.service";
import { getSettings } from "@/server/services/settings.service";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const actor = await requireActor(Role.ADMIN);
  const sp = await searchParams;
  const [sessions, current, settings] = await Promise.all([listSessions(), getCurrentSession(), getSettings()]);
  const sessionId = param(sp.sessionId) ?? current?.id;
  const [exams, fees, overdue] = await Promise.all([
    getExamPerformance(actor, { academicSessionId: sessionId }),
    getFeeOverview(actor),
    listOverdueInvoices(actor),
  ]);
  const money = (minor: number) => formatMoney(minor, settings.currencyCode, settings.locale);

  return (
    <>
      <PageHeader
        title="Reports"
        description="Examination performance and fee collection. Attendance reports are per section."
        actions={
          <Button asChild variant="outline">
            <Link href="/attendance/report">Attendance report</Link>
          </Button>
        }
      />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Examination performance</CardTitle>
            <CardDescription>
              Average percentage and pass rate (students with complete results) per exam.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FilterBar basePath="/reports">
              <FilterSelect
                name="sessionId"
                label="Session"
                allLabel="Current"
                defaultValue={param(sp.sessionId)}
                options={sessions.map((s) => ({ value: s.id, label: s.name }))}
              />
            </FilterBar>
            {exams.length === 0 ? (
              <EmptyState title="No exams in this session" />
            ) : (
              <>
                <BarChart
                  data={exams.map((e) => ({ label: `${e.exam.className} ${e.exam.name}`, value: e.averagePercentage }))}
                  valueLabel="Average"
                  unit="%"
                  domainMax={100}
                />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Exam</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Students</TableHead>
                      <TableHead className="text-right">Average</TableHead>
                      <TableHead className="text-right">Pass rate</TableHead>
                      <TableHead className="hidden lg:table-cell">Subject averages</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exams.map((e) => (
                      <TableRow key={e.exam.id}>
                        <TableCell>
                          <Link
                            href={`/examinations/${e.exam.id}`}
                            className="text-primary font-medium hover:underline"
                          >
                            {e.exam.name}
                          </Link>
                          <div className="text-muted-foreground text-xs">{e.exam.className}</div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={e.exam.status} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{e.students}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPercent(e.averagePercentage)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPercent(e.passRate)}</TableCell>
                        <TableCell className="text-muted-foreground hidden text-xs lg:table-cell">
                          {e.subjects.map((s) => `${s.name}: ${formatPercent(s.average)}`).join(" · ")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Billed (all time)" value={money(fees.billedMinor)} />
          <StatCard label="Collected" value={money(fees.collectedMinor)} tone="success" />
          <StatCard label="Outstanding" value={money(fees.outstandingMinor)} tone="warning" />
          <StatCard
            label="Overdue"
            value={money(fees.overdueMinor)}
            hint={`${fees.overdueCount} invoice(s)`}
            tone="danger"
          />
        </div>

        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Overdue invoices</CardTitle>
              <CardDescription>Unpaid balances past their due date.</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <a href="/api/reports/fees">
                <DownloadIcon aria-hidden /> Export CSV
              </a>
            </Button>
          </CardHeader>
          <CardContent>
            {overdue.length === 0 ? (
              <EmptyState title="No overdue invoices" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead className="hidden md:table-cell">Class</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Days overdue</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overdue.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <Link
                          href={`/fees/invoices/${inv.id}`}
                          className="text-primary font-mono text-xs hover:underline"
                        >
                          {inv.invoiceNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {fullName(inv.student)}
                        <div className="text-muted-foreground text-xs">{inv.student.guardianPhone}</div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{inv.sectionName}</TableCell>
                      <TableCell>{formatDate(inv.dueDate)}</TableCell>
                      <TableCell className="text-right tabular-nums">{inv.daysOverdue}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(inv.outstandingMinor)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

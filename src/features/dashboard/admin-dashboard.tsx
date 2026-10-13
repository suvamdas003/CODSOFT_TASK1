import Link from "next/link";
import { BarChart } from "@/components/shared/bar-chart";
import { EmptyState, StatCard, StatusBadge } from "@/components/shared/page";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, parseDateOnly } from "@/lib/utils/dates";
import { formatPercent } from "@/lib/utils/format";
import { formatMoney } from "@/lib/utils/money";
import type { getAdminDashboard } from "@/server/services/dashboard.service";

type Data = Awaited<ReturnType<typeof getAdminDashboard>>;

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(parseDateOnly(iso));

export function AdminDashboard({ data, currency, locale }: { data: Data; currency: string; locale: string }) {
  const money = (minor: number) => formatMoney(minor, currency, locale);
  const { fees } = data;
  return (
    <div className="space-y-6">
      {!data.session ? (
        <Alert variant="warning">
          No current academic session is set.{" "}
          <Link href="/academics/sessions" className="font-medium underline">
            Create or select one
          </Link>{" "}
          to start.
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active students" value={data.counts.students} href="/students?status=ACTIVE" />
        <StatCard label="Active teachers" value={data.counts.teachers} href="/teachers?status=ACTIVE" />
        <StatCard
          label="Attendance today"
          value={formatPercent(data.attendanceToday.percentage)}
          hint={`${data.attendanceToday.counts.ABSENT} absent · ${data.pendingAttendance.length} section(s) not yet recorded`}
          href="/attendance"
        />
        <StatCard
          label="Outstanding fees"
          value={money(fees.outstandingMinor)}
          hint={`${fees.overdueCount} overdue invoice(s) · ${money(fees.overdueMinor)}`}
          tone={fees.overdueCount > 0 ? "danger" : "default"}
          href="/fees/invoices?overdue=on"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Daily attendance rate</CardTitle>
            <CardDescription>All sections, last 14 days</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart
              data={data.trend.map((d) => ({
                label: shortDate(d.date),
                value: d.percentage,
                detail: `${d.ABSENT} absent`,
              }))}
              valueLabel="Attendance"
              unit="%"
              domainMax={100}
              emptyMessage="No attendance recorded in the last 14 days."
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Examination performance</CardTitle>
            <CardDescription>Average score per exam{data.session ? ` · ${data.session.name}` : ""}</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart
              data={data.exams
                .filter((e) => e.averagePercentage !== null)
                .map((e) => ({
                  label: `${e.exam.className} ${e.exam.name}`,
                  value: e.averagePercentage,
                  detail: e.passRate === null ? "no complete results" : `${formatPercent(e.passRate)} pass`,
                }))}
              valueLabel="Average"
              unit="%"
              domainMax={100}
              emptyMessage="No marks entered yet this session."
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Attendance to record today</CardTitle>
          </CardHeader>
          <CardContent>
            {data.pendingAttendance.length === 0 ? (
              <p className="text-muted-foreground text-sm">Every section with students has attendance for today.</p>
            ) : (
              <ul className="divide-y text-sm">
                {data.pendingAttendance.slice(0, 8).map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-2">
                    <span>{s.label}</span>
                    <Link href={`/attendance?sectionId=${s.id}`} className="text-primary font-medium hover:underline">
                      Record
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Outstanding by class</CardTitle>
          </CardHeader>
          <CardContent>
            {fees.byClass.length === 0 ? (
              <p className="text-muted-foreground text-sm">No outstanding balances.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class</TableHead>
                    <TableHead className="text-right">Invoices</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fees.byClass.map((row) => (
                    <TableRow key={row.className}>
                      <TableCell>{row.className}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.invoices}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(row.outstandingMinor)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent activity</CardTitle>
            <Link href="/audit-log" className="text-primary text-sm font-medium hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {data.activity.length === 0 ? (
              <EmptyState title="No activity yet" />
            ) : (
              <ul className="space-y-3 text-sm">
                {data.activity.map((a) => (
                  <li key={a.id}>
                    <p>{a.summary}</p>
                    <p className="text-muted-foreground text-xs">
                      {a.actor?.name ?? "System"} · {formatDateTime(a.createdAt)} ·{" "}
                      <StatusBadge status={a.entityType} label={a.entityType} />
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

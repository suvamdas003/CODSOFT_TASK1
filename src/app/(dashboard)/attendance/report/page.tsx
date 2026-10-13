import { DownloadIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, StatCard } from "@/components/shared/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Role } from "@/generated/prisma/enums";
import {
  addDays,
  formatDate,
  isDateOnlyString,
  parseDateOnly,
  toDateOnlyString,
  todayDateOnly,
} from "@/lib/utils/dates";
import { formatPercent } from "@/lib/utils/format";
import { param } from "@/lib/utils/pagination";
import { requireActor } from "@/server/auth/session";
import { load } from "@/server/page";
import { sectionOptions } from "@/server/services/academics.service";
import { getSectionAttendanceReport } from "@/server/services/attendance.service";

export const metadata: Metadata = { title: "Attendance report" };

export default async function AttendanceReportPage({ searchParams }: PageProps<"/attendance/report">) {
  const actor = await requireActor(Role.ADMIN, Role.TEACHER);
  const sp = await searchParams;
  const sections = await sectionOptions(actor, { allSessions: true });
  const sectionId = param(sp.sectionId);
  const fromParam = param(sp.from);
  const toParam = param(sp.to);
  const to = toParam && isDateOnlyString(toParam) ? toParam : toDateOnlyString(todayDateOnly());
  const from = fromParam && isDateOnlyString(fromParam) ? fromParam : toDateOnlyString(addDays(parseDateOnly(to), -29));
  const report = sectionId ? await load(getSectionAttendanceReport(actor, { sectionId, from, to })) : null;
  const csvHref = sectionId ? `/api/reports/attendance?${new URLSearchParams({ sectionId, from, to })}` : null;

  return (
    <>
      <PageHeader
        title="Attendance report"
        description="Class-wise and date-wise attendance with percentages calculated by the institution's attendance policy."
        back={{ href: "/attendance", label: "Attendance" }}
        actions={
          csvHref ? (
            <Button asChild variant="outline">
              <a href={csvHref}>
                <DownloadIcon aria-hidden /> Export CSV
              </a>
            </Button>
          ) : null
        }
      />
      <Card className="mb-6">
        <CardContent className="pt-5">
          <form method="get" className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="sectionId">Section</Label>
              <NativeSelect id="sectionId" name="sectionId" defaultValue={sectionId ?? ""} required>
                <option value="" disabled>
                  Choose a section
                </option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="from">From</Label>
              <Input id="from" type="date" name="from" defaultValue={from} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to">To</Label>
              <Input id="to" type="date" name="to" defaultValue={to} required />
            </div>
            <Button type="submit">Run report</Button>
          </form>
        </CardContent>
      </Card>

      {!report ? (
        <EmptyState title="Choose a section and date range" />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Overall attendance" value={formatPercent(report.overall.percentage)} />
            <StatCard label="Present" value={report.overall.counts.PRESENT} />
            <StatCard label="Late" value={report.overall.counts.LATE} />
            <StatCard label="Absent" value={report.overall.counts.ABSENT} />
            <StatCard label="Excused" value={report.overall.counts.EXCUSED} />
          </div>
          <p className="text-muted-foreground text-xs">
            Policy: late {report.policy.lateCountsAsPresent ? "counts" : "does not count"} as attended; excused days are{" "}
            {report.policy.excusedExcludedFromTotal ? "excluded from" : "counted as absent in"} the total. Students
            below {report.policy.lowAttendanceThreshold}% are flagged.
          </p>
          <Card>
            <CardHeader>
              <CardTitle>
                {report.section.label} · {formatDate(report.from)} – {formatDate(report.to)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {report.students.length === 0 ? (
                <EmptyState title="No students" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead className="text-right">Present</TableHead>
                      <TableHead className="text-right">Late</TableHead>
                      <TableHead className="text-right">Absent</TableHead>
                      <TableHead className="text-right">Excused</TableHead>
                      <TableHead className="text-right">Attendance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.students.map((row) => (
                      <TableRow key={row.student.id}>
                        <TableCell>
                          <Link
                            href={`/students/${row.student.id}`}
                            className="text-primary font-medium hover:underline"
                          >
                            {row.name}
                          </Link>
                          <div className="text-muted-foreground font-mono text-xs">{row.student.admissionNumber}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{row.counts.PRESENT}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.counts.LATE}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.counts.ABSENT}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.counts.EXCUSED}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPercent(row.percentage)} {row.low ? <Badge variant="danger">Low</Badge> : null}
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
              <CardTitle>Date-wise summary</CardTitle>
            </CardHeader>
            <CardContent>
              {report.days.length === 0 ? (
                <EmptyState title="No attendance recorded in this range" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Present</TableHead>
                      <TableHead className="text-right">Late</TableHead>
                      <TableHead className="text-right">Absent</TableHead>
                      <TableHead className="text-right">Excused</TableHead>
                      <TableHead className="text-right">Attendance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.days.map((d) => (
                      <TableRow key={d.date}>
                        <TableCell>
                          <Link
                            href={`/attendance?sectionId=${report.section.id}&date=${d.date}`}
                            className="text-primary hover:underline"
                          >
                            {formatDate(parseDateOnly(d.date))}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{d.counts.PRESENT}</TableCell>
                        <TableCell className="text-right tabular-nums">{d.counts.LATE}</TableCell>
                        <TableCell className="text-right tabular-nums">{d.counts.ABSENT}</TableCell>
                        <TableCell className="text-right tabular-nums">{d.counts.EXCUSED}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPercent(d.percentage)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

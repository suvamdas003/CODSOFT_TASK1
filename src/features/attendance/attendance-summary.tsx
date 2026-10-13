import { StatusBadge } from "@/components/shared/page";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils/dates";
import { formatPercent } from "@/lib/utils/format";
import type { getStudentAttendanceSummary } from "@/server/services/attendance.service";

type Summary = Awaited<ReturnType<typeof getStudentAttendanceSummary>>;

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );

export function AttendanceSummary({ summary, showRecent = true }: { summary: Summary; showRecent?: boolean }) {
  const { counts } = summary;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Attendance{summary.sessionName ? ` · ${summary.sessionName}` : ""}</CardTitle>
          <CardDescription>{summary.total} day(s) recorded</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Metric label="Attendance" value={formatPercent(summary.percentage)} strong />
            <Metric label="Present" value={counts.PRESENT} />
            <Metric label="Late" value={counts.LATE} />
            <Metric label="Absent" value={counts.ABSENT} />
            <Metric label="Excused" value={counts.EXCUSED} />
          </div>
          {summary.low ? <Alert variant="warning">Attendance is below the required {summary.threshold}%.</Alert> : null}
          {summary.months.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Present</TableHead>
                  <TableHead className="text-right">Late</TableHead>
                  <TableHead className="text-right">Absent</TableHead>
                  <TableHead className="text-right">Excused</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.months.map((m) => (
                  <TableRow key={m.month}>
                    <TableCell>{monthLabel(m.month)}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.counts.PRESENT}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.counts.LATE}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.counts.ABSENT}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.counts.EXCUSED}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPercent(m.percentage)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm">No attendance has been recorded yet.</p>
          )}
        </CardContent>
      </Card>

      {showRecent && summary.recent.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Recent days</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.recent.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{formatDate(r.date)}</TableCell>
                    <TableCell>{r.sectionLabel}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.remarks ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Metric({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="bg-muted/60 rounded-lg p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={strong ? "text-xl font-semibold tabular-nums" : "text-lg font-medium tabular-nums"}>{value}</p>
    </div>
  );
}

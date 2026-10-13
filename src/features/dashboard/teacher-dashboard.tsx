import Link from "next/link";
import { BarChart } from "@/components/shared/bar-chart";
import { EmptyState, StatCard } from "@/components/shared/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { parseDateOnly } from "@/lib/utils/dates";
import type { getTeacherDashboard } from "@/server/services/dashboard.service";

type Data = Awaited<ReturnType<typeof getTeacherDashboard>>;

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(parseDateOnly(iso));

export function TeacherDashboard({ data }: { data: Data }) {
  const sectionCount = new Set(data.assignments.map((a) => a.sectionId)).size;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Sections taught"
          value={sectionCount}
          hint={
            data.classSections.length
              ? `Class teacher of ${data.classSections.map((s) => s.label).join(", ")}`
              : undefined
          }
        />
        <StatCard
          label="Attendance to record today"
          value={data.pendingAttendance.length}
          tone={data.pendingAttendance.length ? "warning" : "success"}
          href="/attendance"
        />
        <StatCard
          label="Marks entry tasks"
          value={data.marksTasks.length}
          tone={data.marksTasks.length ? "warning" : "success"}
          href="/examinations"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Attendance tasks</CardTitle>
            <CardDescription>Your sections without attendance for today</CardDescription>
          </CardHeader>
          <CardContent>
            {data.pendingAttendance.length === 0 ? (
              <p className="text-muted-foreground text-sm">All caught up for today.</p>
            ) : (
              <ul className="divide-y text-sm">
                {data.pendingAttendance.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-2">
                    <span>
                      {s.label} <span className="text-muted-foreground">· {s.students} students</span>
                    </span>
                    <Link href={`/attendance?sectionId=${s.id}`} className="text-primary font-medium hover:underline">
                      Take attendance
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Examination tasks</CardTitle>
            <CardDescription>Draft exams with marks still to enter</CardDescription>
          </CardHeader>
          <CardContent>
            {data.marksTasks.length === 0 ? (
              <p className="text-muted-foreground text-sm">No pending marks entry.</p>
            ) : (
              <ul className="divide-y text-sm">
                {data.marksTasks.map((t) => (
                  <li
                    key={`${t.examSubjectId}-${t.sectionId}`}
                    className="flex items-center justify-between gap-2 py-2"
                  >
                    <span>
                      <span className="font-medium">{t.examName}</span> · {t.label}
                      <span className="text-muted-foreground block text-xs">
                        {t.entered} of {t.total} entered
                      </span>
                    </span>
                    <Link
                      href={`/examinations/${t.examId}/marks?examSubjectId=${t.examSubjectId}&sectionId=${t.sectionId}`}
                      className="text-primary shrink-0 font-medium hover:underline"
                    >
                      Enter marks
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>My classes</CardTitle>
            <CardDescription>{data.session ? data.session.name : "No current session"}</CardDescription>
          </CardHeader>
          <CardContent>
            {data.assignments.length === 0 ? (
              <EmptyState
                title="No teaching assignments"
                description="An administrator assigns sections and subjects."
              />
            ) : (
              <ul className="divide-y text-sm">
                {data.assignments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-2">
                    <span>
                      <span className="font-medium">{a.subject}</span> · {a.section}
                    </span>
                    <Link href={`/students?sectionId=${a.sectionId}`} className="text-primary hover:underline">
                      {a.students} students
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Attendance rate in my sections</CardTitle>
            <CardDescription>Last 7 days</CardDescription>
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
              height={200}
              emptyMessage="No attendance recorded in the last 7 days."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

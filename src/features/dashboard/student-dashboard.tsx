import Link from "next/link";
import { EmptyState, StatCard } from "@/components/shared/page";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResultsList } from "@/features/examinations/results-list";
import { formatDate } from "@/lib/utils/dates";
import { formatPercent, sectionLabel } from "@/lib/utils/format";
import { formatMoney } from "@/lib/utils/money";
import type { getStudentDashboard } from "@/server/services/dashboard.service";

type Data = NonNullable<Awaited<ReturnType<typeof getStudentDashboard>>>;

export function StudentDashboard({ data, currency, locale }: { data: Data; currency: string; locale: string }) {
  const money = (minor: number) => formatMoney(minor, currency, locale);
  const { attendance, fees, student } = data;
  const latest = data.results.find((r) => r.summary.percentage !== null);
  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">
        {student.section
          ? `${sectionLabel(student.section)} · ${student.section.academicSession.name}`
          : "Not assigned to a section"}{" "}
        · Admission no. {student.admissionNumber}
      </p>
      {attendance.low ? (
        <Alert variant="warning">Your attendance is below the required {attendance.threshold}%.</Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Attendance"
          value={formatPercent(attendance.percentage)}
          hint={`${attendance.counts.ABSENT} absent · ${attendance.total} days recorded`}
          href="/my/attendance"
        />
        <StatCard
          label="Latest result"
          value={latest ? formatPercent(latest.summary.percentage) : "—"}
          hint={
            latest ? `${latest.exam.name} · grade ${latest.summary.grade?.label ?? "—"}` : "No published results yet"
          }
          href="/my/results"
        />
        <StatCard
          label="Fees outstanding"
          value={money(fees.totals.outstandingMinor)}
          tone={fees.totals.overdueMinor > 0 ? "danger" : fees.totals.outstandingMinor > 0 ? "warning" : "success"}
          href="/my/fees"
        />
        <StatCard
          label="Next due"
          value={fees.nextDue ? money(fees.nextDue.amountMinor) : "—"}
          hint={fees.nextDue ? `${fees.nextDue.invoiceNumber} · ${formatDate(fees.nextDue.dueDate)}` : "Nothing due"}
          href={fees.nextDue ? `/fees/invoices/${fees.nextDue.invoiceId}` : "/my/fees"}
        />
      </div>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent results</h2>
          <Link href="/my/results" className="text-primary text-sm font-medium hover:underline">
            All results
          </Link>
        </div>
        <ResultsList results={data.results} studentId={student.id} showStatus={false} />
      </section>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Recent payments</CardTitle>
          <Link href="/my/fees" className="text-primary text-sm font-medium hover:underline">
            Fee details
          </Link>
        </CardHeader>
        <CardContent>
          {fees.payments.length === 0 ? (
            <EmptyState title="No payments recorded" />
          ) : (
            <ul className="divide-y text-sm">
              {fees.payments.slice(0, 5).map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2">
                  <Link href={`/fees/receipts/${p.id}`} className="text-primary font-mono text-xs hover:underline">
                    {p.receiptNumber}
                  </Link>
                  <span className="text-muted-foreground">{formatDate(p.paidAt)}</span>
                  <span className="tabular-nums">{money(p.amountMinor)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

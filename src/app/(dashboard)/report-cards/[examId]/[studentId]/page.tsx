import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page";
import { PrintButton } from "@/components/shared/print-button";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExamStatus, Role } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/utils/dates";
import { formatPercent } from "@/lib/utils/format";
import { requireActor } from "@/server/auth/session";
import { load } from "@/server/page";
import { getReportCard } from "@/server/services/exam.service";

export const metadata: Metadata = { title: "Report card" };

export default async function ReportCardPage({ params }: PageProps<"/report-cards/[examId]/[studentId]">) {
  const actor = await requireActor();
  const { examId, studentId } = await params;
  const card = await load(getReportCard(actor, examId, studentId));
  const back =
    actor.role === Role.STUDENT
      ? { href: "/my/results", label: "My results" }
      : { href: `/students/${studentId}`, label: "Student profile" };
  const { summary } = card;

  return (
    <>
      <PageHeader title="Report card" back={back} actions={<PrintButton label="Print report card" />} />
      {card.exam.status !== ExamStatus.PUBLISHED ? (
        <Alert variant="warning" className="mb-4 print:hidden">
          Draft: these results are not published yet and may change.
        </Alert>
      ) : null}
      <Card className="print-area mx-auto max-w-3xl">
        <CardContent className="space-y-6 p-6 sm:p-8">
          <header className="border-b pb-4 text-center">
            <h2 className="text-xl font-bold">{card.institution.name}</h2>
            {card.institution.address ? (
              <p className="text-muted-foreground text-sm">{card.institution.address}</p>
            ) : null}
            <p className="mt-2 text-sm font-semibold tracking-wide uppercase">
              {card.exam.name} · {card.exam.sessionName}
            </p>
          </header>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Student</dt>
              <dd className="font-medium">{card.student.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Admission no.</dt>
              <dd className="font-mono">{card.student.admissionNumber}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Class</dt>
              <dd>{card.student.sectionName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Date of birth</dt>
              <dd>{formatDate(card.student.dateOfBirth)}</dd>
            </div>
          </dl>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead className="text-right">Max</TableHead>
                <TableHead className="text-right">Obtained</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead>Remarks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {card.subjects.map((s) => (
                <TableRow key={s.examSubjectId}>
                  <TableCell className="font-medium">{s.subject.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.maxMarks}</TableCell>
                  <TableCell className={`text-right tabular-nums ${s.entered && !s.passed ? "text-destructive" : ""}`}>
                    {!s.entered ? "—" : s.isAbsent ? "Absent" : s.marksObtained}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatPercent(s.percentage)}</TableCell>
                  <TableCell>{s.grade ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{s.remarks ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular-nums">{summary.totalMax}</TableCell>
                <TableCell className="text-right tabular-nums">{summary.totalObtained}</TableCell>
                <TableCell className="text-right tabular-nums">{formatPercent(summary.percentage)}</TableCell>
                <TableCell>{summary.grade?.label ?? "—"}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>

          <div className="grid gap-4 text-sm sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-muted-foreground">Result</p>
              <p className="text-lg font-semibold">
                {!summary.complete ? "Incomplete" : summary.passed ? "Pass" : "Fail"}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-muted-foreground">Overall grade</p>
              <p className="text-lg font-semibold">
                {summary.grade?.label ?? "—"}
                {summary.grade?.remark ? (
                  <span className="text-muted-foreground text-sm font-normal"> · {summary.grade.remark}</span>
                ) : null}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-muted-foreground">Attendance (session)</p>
              <p className="text-lg font-semibold">{formatPercent(card.attendance.percentage)}</p>
            </div>
          </div>

          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">
              Grade scale · {card.exam.scaleName}
            </p>
            <p className="text-muted-foreground text-xs">
              {[...card.bands]
                .sort((a, b) => b.minPercent - a.minPercent)
                .map((b) => `${b.label} ≥ ${b.minPercent}%`)
                .join(" · ")}
            </p>
          </div>

          <footer className="text-muted-foreground grid grid-cols-2 gap-8 pt-10 text-center text-xs">
            <div className="border-t pt-2">Class teacher</div>
            <div className="border-t pt-2">Principal</div>
          </footer>
        </CardContent>
      </Card>
    </>
  );
}

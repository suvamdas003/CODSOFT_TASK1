import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, PageHeader, StatusBadge } from "@/components/shared/page";
import { PrintButton } from "@/components/shared/print-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Role } from "@/generated/prisma/enums";
import { formatPercent } from "@/lib/utils/format";
import { param } from "@/lib/utils/pagination";
import { requireActor } from "@/server/auth/session";
import { load } from "@/server/page";
import { getSectionResults } from "@/server/services/exam.service";

export const metadata: Metadata = { title: "Results" };

export default async function ResultsPage({ params, searchParams }: PageProps<"/examinations/[id]/results">) {
  const actor = await requireActor(Role.ADMIN, Role.TEACHER);
  const { id } = await params;
  const sectionId = param((await searchParams).sectionId);
  if (!sectionId) notFound();
  const results = await load(getSectionResults(actor, id, sectionId));
  const { exam } = results;

  return (
    <>
      <PageHeader
        title={`${exam.name} results`}
        description={`${results.section.label} · ${exam.academicSession.name}`}
        back={{ href: `/examinations/${id}`, label: exam.name }}
        actions={<PrintButton />}
      />
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-sm">
          Status: <StatusBadge status={exam.status} />
        </div>
        <Card className="print-area">
          <CardHeader>
            <CardTitle>Student results</CardTitle>
          </CardHeader>
          <CardContent>
            {results.rows.length === 0 ? (
              <EmptyState title="No students" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">Rank</TableHead>
                    <TableHead>Student</TableHead>
                    {exam.subjects.map((es) => (
                      <TableHead key={es.id} className="text-right">
                        {es.subject.code}
                        <div className="font-normal normal-case">/{es.maxMarks}</div>
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">%</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.rows.map((row) => (
                    <TableRow key={row.student.id}>
                      <TableCell className="text-right tabular-nums">{row.rank ?? "—"}</TableCell>
                      <TableCell>
                        <Link
                          href={`/report-cards/${exam.id}/${row.student.id}`}
                          className="text-primary font-medium hover:underline"
                        >
                          {row.name}
                        </Link>
                        <div className="text-muted-foreground font-mono text-xs">{row.student.admissionNumber}</div>
                      </TableCell>
                      {row.subjects.map((s) => (
                        <TableCell
                          key={s.examSubjectId}
                          className={`text-right tabular-nums ${s.entered && !s.passed ? "text-destructive" : ""}`}
                        >
                          {!s.entered ? "—" : s.isAbsent ? "AB" : s.marksObtained}
                        </TableCell>
                      ))}
                      <TableCell className="text-right tabular-nums">
                        {row.summary.percentage === null ? "—" : `${row.summary.totalObtained}/${row.summary.totalMax}`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatPercent(row.summary.percentage)}</TableCell>
                      <TableCell>{row.summary.grade?.label ?? "—"}</TableCell>
                      <TableCell>
                        {!row.summary.complete ? (
                          <Badge variant="neutral">Incomplete</Badge>
                        ) : row.summary.passed ? (
                          <Badge variant="success">Pass</Badge>
                        ) : (
                          <Badge variant="danger">Fail</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card className="print-area">
          <CardHeader>
            <CardTitle>Subject statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead className="text-right">Entered</TableHead>
                  <TableHead className="text-right">Average</TableHead>
                  <TableHead className="text-right">Highest</TableHead>
                  <TableHead className="text-right">Passed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.subjectStats.map((s) => (
                  <TableRow key={s.subject.id}>
                    <TableCell>{s.subject.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.entered}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.average ?? "—"} / {s.maxMarks}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.highest ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.passCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

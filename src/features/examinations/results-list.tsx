import Link from "next/link";
import { EmptyState, StatusBadge } from "@/components/shared/page";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPercent } from "@/lib/utils/format";
import type { getStudentResults } from "@/server/services/exam.service";

type Results = Awaited<ReturnType<typeof getStudentResults>>;

export function ResultsList({
  results,
  studentId,
  showStatus,
}: {
  results: Results;
  studentId: string;
  showStatus: boolean;
}) {
  if (results.length === 0) {
    return <EmptyState title="No examination results yet" description="Results appear here once they are published." />;
  }
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Exam</TableHead>
            <TableHead className="hidden sm:table-cell">Session</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">%</TableHead>
            <TableHead>Grade</TableHead>
            <TableHead>Result</TableHead>
            <TableHead className="text-right">Report card</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map(({ exam, summary }) => (
            <TableRow key={exam.id}>
              <TableCell>
                <span className="font-medium">{exam.name}</span>
                <div className="text-muted-foreground text-xs">{exam.className}</div>
                {showStatus && exam.status === "DRAFT" ? <StatusBadge status="DRAFT" label="Not published" /> : null}
              </TableCell>
              <TableCell className="hidden sm:table-cell">{exam.sessionName}</TableCell>
              <TableCell className="text-right tabular-nums">
                {summary.percentage === null ? "—" : `${summary.totalObtained} / ${summary.totalMax}`}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatPercent(summary.percentage)}</TableCell>
              <TableCell>{summary.grade?.label ?? "—"}</TableCell>
              <TableCell>
                {!summary.complete ? (
                  <Badge variant="neutral">Incomplete</Badge>
                ) : summary.passed ? (
                  <Badge variant="success">Pass</Badge>
                ) : (
                  <Badge variant="danger">Fail</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Link
                  href={`/report-cards/${exam.id}/${studentId}`}
                  className="text-primary text-sm font-medium hover:underline"
                >
                  View
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

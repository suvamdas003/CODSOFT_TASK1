import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar, FilterSelect } from "@/components/shared/filter-bar";
import { FormDialog } from "@/components/shared/form-dialog";
import { EmptyState, PageHeader, StatusBadge } from "@/components/shared/page";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Role } from "@/generated/prisma/enums";
import { createExamAction } from "@/features/examinations/actions";
import { ExamFields } from "@/features/examinations/exam-fields";
import { formatDate } from "@/lib/utils/dates";
import { param } from "@/lib/utils/pagination";
import { requireActor } from "@/server/auth/session";
import { getCurrentSession, listClasses, listSessions } from "@/server/services/academics.service";
import { listExams } from "@/server/services/exam.service";
import { listGradeScales } from "@/server/services/settings.service";

export const metadata: Metadata = { title: "Examinations" };

export default async function ExaminationsPage({ searchParams }: PageProps<"/examinations">) {
  const actor = await requireActor(Role.ADMIN, Role.TEACHER);
  const sp = await searchParams;
  const isAdmin = actor.role === Role.ADMIN;
  const [sessions, classes, current, scales] = await Promise.all([
    listSessions(),
    listClasses(),
    getCurrentSession(),
    isAdmin ? listGradeScales() : Promise.resolve([]),
  ]);
  const sessionId = param(sp.sessionId) ?? current?.id;
  const exams = await listExams(actor, { academicSessionId: sessionId, classId: param(sp.classId) });
  const sessionOptions = sessions.map((s) => ({ value: s.id, label: s.name }));
  const classOptions = classes.map((c) => ({ value: c.id, label: c.name }));

  return (
    <>
      <PageHeader
        title="Examinations"
        description={
          isAdmin
            ? "Create exams, configure subjects and maximum marks, and publish results."
            : "Exams for the classes you teach. Open one to enter marks."
        }
        actions={
          isAdmin && classes.length > 0 && scales.length > 0 ? (
            <FormDialog
              action={createExamAction}
              title="New examination"
              triggerLabel={
                <>
                  <PlusIcon aria-hidden /> New exam
                </>
              }
              submitLabel="Create"
            >
              <ExamFields
                sessions={sessionOptions}
                classes={classOptions}
                scales={scales.map((s) => ({ value: s.id, label: s.name }))}
                defaults={{ academicSessionId: current?.id, gradeScaleId: scales.find((s) => s.isDefault)?.id }}
              />
            </FormDialog>
          ) : null
        }
      />
      <FilterBar basePath="/examinations">
        <FilterSelect
          name="sessionId"
          label="Session"
          allLabel="Current"
          defaultValue={param(sp.sessionId)}
          options={sessionOptions}
        />
        <FilterSelect name="classId" label="Class" defaultValue={param(sp.classId)} options={classOptions} />
      </FilterBar>
      {exams.length === 0 ? (
        <EmptyState
          title="No examinations found"
          description={isAdmin ? "Create an exam to start recording marks." : undefined}
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Exam</TableHead>
                <TableHead>Class</TableHead>
                <TableHead className="hidden md:table-cell">Dates</TableHead>
                <TableHead className="text-right">Subjects</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exams.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <Link href={`/examinations/${e.id}`} className="text-primary font-medium hover:underline">
                      {e.name}
                    </Link>
                    <div className="text-muted-foreground text-xs">{e.academicSession.name}</div>
                  </TableCell>
                  <TableCell>{e.class.name}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {e.startDate ? `${formatDate(e.startDate)} – ${formatDate(e.endDate)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{e._count.subjects}</TableCell>
                  <TableCell>
                    <StatusBadge status={e.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}

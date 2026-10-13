import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { FormDialog } from "@/components/shared/form-dialog";
import { DetailList, EmptyState, PageHeader, StatusBadge } from "@/components/shared/page";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExamStatus, Role } from "@/generated/prisma/enums";
import {
  addExamSubjectAction,
  deleteExamAction,
  removeExamSubjectAction,
  setExamPublishedAction,
  updateExamAction,
  updateExamSubjectAction,
} from "@/features/examinations/actions";
import { ExamFields, ExamSubjectFields } from "@/features/examinations/exam-fields";
import { formatDate, formatDateTime, toDateOnlyString } from "@/lib/utils/dates";
import { requireActor } from "@/server/auth/session";
import { load } from "@/server/page";
import { listClasses, listSessions, listSubjects } from "@/server/services/academics.service";
import { getExamDetail } from "@/server/services/exam.service";
import { listGradeScales } from "@/server/services/settings.service";

export const metadata: Metadata = { title: "Examination" };

export default async function ExamPage({ params }: PageProps<"/examinations/[id]">) {
  const actor = await requireActor(Role.ADMIN, Role.TEACHER);
  const { id } = await params;
  const detail = await load(getExamDetail(actor, id));
  const { exam } = detail;
  const isDraft = exam.status === ExamStatus.DRAFT;
  const isAdmin = detail.canManage;
  const [sessions, classes, scales, subjects] = isAdmin
    ? await Promise.all([listSessions(), listClasses(), listGradeScales(), listSubjects({ activeOnly: true })])
    : [[], [], [], []];
  const usedSubjectIds = new Set(exam.subjects.map((s) => s.subjectId));
  const subjectOptions = subjects.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }));

  return (
    <>
      <PageHeader
        title={exam.name}
        description={`${exam.class.name} · ${exam.academicSession.name}`}
        back={{ href: "/examinations", label: "Examinations" }}
        actions={
          isAdmin ? (
            <>
              {isDraft ? (
                <FormDialog
                  action={updateExamAction.bind(null, exam.id)}
                  title="Edit examination"
                  triggerLabel="Edit"
                  triggerVariant="outline"
                >
                  <ExamFields
                    sessions={sessions.map((s) => ({ value: s.id, label: s.name }))}
                    classes={classes.map((c) => ({ value: c.id, label: c.name }))}
                    scales={scales.map((s) => ({ value: s.id, label: s.name }))}
                    defaults={{
                      name: exam.name,
                      academicSessionId: exam.academicSessionId,
                      classId: exam.classId,
                      gradeScaleId: exam.gradeScaleId,
                      startDate: exam.startDate ? toDateOnlyString(exam.startDate) : "",
                      endDate: exam.endDate ? toDateOnlyString(exam.endDate) : "",
                    }}
                  />
                </FormDialog>
              ) : null}
              {isDraft ? (
                <ConfirmAction
                  action={setExamPublishedAction.bind(null, exam.id, true)}
                  title="Publish results?"
                  description="Students will be able to see their results and report cards. Marks are locked while the exam is published."
                  confirmLabel="Publish"
                  destructive={false}
                  variant="default"
                  size="default"
                >
                  Publish results
                </ConfirmAction>
              ) : (
                <ConfirmAction
                  action={setExamPublishedAction.bind(null, exam.id, false)}
                  title="Unpublish results?"
                  description="Students will no longer see these results until you publish again. Marks become editable."
                  confirmLabel="Unpublish"
                  size="default"
                >
                  Unpublish
                </ConfirmAction>
              )}
              {isDraft ? (
                <ConfirmAction
                  action={deleteExamAction.bind(null, exam.id)}
                  title="Delete this exam?"
                  description="Only exams without any entered marks can be deleted. This cannot be undone."
                  confirmLabel="Delete"
                  size="default"
                >
                  Delete
                </ConfirmAction>
              ) : null}
            </>
          ) : null
        }
      />

      <div className="space-y-6">
        {!isDraft ? (
          <Alert variant="success">
            Results published {formatDateTime(exam.publishedAt)}. Marks are locked
            {isAdmin ? "; unpublish to make corrections." : "."}
          </Alert>
        ) : null}

        <Card>
          <CardContent className="pt-5">
            <DetailList
              items={[
                { label: "Status", value: <StatusBadge status={exam.status} /> },
                { label: "Grade scale", value: exam.gradeScale.name },
                { label: "Start date", value: formatDate(exam.startDate) },
                { label: "End date", value: formatDate(exam.endDate) },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Subjects</CardTitle>
              <CardDescription>Maximum and pass marks per subject.</CardDescription>
            </div>
            {isAdmin && isDraft ? (
              <FormDialog
                action={addExamSubjectAction.bind(null, exam.id)}
                title="Add subject"
                triggerLabel={
                  <>
                    <PlusIcon aria-hidden /> Add subject
                  </>
                }
                triggerSize="sm"
                submitLabel="Add"
              >
                <ExamSubjectFields subjects={subjectOptions.filter((o) => !usedSubjectIds.has(o.value))} />
              </FormDialog>
            ) : null}
          </CardHeader>
          <CardContent>
            {exam.subjects.length === 0 ? (
              <EmptyState
                title="No subjects yet"
                description={isAdmin ? "Add the subjects this exam covers." : undefined}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead className="text-right">Max</TableHead>
                    <TableHead className="text-right">Pass</TableHead>
                    <TableHead className="hidden sm:table-cell">Date</TableHead>
                    {isAdmin && isDraft ? <TableHead className="text-right">Actions</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exam.subjects.map((es) => (
                    <TableRow key={es.id}>
                      <TableCell className="font-medium">{es.subject.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{es.maxMarks}</TableCell>
                      <TableCell className="text-right tabular-nums">{es.passMarks}</TableCell>
                      <TableCell className="hidden sm:table-cell">{formatDate(es.examDate)}</TableCell>
                      {isAdmin && isDraft ? (
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <FormDialog
                              action={updateExamSubjectAction.bind(null, exam.id, es.id)}
                              title={`Edit ${es.subject.name}`}
                              triggerLabel="Edit"
                              triggerVariant="outline"
                              triggerSize="sm"
                            >
                              <ExamSubjectFields
                                subjects={subjectOptions.filter(
                                  (o) => o.value === es.subjectId || !usedSubjectIds.has(o.value),
                                )}
                                defaults={{
                                  subjectId: es.subjectId,
                                  maxMarks: String(es.maxMarks),
                                  passMarks: String(es.passMarks),
                                  examDate: es.examDate ? toDateOnlyString(es.examDate) : "",
                                }}
                              />
                            </FormDialog>
                            <ConfirmAction
                              action={removeExamSubjectAction.bind(null, exam.id, es.id)}
                              title={`Remove ${es.subject.name}?`}
                              description="Subjects with entered marks cannot be removed."
                              confirmLabel="Remove"
                            >
                              Remove
                            </ConfirmAction>
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Marks entry & results by section</CardTitle>
            <CardDescription>Entered marks out of active students per subject.</CardDescription>
          </CardHeader>
          <CardContent>
            {detail.sections.length === 0 ? (
              <EmptyState
                title="No sections take this exam"
                description="Sections of this class in the exam's session appear here."
              />
            ) : exam.subjects.length === 0 ? (
              <EmptyState title="Add subjects to start entering marks" />
            ) : (
              <div className="space-y-4">
                {detail.sections.map((section) => (
                  <div key={section.id} className="rounded-lg border p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">
                        {section.label}{" "}
                        <span className="text-muted-foreground text-sm font-normal">· {section.students} students</span>
                      </p>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/examinations/${exam.id}/results?sectionId=${section.id}`}>View results</Link>
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {section.subjects.map((s) =>
                        s.canEnter ? (
                          <Link
                            key={s.examSubjectId}
                            href={`/examinations/${exam.id}/marks?examSubjectId=${s.examSubjectId}&sectionId=${section.id}`}
                            className="hover:border-primary/50 hover:bg-accent rounded-md border px-3 py-1.5 text-sm"
                          >
                            {s.subjectName}{" "}
                            <span className={s.entered >= section.students ? "text-success" : "text-muted-foreground"}>
                              {s.entered}/{section.students}
                            </span>
                          </Link>
                        ) : (
                          <span
                            key={s.examSubjectId}
                            className="text-muted-foreground rounded-md border border-dashed px-3 py-1.5 text-sm"
                          >
                            {s.subjectName} {s.entered}/{section.students}
                          </span>
                        ),
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

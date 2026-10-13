import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Role } from "@/generated/prisma/enums";
import { MarksSheet } from "@/features/examinations/marks-sheet";
import { param } from "@/lib/utils/pagination";
import { requireActor } from "@/server/auth/session";
import { load } from "@/server/page";
import { getMarksSheet } from "@/server/services/exam.service";

export const metadata: Metadata = { title: "Enter marks" };

export default async function MarksPage({ params, searchParams }: PageProps<"/examinations/[id]/marks">) {
  const actor = await requireActor(Role.ADMIN, Role.TEACHER);
  const { id } = await params;
  const sp = await searchParams;
  const examSubjectId = param(sp.examSubjectId);
  const sectionId = param(sp.sectionId);
  if (!examSubjectId || !sectionId) notFound();
  const sheet = await load(getMarksSheet(actor, examSubjectId, sectionId));
  if (sheet.exam.id !== id) notFound();

  return (
    <>
      <PageHeader
        title={`${sheet.examSubject.subjectName} marks`}
        description={`${sheet.exam.name} · ${sheet.section.label}`}
        back={{ href: `/examinations/${id}`, label: sheet.exam.name }}
      />
      <Card>
        <CardHeader>
          <CardTitle>{sheet.section.label}</CardTitle>
          <CardDescription>
            Maximum {sheet.examSubject.maxMarks} · pass {sheet.examSubject.passMarks}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sheet.locked ? <Alert variant="warning">Results are published, so marks are locked.</Alert> : null}
          {sheet.rows.length === 0 ? (
            <EmptyState title="No students in this section" />
          ) : (
            <MarksSheet
              examSubjectId={sheet.examSubject.id}
              sectionId={sheet.section.id}
              maxMarks={sheet.examSubject.maxMarks}
              rows={sheet.rows}
              locked={sheet.locked}
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}

import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SelectField } from "@/components/shared/action-form";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { FilterBar, FilterSelect } from "@/components/shared/filter-bar";
import { FormDialog } from "@/components/shared/form-dialog";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Role } from "@/generated/prisma/enums";
import { createAssignmentAction, deleteAssignmentAction } from "@/features/academics/actions";
import { fullName, sectionLabel } from "@/lib/utils/format";
import { param } from "@/lib/utils/pagination";
import { requireActor } from "@/server/auth/session";
import {
  getCurrentSession,
  listAssignments,
  listSessions,
  listSubjects,
  sectionOptions,
} from "@/server/services/academics.service";
import { teacherOptions } from "@/server/services/teacher.service";

export const metadata: Metadata = { title: "Teaching assignments" };

export default async function AssignmentsPage({ searchParams }: PageProps<"/academics/assignments">) {
  const actor = await requireActor(Role.ADMIN);
  const sp = await searchParams;
  const [sessions, current, teachers, subjects] = await Promise.all([
    listSessions(),
    getCurrentSession(),
    teacherOptions(),
    listSubjects({ activeOnly: true }),
  ]);
  const sessionId = param(sp.sessionId) ?? current?.id;
  const [assignments, sections] = await Promise.all([
    listAssignments({ academicSessionId: sessionId, teacherId: param(sp.teacherId) }),
    sessionId ? sectionOptions(actor, { academicSessionId: sessionId }) : Promise.resolve([]),
  ]);
  const teacherOpts = teachers.map((t) => ({ value: t.id, label: t.label }));

  return (
    <>
      <PageHeader
        title="Teaching assignments"
        description="A teacher can record attendance and marks only for the sections and subjects assigned here."
        back={{ href: "/academics", label: "Academics" }}
        actions={
          sections.length > 0 ? (
            <FormDialog
              action={createAssignmentAction}
              title="Assign a teacher"
              triggerLabel={
                <>
                  <PlusIcon aria-hidden /> Assign teacher
                </>
              }
              submitLabel="Assign"
            >
              <SelectField
                name="teacherId"
                label="Teacher"
                required
                options={teacherOpts}
                placeholder="Choose a teacher"
              />
              <SelectField
                name="sectionId"
                label="Section"
                required
                options={sections.map((s) => ({ value: s.id, label: s.label }))}
                placeholder="Choose a section"
              />
              <SelectField
                name="subjectId"
                label="Subject"
                required
                options={subjects.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
                placeholder="Choose a subject"
              />
            </FormDialog>
          ) : null
        }
      />
      <FilterBar basePath="/academics/assignments">
        <FilterSelect
          name="sessionId"
          label="Session"
          allLabel="Current"
          defaultValue={param(sp.sessionId)}
          options={sessions.map((s) => ({ value: s.id, label: s.name }))}
        />
        <FilterSelect name="teacherId" label="Teacher" defaultValue={param(sp.teacherId)} options={teacherOpts} />
      </FilterBar>
      {assignments.length === 0 ? (
        <EmptyState
          title="No assignments"
          description={
            sections.length === 0
              ? "Create sections for this session first."
              : "Assign teachers to sections and subjects."
          }
          action={
            sections.length === 0 ? (
              <Link className="text-primary text-sm font-medium hover:underline" href="/academics/classes">
                Go to classes & sections
              </Link>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Section</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Teacher</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{sectionLabel(a.section)}</TableCell>
                  <TableCell>{a.subject.name}</TableCell>
                  <TableCell>
                    <Link href={`/teachers/${a.teacher.id}`} className="text-primary hover:underline">
                      {fullName(a.teacher)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">
                    <ConfirmAction
                      action={deleteAssignmentAction.bind(null, a.id)}
                      title="Remove this assignment?"
                      description={`${fullName(a.teacher)} will no longer be able to enter ${a.subject.name} marks for ${sectionLabel(a.section)}. Existing records are kept.`}
                      confirmLabel="Remove"
                    >
                      Remove
                    </ConfirmAction>
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

import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import { CheckboxField, TextField } from "@/components/shared/action-form";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { FormDialog } from "@/components/shared/form-dialog";
import { EmptyState, PageHeader, StatusBadge } from "@/components/shared/page";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Role } from "@/generated/prisma/enums";
import { createSubjectAction, deleteSubjectAction, updateSubjectAction } from "@/features/academics/actions";
import { requireActor } from "@/server/auth/session";
import { listSubjects } from "@/server/services/academics.service";

export const metadata: Metadata = { title: "Subjects" };

function SubjectFields({
  defaults,
}: {
  defaults?: { code: string; name: string; description: string | null; isActive: boolean };
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
        <TextField name="code" label="Code" required maxLength={16} placeholder="MATH" defaultValue={defaults?.code} />
        <TextField
          name="name"
          label="Name"
          required
          maxLength={80}
          placeholder="Mathematics"
          defaultValue={defaults?.name}
        />
      </div>
      <TextField name="description" label="Description" maxLength={200} defaultValue={defaults?.description ?? ""} />
      <CheckboxField
        name="isActive"
        label="Active"
        description="Inactive subjects cannot be assigned or added to exams."
        defaultChecked={defaults?.isActive ?? true}
      />
    </>
  );
}

export default async function SubjectsPage() {
  await requireActor(Role.ADMIN);
  const subjects = await listSubjects();
  return (
    <>
      <PageHeader
        title="Subjects"
        back={{ href: "/academics", label: "Academics" }}
        actions={
          <FormDialog
            action={createSubjectAction}
            title="New subject"
            triggerLabel={
              <>
                <PlusIcon aria-hidden /> New subject
              </>
            }
            submitLabel="Create"
          >
            <SubjectFields />
          </FormDialog>
        }
      />
      {subjects.length === 0 ? (
        <EmptyState title="No subjects yet" />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Assignments</TableHead>
                <TableHead className="text-right">Exams</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subjects.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.code}</TableCell>
                  <TableCell className="font-medium">
                    {s.name}
                    {s.description ? (
                      <div className="text-muted-foreground text-xs font-normal">{s.description}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{s._count.assignments}</TableCell>
                  <TableCell className="text-right tabular-nums">{s._count.examSubjects}</TableCell>
                  <TableCell>
                    <StatusBadge status={s.isActive ? "ACTIVE" : "INACTIVE"} />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <FormDialog
                        action={updateSubjectAction.bind(null, s.id)}
                        title={`Edit ${s.name}`}
                        triggerLabel="Edit"
                        triggerVariant="outline"
                        triggerSize="sm"
                      >
                        <SubjectFields defaults={s} />
                      </FormDialog>
                      <ConfirmAction
                        action={deleteSubjectAction.bind(null, s.id)}
                        title={`Delete ${s.name}?`}
                        description="Subjects used by assignments or exams cannot be deleted; mark them inactive instead."
                        confirmLabel="Delete"
                      >
                        Delete
                      </ConfirmAction>
                    </div>
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

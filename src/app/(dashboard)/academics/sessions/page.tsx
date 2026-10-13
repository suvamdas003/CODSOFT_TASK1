import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import { CheckboxField, TextField } from "@/components/shared/action-form";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { FormDialog } from "@/components/shared/form-dialog";
import { EmptyState, PageHeader, StatusBadge } from "@/components/shared/page";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Role } from "@/generated/prisma/enums";
import {
  createSessionAction,
  deleteSessionAction,
  setCurrentSessionAction,
  updateSessionAction,
} from "@/features/academics/actions";
import { formatDate, toDateOnlyString } from "@/lib/utils/dates";
import { requireActor } from "@/server/auth/session";
import { listSessions } from "@/server/services/academics.service";

export const metadata: Metadata = { title: "Academic sessions" };

function SessionFields({
  defaults,
}: {
  defaults?: { name: string; startDate: string; endDate: string; isCurrent: boolean };
}) {
  return (
    <>
      <TextField
        name="name"
        label="Name"
        required
        maxLength={40}
        placeholder="e.g. 2026-2027"
        defaultValue={defaults?.name}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="startDate" label="Start date" type="date" required defaultValue={defaults?.startDate} />
        <TextField name="endDate" label="End date" type="date" required defaultValue={defaults?.endDate} />
      </div>
      <CheckboxField
        name="isCurrent"
        label="Current session"
        description="Dashboards, attendance and new records default to the current session."
        defaultChecked={defaults?.isCurrent}
      />
    </>
  );
}

export default async function SessionsPage() {
  await requireActor(Role.ADMIN);
  const sessions = await listSessions();
  return (
    <>
      <PageHeader
        title="Academic sessions"
        description="Sessions group sections, exams and fees. Exactly one session is current."
        back={{ href: "/academics", label: "Academics" }}
        actions={
          <FormDialog
            action={createSessionAction}
            title="New academic session"
            triggerLabel={
              <>
                <PlusIcon aria-hidden /> New session
              </>
            }
            submitLabel="Create"
          >
            <SessionFields />
          </FormDialog>
        }
      />
      {sessions.length === 0 ? (
        <EmptyState title="No sessions yet" description="Create your first academic session to get started." />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead className="text-right">Sections</TableHead>
                <TableHead className="text-right">Exams</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    {s.name} {s.isCurrent ? <StatusBadge status="ACTIVE" label="Current" /> : null}
                  </TableCell>
                  <TableCell>
                    {formatDate(s.startDate)} – {formatDate(s.endDate)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{s._count.sections}</TableCell>
                  <TableCell className="text-right tabular-nums">{s._count.exams}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <FormDialog
                        action={updateSessionAction.bind(null, s.id)}
                        title={`Edit ${s.name}`}
                        triggerLabel="Edit"
                        triggerVariant="outline"
                        triggerSize="sm"
                      >
                        <SessionFields
                          defaults={{
                            name: s.name,
                            startDate: toDateOnlyString(s.startDate),
                            endDate: toDateOnlyString(s.endDate),
                            isCurrent: s.isCurrent,
                          }}
                        />
                      </FormDialog>
                      {!s.isCurrent ? (
                        <>
                          <ConfirmAction
                            action={setCurrentSessionAction.bind(null, s.id)}
                            title={`Make ${s.name} the current session?`}
                            description="Dashboards, attendance and new records will default to this session."
                            confirmLabel="Make current"
                            destructive={false}
                          >
                            Make current
                          </ConfirmAction>
                          <ConfirmAction
                            action={deleteSessionAction.bind(null, s.id)}
                            title={`Delete ${s.name}?`}
                            description="Only sessions without sections, exams or fees can be deleted. This cannot be undone."
                            confirmLabel="Delete"
                          >
                            Delete
                          </ConfirmAction>
                        </>
                      ) : null}
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

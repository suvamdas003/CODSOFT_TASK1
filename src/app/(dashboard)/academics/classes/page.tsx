import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import { SelectField, TextField, type Option } from "@/components/shared/action-form";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { FilterBar, FilterSelect } from "@/components/shared/filter-bar";
import { FormDialog } from "@/components/shared/form-dialog";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Role } from "@/generated/prisma/enums";
import {
  createClassAction,
  createSectionAction,
  deleteClassAction,
  deleteSectionAction,
  updateClassAction,
  updateSectionAction,
} from "@/features/academics/actions";
import { fullName } from "@/lib/utils/format";
import { param } from "@/lib/utils/pagination";
import { requireActor } from "@/server/auth/session";
import { getCurrentSession, listClasses, listSections, listSessions } from "@/server/services/academics.service";
import { teacherOptions } from "@/server/services/teacher.service";

export const metadata: Metadata = { title: "Classes & sections" };

function ClassFields({ defaults }: { defaults?: { name: string; level: number; description: string | null } }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <TextField
          name="name"
          label="Class name"
          required
          maxLength={40}
          placeholder="e.g. Grade 6"
          defaultValue={defaults?.name}
        />
        <TextField
          name="level"
          label="Level"
          type="number"
          required
          min={0}
          max={50}
          description="Sort order"
          defaultValue={defaults?.level}
        />
      </div>
      <TextField name="description" label="Description" maxLength={200} defaultValue={defaults?.description ?? ""} />
    </>
  );
}

function SectionFields({
  classes,
  sessions,
  teachers,
  defaults,
}: {
  classes: Option[];
  sessions: Option[];
  teachers: Option[];
  defaults: {
    classId?: string;
    academicSessionId?: string;
    name?: string;
    classTeacherId?: string | null;
    capacity?: number | null;
    room?: string | null;
  };
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="classId"
          label="Class"
          required
          options={classes}
          placeholder="Choose a class"
          defaultValue={defaults.classId ?? ""}
        />
        <SelectField
          name="academicSessionId"
          label="Session"
          required
          options={sessions}
          defaultValue={defaults.academicSessionId}
        />
        <TextField
          name="name"
          label="Section name"
          required
          maxLength={20}
          placeholder="e.g. A"
          defaultValue={defaults.name}
        />
        <TextField
          name="capacity"
          label="Capacity"
          type="number"
          min={1}
          max={500}
          defaultValue={defaults.capacity ?? ""}
        />
        <SelectField
          name="classTeacherId"
          label="Class teacher"
          options={teachers}
          placeholder="None"
          defaultValue={defaults.classTeacherId ?? ""}
        />
        <TextField name="room" label="Room" maxLength={40} defaultValue={defaults.room ?? ""} />
      </div>
    </>
  );
}

export default async function ClassesPage({ searchParams }: PageProps<"/academics/classes">) {
  await requireActor(Role.ADMIN);
  const sp = await searchParams;
  const [classes, sessions, current, teachers] = await Promise.all([
    listClasses(),
    listSessions(),
    getCurrentSession(),
    teacherOptions(),
  ]);
  const sessionId = param(sp.sessionId) ?? current?.id;
  const sections = sessionId ? await listSections({ academicSessionId: sessionId }) : [];

  const classOptions = classes.map((c) => ({ value: c.id, label: c.name }));
  const sessionOptions = sessions.map((s) => ({ value: s.id, label: `${s.name}${s.isCurrent ? " (current)" : ""}` }));
  const teacherOpts = teachers.map((t) => ({ value: t.id, label: t.label }));

  return (
    <>
      <PageHeader title="Classes & sections" back={{ href: "/academics", label: "Academics" }} />
      <div className="grid gap-6 xl:grid-cols-[2fr_3fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Classes</CardTitle>
            <FormDialog
              action={createClassAction}
              title="New class"
              triggerLabel={
                <>
                  <PlusIcon aria-hidden /> Class
                </>
              }
              triggerSize="sm"
              submitLabel="Create"
            >
              <ClassFields />
            </FormDialog>
          </CardHeader>
          <CardContent>
            {classes.length === 0 ? (
              <EmptyState title="No classes yet" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Level</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Sections</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classes.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="tabular-nums">{c.level}</TableCell>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{c._count.sections}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <FormDialog
                            action={updateClassAction.bind(null, c.id)}
                            title={`Edit ${c.name}`}
                            triggerLabel="Edit"
                            triggerVariant="outline"
                            triggerSize="sm"
                          >
                            <ClassFields defaults={c} />
                          </FormDialog>
                          <ConfirmAction
                            action={deleteClassAction.bind(null, c.id)}
                            title={`Delete ${c.name}?`}
                            description="Only classes without sections, exams or fees can be deleted."
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
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>Sections</CardTitle>
            {classes.length > 0 && sessions.length > 0 ? (
              <FormDialog
                action={createSectionAction}
                title="New section"
                triggerLabel={
                  <>
                    <PlusIcon aria-hidden /> Section
                  </>
                }
                triggerSize="sm"
                submitLabel="Create"
              >
                <SectionFields
                  classes={classOptions}
                  sessions={sessionOptions}
                  teachers={teacherOpts}
                  defaults={{ academicSessionId: sessionId }}
                />
              </FormDialog>
            ) : null}
          </CardHeader>
          <CardContent>
            <FilterBar basePath="/academics/classes">
              <FilterSelect
                name="sessionId"
                label="Session"
                allLabel="Current"
                defaultValue={param(sp.sessionId)}
                options={sessionOptions}
              />
            </FilterBar>
            {sections.length === 0 ? (
              <EmptyState
                title="No sections in this session"
                description={classes.length === 0 ? "Create a class first." : undefined}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Section</TableHead>
                    <TableHead>Class teacher</TableHead>
                    <TableHead className="text-right">Students</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sections.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        {s.class.name} – {s.name}
                        {s.room ? <div className="text-muted-foreground text-xs">Room {s.room}</div> : null}
                      </TableCell>
                      <TableCell>{s.classTeacher ? fullName(s.classTeacher) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s._count.students}
                        {s.capacity ? ` / ${s.capacity}` : ""}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <FormDialog
                            action={updateSectionAction.bind(null, s.id)}
                            title={`Edit ${s.class.name} – ${s.name}`}
                            triggerLabel="Edit"
                            triggerVariant="outline"
                            triggerSize="sm"
                          >
                            <SectionFields
                              classes={classOptions}
                              sessions={sessionOptions}
                              teachers={teacherOpts}
                              defaults={{
                                classId: s.classId,
                                academicSessionId: s.academicSessionId,
                                name: s.name,
                                classTeacherId: s.classTeacherId,
                                capacity: s.capacity,
                                room: s.room,
                              }}
                            />
                          </FormDialog>
                          <ConfirmAction
                            action={deleteSectionAction.bind(null, s.id)}
                            title={`Delete ${s.class.name} – ${s.name}?`}
                            description="Only sections without students, attendance or assignments can be deleted."
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
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

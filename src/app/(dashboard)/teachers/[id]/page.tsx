import { PencilIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { DetailList, EmptyState, PageHeader, StatusBadge } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Role, TeacherStatus } from "@/generated/prisma/enums";
import { setTeacherStatusAction } from "@/features/teachers/actions";
import { formatDate, formatDateTime } from "@/lib/utils/dates";
import { fullName, sectionLabel } from "@/lib/utils/format";
import { requireActor } from "@/server/auth/session";
import { load } from "@/server/page";
import { getTeacher } from "@/server/services/teacher.service";

export const metadata: Metadata = { title: "Teacher profile" };

export default async function TeacherPage({ params }: PageProps<"/teachers/[id]">) {
  const actor = await requireActor(Role.ADMIN);
  const { id } = await params;
  const teacher = await load(getTeacher(actor, id));
  const active = teacher.status === TeacherStatus.ACTIVE;
  return (
    <>
      <PageHeader
        title={fullName(teacher)}
        description={`Employee ID ${teacher.employeeId}`}
        back={{ href: "/teachers", label: "Teachers" }}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/teachers/${id}/edit`}>
                <PencilIcon aria-hidden /> Edit
              </Link>
            </Button>
            <ConfirmAction
              action={setTeacherStatusAction.bind(null, id, active ? TeacherStatus.INACTIVE : TeacherStatus.ACTIVE)}
              title={active ? "Deactivate this teacher?" : "Reactivate this teacher?"}
              description={
                active
                  ? "The teacher will be signed out and can no longer sign in. Assignments and records they created are kept."
                  : "The teacher will be able to sign in again."
              }
              confirmLabel={active ? "Deactivate" : "Reactivate"}
              destructive={active}
              size="default"
            >
              {active ? "Deactivate" : "Reactivate"}
            </ConfirmAction>
          </>
        }
      />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              items={[
                { label: "Status", value: <StatusBadge status={teacher.status} /> },
                { label: "Login email", value: teacher.user.email },
                { label: "Phone", value: teacher.phone },
                { label: "Joining date", value: formatDate(teacher.joiningDate) },
                { label: "Qualification", value: teacher.qualification },
                { label: "Specialization", value: teacher.specialization },
                {
                  label: "Class teacher of",
                  value: teacher.classSections.map((s) => sectionLabel(s)).join(", ") || "—",
                },
                { label: "Last sign-in", value: formatDateTime(teacher.user.lastLoginAt) },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Teaching assignments</CardTitle>
            <Button asChild variant="outline" size="sm">
              <Link href="/academics/assignments">Manage assignments</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {teacher.assignments.length === 0 ? (
              <EmptyState title="No assignments yet" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Session</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teacher.assignments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        {a.subject.name} <span className="text-muted-foreground text-xs">({a.subject.code})</span>
                      </TableCell>
                      <TableCell>{sectionLabel(a.section)}</TableCell>
                      <TableCell>{a.section.academicSession.name}</TableCell>
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

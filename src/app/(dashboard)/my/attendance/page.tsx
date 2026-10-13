import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page";
import { Role } from "@/generated/prisma/enums";
import { AttendanceSummary } from "@/features/attendance/attendance-summary";
import { requireActor } from "@/server/auth/session";
import { getStudentAttendanceSummary } from "@/server/services/attendance.service";

export const metadata: Metadata = { title: "My attendance" };

export default async function MyAttendancePage() {
  const actor = await requireActor(Role.STUDENT);
  if (!actor.studentId) notFound();
  const summary = await getStudentAttendanceSummary(actor, actor.studentId);
  return (
    <>
      <PageHeader title="My attendance" description="Attendance for the current academic session." />
      <AttendanceSummary summary={summary} />
    </>
  );
}

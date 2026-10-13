import { PencilIcon, ReceiptIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { PageHeader } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Role, StudentStatus } from "@/generated/prisma/enums";
import { AttendanceSummary } from "@/features/attendance/attendance-summary";
import { ResultsList } from "@/features/examinations/results-list";
import { StudentFees } from "@/features/fees/student-fees";
import { setStudentStatusAction } from "@/features/students/actions";
import { StudentProfileCards } from "@/features/students/student-profile";
import { fullName } from "@/lib/utils/format";
import { requireActor } from "@/server/auth/session";
import { load } from "@/server/page";
import { getStudentAttendanceSummary } from "@/server/services/attendance.service";
import { getStudentResults } from "@/server/services/exam.service";
import { getStudentFees } from "@/server/services/fee.service";
import { getSettings } from "@/server/services/settings.service";
import { getStudent } from "@/server/services/student.service";

export const metadata: Metadata = { title: "Student profile" };

export default async function StudentPage({ params }: PageProps<"/students/[id]">) {
  const actor = await requireActor(Role.ADMIN, Role.TEACHER);
  const { id } = await params;
  const student = await load(getStudent(actor, id));
  const isAdmin = actor.role === Role.ADMIN;
  const [attendance, results, fees, settings] = await Promise.all([
    getStudentAttendanceSummary(actor, id),
    getStudentResults(actor, id),
    isAdmin ? getStudentFees(actor, id) : Promise.resolve(null),
    getSettings(),
  ]);

  return (
    <>
      <PageHeader
        title={fullName(student)}
        description={`Admission no. ${student.admissionNumber}`}
        back={{ href: "/students", label: "Students" }}
        actions={
          isAdmin ? (
            <>
              <Button asChild variant="outline">
                <Link href={`/fees/invoices/new?studentId=${student.id}`}>
                  <ReceiptIcon aria-hidden /> New invoice
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/students/${student.id}/edit`}>
                  <PencilIcon aria-hidden /> Edit
                </Link>
              </Button>
              {student.status === StudentStatus.ACTIVE ? (
                <ConfirmAction
                  action={setStudentStatusAction.bind(null, student.id, StudentStatus.INACTIVE)}
                  title="Deactivate this student?"
                  description="The student will no longer be able to sign in or be marked in attendance. All records are kept and the student can be reactivated later."
                  confirmLabel="Deactivate"
                  size="default"
                >
                  Deactivate
                </ConfirmAction>
              ) : (
                <ConfirmAction
                  action={setStudentStatusAction.bind(null, student.id, StudentStatus.ACTIVE)}
                  title="Reactivate this student?"
                  description="The student will be able to sign in again and appear in attendance and marks entry."
                  confirmLabel="Reactivate"
                  destructive={false}
                  size="default"
                >
                  Reactivate
                </ConfirmAction>
              )}
            </>
          ) : null
        }
      />
      <div className="space-y-8">
        <StudentProfileCards student={student} showAccount={isAdmin} />
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Attendance</h2>
          <AttendanceSummary summary={attendance} showRecent={false} />
        </section>
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Examination results</h2>
          <ResultsList results={results} studentId={student.id} showStatus />
        </section>
        {fees ? (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Fees</h2>
            <StudentFees fees={fees} currency={settings.currencyCode} locale={settings.locale} />
          </section>
        ) : null}
      </div>
    </>
  );
}

import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page";
import { Role } from "@/generated/prisma/enums";
import { updateStudentAction } from "@/features/students/actions";
import { StudentForm } from "@/features/students/student-form";
import { toDateOnlyString } from "@/lib/utils/dates";
import { fullName } from "@/lib/utils/format";
import { requireActor } from "@/server/auth/session";
import { load } from "@/server/page";
import { sectionOptions } from "@/server/services/academics.service";
import { getStudent } from "@/server/services/student.service";

export const metadata: Metadata = { title: "Edit student" };

export default async function EditStudentPage({ params }: PageProps<"/students/[id]/edit">) {
  const actor = await requireActor(Role.ADMIN);
  const { id } = await params;
  const [student, sections] = await Promise.all([
    load(getStudent(actor, id)),
    sectionOptions(actor, { allSessions: true }),
  ]);
  return (
    <>
      <PageHeader title={`Edit ${fullName(student)}`} back={{ href: `/students/${id}`, label: "Student profile" }} />
      <StudentForm
        mode="edit"
        action={updateStudentAction.bind(null, id)}
        sections={sections.map((s) => ({ value: s.id, label: s.label }))}
        cancelHref={`/students/${id}`}
        defaults={{
          admissionNumber: student.admissionNumber,
          firstName: student.firstName,
          lastName: student.lastName,
          email: student.user.email,
          dateOfBirth: student.dateOfBirth ? toDateOnlyString(student.dateOfBirth) : "",
          gender: student.gender,
          phone: student.phone ?? "",
          address: student.address ?? "",
          guardianName: student.guardianName,
          guardianRelation: student.guardianRelation,
          guardianPhone: student.guardianPhone,
          guardianEmail: student.guardianEmail ?? "",
          sectionId: student.sectionId ?? "",
          enrollmentDate: toDateOnlyString(student.enrollmentDate),
          status: student.status,
        }}
      />
    </>
  );
}

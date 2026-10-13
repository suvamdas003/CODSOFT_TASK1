import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page";
import { Role } from "@/generated/prisma/enums";
import { updateTeacherAction } from "@/features/teachers/actions";
import { TeacherForm } from "@/features/teachers/teacher-form";
import { toDateOnlyString } from "@/lib/utils/dates";
import { fullName } from "@/lib/utils/format";
import { requireActor } from "@/server/auth/session";
import { load } from "@/server/page";
import { getTeacher } from "@/server/services/teacher.service";

export const metadata: Metadata = { title: "Edit teacher" };

export default async function EditTeacherPage({ params }: PageProps<"/teachers/[id]/edit">) {
  const actor = await requireActor(Role.ADMIN);
  const { id } = await params;
  const teacher = await load(getTeacher(actor, id));
  return (
    <>
      <PageHeader title={`Edit ${fullName(teacher)}`} back={{ href: `/teachers/${id}`, label: "Teacher profile" }} />
      <TeacherForm
        mode="edit"
        action={updateTeacherAction.bind(null, id)}
        cancelHref={`/teachers/${id}`}
        defaults={{
          employeeId: teacher.employeeId,
          firstName: teacher.firstName,
          lastName: teacher.lastName,
          email: teacher.user.email,
          phone: teacher.phone ?? "",
          qualification: teacher.qualification ?? "",
          specialization: teacher.specialization ?? "",
          joiningDate: toDateOnlyString(teacher.joiningDate),
          status: teacher.status,
        }}
      />
    </>
  );
}

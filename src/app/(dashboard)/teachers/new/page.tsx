import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page";
import { Role } from "@/generated/prisma/enums";
import { createTeacherAction } from "@/features/teachers/actions";
import { TeacherForm } from "@/features/teachers/teacher-form";
import { todayDateOnlyString } from "@/lib/utils/dates";
import { requireActor } from "@/server/auth/session";

export const metadata: Metadata = { title: "Add teacher" };

export default async function NewTeacherPage() {
  await requireActor(Role.ADMIN);
  return (
    <>
      <PageHeader
        title="Add teacher"
        description="Creates the teacher profile and sign-in account."
        back={{ href: "/teachers", label: "Teachers" }}
      />
      <TeacherForm
        mode="create"
        action={createTeacherAction}
        defaults={{ joiningDate: todayDateOnlyString() }}
        cancelHref="/teachers"
      />
    </>
  );
}

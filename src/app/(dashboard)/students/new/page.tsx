import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page";
import { Role } from "@/generated/prisma/enums";
import { createStudentAction } from "@/features/students/actions";
import { StudentForm } from "@/features/students/student-form";
import { todayDateOnlyString } from "@/lib/utils/dates";
import { requireActor } from "@/server/auth/session";
import { sectionOptions } from "@/server/services/academics.service";

export const metadata: Metadata = { title: "Add student" };

export default async function NewStudentPage() {
  const actor = await requireActor(Role.ADMIN);
  const sections = await sectionOptions(actor);
  return (
    <>
      <PageHeader
        title="Add student"
        description="Creates the student record and their sign-in account."
        back={{ href: "/students", label: "Students" }}
      />
      <StudentForm
        mode="create"
        action={createStudentAction}
        sections={sections.map((s) => ({ value: s.id, label: s.label }))}
        defaults={{ enrollmentDate: todayDateOnlyString() }}
        cancelHref="/students"
      />
    </>
  );
}

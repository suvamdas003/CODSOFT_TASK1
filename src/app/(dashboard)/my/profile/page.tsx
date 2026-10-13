import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page";
import { Role } from "@/generated/prisma/enums";
import { StudentProfileCards } from "@/features/students/student-profile";
import { fullName } from "@/lib/utils/format";
import { requireActor } from "@/server/auth/session";
import { load } from "@/server/page";
import { getStudent } from "@/server/services/student.service";

export const metadata: Metadata = { title: "My profile" };

export default async function MyProfilePage() {
  const actor = await requireActor(Role.STUDENT);
  if (!actor.studentId) notFound();
  const student = await load(getStudent(actor, actor.studentId));
  return (
    <>
      <PageHeader
        title={fullName(student)}
        description="Your school record. Contact the school office to correct any details."
      />
      <StudentProfileCards student={student} showAccount={false} />
    </>
  );
}

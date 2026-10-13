import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page";
import { Role } from "@/generated/prisma/enums";
import { ResultsList } from "@/features/examinations/results-list";
import { requireActor } from "@/server/auth/session";
import { getStudentResults } from "@/server/services/exam.service";

export const metadata: Metadata = { title: "My results" };

export default async function MyResultsPage() {
  const actor = await requireActor(Role.STUDENT);
  if (!actor.studentId) notFound();
  const results = await getStudentResults(actor, actor.studentId);
  return (
    <>
      <PageHeader title="My results" description="Published examination results and printable report cards." />
      <ResultsList results={results} studentId={actor.studentId} showStatus={false} />
    </>
  );
}

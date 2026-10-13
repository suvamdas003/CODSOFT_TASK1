import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page";
import { Role } from "@/generated/prisma/enums";
import { StudentFees } from "@/features/fees/student-fees";
import { requireActor } from "@/server/auth/session";
import { getStudentFees } from "@/server/services/fee.service";
import { getSettings } from "@/server/services/settings.service";

export const metadata: Metadata = { title: "My fees" };

export default async function MyFeesPage() {
  const actor = await requireActor(Role.STUDENT);
  if (!actor.studentId) notFound();
  const [fees, settings] = await Promise.all([getStudentFees(actor, actor.studentId), getSettings()]);
  return (
    <>
      <PageHeader
        title="My fees"
        description="Invoices, balances and payment receipts. Payments are made at the school office."
      />
      <StudentFees fees={fees} currency={settings.currencyCode} locale={settings.locale} />
    </>
  );
}

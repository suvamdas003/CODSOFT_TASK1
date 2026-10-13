import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Role } from "@/generated/prisma/enums";
import { InvoiceForm } from "@/features/fees/invoice-form";
import { addDays, toDateOnlyString, todayDateOnly } from "@/lib/utils/dates";
import { fullName } from "@/lib/utils/format";
import { param } from "@/lib/utils/pagination";
import { requireActor } from "@/server/auth/session";
import { load } from "@/server/page";
import { feeOptionsForStudent } from "@/server/services/fee.service";
import { getSettings } from "@/server/services/settings.service";
import { getStudent, studentOptions } from "@/server/services/student.service";

export const metadata: Metadata = { title: "New invoice" };

export default async function NewInvoicePage({ searchParams }: PageProps<"/fees/invoices/new">) {
  const actor = await requireActor(Role.ADMIN);
  const studentId = param((await searchParams).studentId);
  const settings = await getSettings();

  if (!studentId) {
    const students = await studentOptions(actor);
    return (
      <>
        <PageHeader title="New invoice" back={{ href: "/fees/invoices", label: "Invoices" }} />
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Choose a student</CardTitle>
            <CardDescription>Only active students are listed.</CardDescription>
          </CardHeader>
          <CardContent>
            <form method="get" className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="studentId">Student</Label>
                <NativeSelect id="studentId" name="studentId" required defaultValue="">
                  <option value="" disabled>
                    Choose a student
                  </option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <Button type="submit">Continue</Button>
            </form>
          </CardContent>
        </Card>
      </>
    );
  }

  const [student, fees] = await Promise.all([
    load(getStudent(actor, studentId)),
    load(feeOptionsForStudent(actor, studentId)),
  ]);
  const today = todayDateOnly();
  return (
    <>
      <PageHeader
        title="New invoice"
        description={`${fullName(student)} · ${student.admissionNumber}`}
        back={{ href: `/students/${student.id}`, label: "Student profile" }}
      />
      <Card>
        <CardContent className="pt-5">
          <InvoiceForm
            studentId={student.id}
            fees={fees}
            currency={settings.currencyCode}
            locale={settings.locale}
            defaultIssueDate={toDateOnlyString(today)}
            defaultDueDate={toDateOnlyString(addDays(today, 30))}
          />
        </CardContent>
      </Card>
    </>
  );
}

import type { Metadata } from "next";
import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/shared/action-form";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Role } from "@/generated/prisma/enums";
import { generateInvoicesAction } from "@/features/fees/actions";
import { addDays, toDateOnlyString, todayDateOnly } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";
import { requireActor } from "@/server/auth/session";
import { getCurrentSession, sectionOptions } from "@/server/services/academics.service";
import { listFeeStructures } from "@/server/services/fee.service";
import { getSettings } from "@/server/services/settings.service";

export const metadata: Metadata = { title: "Generate invoices" };

export default async function GenerateInvoicesPage() {
  const actor = await requireActor(Role.ADMIN);
  const current = await getCurrentSession();
  const [fees, sections, settings] = await Promise.all([
    current ? listFeeStructures(actor, { academicSessionId: current.id }) : Promise.resolve([]),
    sectionOptions(actor),
    getSettings(),
  ]);
  const active = fees.filter((f) => f.isActive);
  const today = todayDateOnly();

  return (
    <>
      <PageHeader
        title="Generate invoices"
        description="Bill one fee to every active student in a section, a class or the whole school."
        back={{ href: "/fees/invoices", label: "Invoices" }}
      />
      {active.length === 0 ? (
        <EmptyState title="No active fees in the current session" description="Create a fee structure first." />
      ) : (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Bulk billing</CardTitle>
            <CardDescription>
              Students who already have this fee for the same billing period (on a non-cancelled invoice) are skipped,
              so running this twice never double-bills.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={generateInvoicesAction}>
              <SelectField
                name="feeStructureId"
                label="Fee"
                required
                placeholder="Choose a fee"
                options={active.map((f) => ({
                  value: f.id,
                  label: `${f.name} – ${f.class?.name ?? "All classes"} – ${formatMoney(f.amountMinor, settings.currencyCode, settings.locale)}`,
                }))}
              />
              <SelectField
                name="sectionId"
                label="Section"
                placeholder="All applicable sections"
                options={sections.map((s) => ({ value: s.id, label: s.label }))}
                description="Leave empty to bill every section the fee applies to."
              />
              <TextField
                name="periodLabel"
                label="Billing period"
                required
                maxLength={40}
                placeholder="e.g. Term 1 2026"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  name="issueDate"
                  label="Issue date"
                  type="date"
                  required
                  defaultValue={toDateOnlyString(today)}
                />
                <TextField
                  name="dueDate"
                  label="Due date"
                  type="date"
                  required
                  defaultValue={toDateOnlyString(addDays(today, 30))}
                />
              </div>
              <div className="flex justify-end">
                <SubmitButton>Generate invoices</SubmitButton>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      )}
    </>
  );
}

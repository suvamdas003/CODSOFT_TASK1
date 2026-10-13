import type { Metadata } from "next";
import { ActionForm, CheckboxField, SubmitButton, TextareaField, TextField } from "@/components/shared/action-form";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState, PageHeader, StatusBadge } from "@/components/shared/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Role } from "@/generated/prisma/enums";
import { deleteGradeScaleAction, updateSettingsAction } from "@/features/settings/actions";
import { GradeScaleEditor } from "@/features/settings/grade-scale-editor";
import { requireActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getSettings, listGradeScales } from "@/server/services/settings.service";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireActor(Role.ADMIN);
  const [settings, scales, invoiceCount, feeCount] = await Promise.all([
    getSettings(),
    listGradeScales(),
    prisma.invoice.count(),
    prisma.feeStructure.count(),
  ]);
  const currencyLock =
    invoiceCount > 0 ? "Locked because invoices exist." : feeCount > 0 ? "Locked because fee structures exist." : null;

  return (
    <>
      <PageHeader title="Settings" description="Institution details and configurable academic and fee policies." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Institution & policies</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={updateSettingsAction}>
              <TextField name="name" label="Institution name" required maxLength={120} defaultValue={settings.name} />
              <TextareaField
                name="address"
                label="Address"
                rows={2}
                maxLength={300}
                defaultValue={settings.address ?? ""}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField name="phone" label="Phone" type="tel" maxLength={20} defaultValue={settings.phone ?? ""} />
                <TextField
                  name="email"
                  label="Email"
                  type="email"
                  maxLength={254}
                  defaultValue={settings.email ?? ""}
                />
                <TextField
                  name="currencyCode"
                  label="Currency (ISO code)"
                  required
                  maxLength={3}
                  defaultValue={settings.currencyCode}
                  readOnly={currencyLock !== null}
                  description={currencyLock ?? "e.g. USD, INR, EUR"}
                />
                <TextField
                  name="locale"
                  label="Locale"
                  required
                  maxLength={20}
                  defaultValue={settings.locale}
                  description="Number and date formatting, e.g. en-US, en-IN"
                />
                <TextField
                  name="invoicePrefix"
                  label="Invoice number prefix"
                  required
                  maxLength={8}
                  defaultValue={settings.invoicePrefix}
                />
                <TextField
                  name="receiptPrefix"
                  label="Receipt number prefix"
                  required
                  maxLength={8}
                  defaultValue={settings.receiptPrefix}
                />
              </div>
              <fieldset className="space-y-3 rounded-lg border p-4">
                <legend className="px-1 text-sm font-medium">Attendance policy</legend>
                <CheckboxField
                  name="lateCountsAsPresent"
                  label="Late counts as attended"
                  defaultChecked={settings.lateCountsAsPresent}
                />
                <CheckboxField
                  name="excusedExcludedFromTotal"
                  label="Exclude excused days from the total"
                  description="When off, excused days count as absences."
                  defaultChecked={settings.excusedExcludedFromTotal}
                />
                <TextField
                  name="lowAttendanceThreshold"
                  label="Low attendance threshold (%)"
                  type="number"
                  required
                  min={0}
                  max={100}
                  defaultValue={settings.lowAttendanceThreshold}
                  className="max-w-48"
                />
              </fieldset>
              <div className="flex justify-end">
                <SubmitButton>Save settings</SubmitButton>
              </div>
            </ActionForm>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Grade scales</CardTitle>
              <CardDescription>
                Each exam uses one scale. Scales used by published exams are locked to keep historical grades.
              </CardDescription>
            </div>
            <GradeScaleEditor
              triggerLabel="New scale"
              scale={{
                id: null,
                name: "",
                description: "",
                isDefault: scales.length === 0,
                bands: [
                  { label: "A", minPercent: "80", gradePoint: "4", remark: "Excellent", isPassing: true },
                  { label: "B", minPercent: "60", gradePoint: "3", remark: "Good", isPassing: true },
                  { label: "C", minPercent: "40", gradePoint: "2", remark: "Satisfactory", isPassing: true },
                  { label: "F", minPercent: "0", gradePoint: "0", remark: "Fail", isPassing: false },
                ],
              }}
            />
          </CardHeader>
          <CardContent className="space-y-4">
            {scales.length === 0 ? (
              <EmptyState title="No grade scales" description="Create one before adding exams." />
            ) : (
              scales.map((scale) => (
                <div key={scale.id} className="rounded-lg border p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">
                      {scale.name} {scale.isDefault ? <StatusBadge status="ACTIVE" label="Default" /> : null}
                      <span className="text-muted-foreground ml-1 text-xs font-normal">
                        used by {scale.examCount} exam(s)
                      </span>
                    </p>
                    <div className="flex gap-2">
                      <GradeScaleEditor
                        triggerLabel="Edit"
                        scale={{
                          id: scale.id,
                          name: scale.name,
                          description: scale.description ?? "",
                          isDefault: scale.isDefault,
                          bands: scale.bands.map((b) => ({
                            label: b.label,
                            minPercent: String(b.minPercent),
                            gradePoint: b.gradePoint === null || b.gradePoint === undefined ? "" : String(b.gradePoint),
                            remark: b.remark ?? "",
                            isPassing: b.isPassing,
                          })),
                        }}
                      />
                      {!scale.isDefault && scale.examCount === 0 ? (
                        <ConfirmAction
                          action={deleteGradeScaleAction.bind(null, scale.id)}
                          title={`Delete ${scale.name}?`}
                          description="This cannot be undone."
                          confirmLabel="Delete"
                        >
                          Delete
                        </ConfirmAction>
                      ) : null}
                    </div>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {scale.bands.map((b) => `${b.label} ≥ ${b.minPercent}%${b.isPassing ? "" : " (fail)"}`).join(" · ")}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

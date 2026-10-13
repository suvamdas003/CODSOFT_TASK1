import { FilePlus2Icon, ListIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CheckboxField, SelectField, TextField, TextareaField, type Option } from "@/components/shared/action-form";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { FilterBar, FilterSelect } from "@/components/shared/filter-bar";
import { FormDialog } from "@/components/shared/form-dialog";
import { EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Role } from "@/generated/prisma/enums";
import { createFeeStructureAction, deleteFeeStructureAction, updateFeeStructureAction } from "@/features/fees/actions";
import { feeFrequencyOptions } from "@/lib/options";
import { humanize } from "@/lib/utils/format";
import { formatMoney, minorToMajorString } from "@/lib/utils/money";
import { param } from "@/lib/utils/pagination";
import { requireActor } from "@/server/auth/session";
import { getCurrentSession, listClasses, listSessions } from "@/server/services/academics.service";
import { getFeeOverview, listFeeStructures } from "@/server/services/fee.service";
import { getSettings } from "@/server/services/settings.service";

export const metadata: Metadata = { title: "Fees & payments" };

function FeeFields({
  sessions,
  classes,
  currency,
  defaults = {},
}: {
  sessions: Option[];
  classes: Option[];
  currency: string;
  defaults?: Partial<{
    name: string;
    academicSessionId: string;
    classId: string;
    amount: string;
    frequency: string;
    description: string;
    isActive: boolean;
  }>;
}) {
  return (
    <>
      <TextField
        name="name"
        label="Fee name"
        required
        maxLength={80}
        placeholder="e.g. Tuition – Term 1"
        defaultValue={defaults.name}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="academicSessionId"
          label="Session"
          required
          options={sessions}
          defaultValue={defaults.academicSessionId}
        />
        <SelectField
          name="classId"
          label="Class"
          options={classes}
          placeholder="All classes"
          defaultValue={defaults.classId ?? ""}
        />
        <TextField
          name="amount"
          label={`Amount (${currency})`}
          required
          inputMode="decimal"
          placeholder="0.00"
          defaultValue={defaults.amount}
        />
        <SelectField
          name="frequency"
          label="Frequency"
          required
          options={feeFrequencyOptions}
          defaultValue={defaults.frequency ?? "TERM"}
        />
      </div>
      <TextareaField
        name="description"
        label="Description"
        maxLength={200}
        rows={2}
        defaultValue={defaults.description}
      />
      <CheckboxField
        name="isActive"
        label="Active"
        description="Only active fees can be invoiced."
        defaultChecked={defaults.isActive ?? true}
      />
    </>
  );
}

export default async function FeesPage({ searchParams }: PageProps<"/fees">) {
  const actor = await requireActor(Role.ADMIN);
  const sp = await searchParams;
  const [sessions, classes, current, settings, overview] = await Promise.all([
    listSessions(),
    listClasses(),
    getCurrentSession(),
    getSettings(),
    getFeeOverview(actor),
  ]);
  const sessionId = param(sp.sessionId) ?? current?.id;
  const structures = await listFeeStructures(actor, { academicSessionId: sessionId });
  const money = (minor: number) => formatMoney(minor, settings.currencyCode, settings.locale);
  const sessionOptions = sessions.map((s) => ({ value: s.id, label: s.name }));
  const classOptions = classes.map((c) => ({ value: c.id, label: c.name }));

  return (
    <>
      <PageHeader
        title="Fees & payments"
        description="Configure fee structures, issue invoices and record payments received."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/fees/invoices">
                <ListIcon aria-hidden /> Invoices
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/fees/invoices/generate">
                <FilePlus2Icon aria-hidden /> Generate invoices
              </Link>
            </Button>
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total billed"
          value={money(overview.billedMinor)}
          hint={`${overview.invoiceCount} invoice(s)`}
        />
        <StatCard
          label="Collected"
          value={money(overview.collectedMinor)}
          hint={`${money(overview.collectedLast30Minor)} in the last 30 days`}
          tone="success"
        />
        <StatCard
          label="Outstanding"
          value={money(overview.outstandingMinor)}
          tone={overview.outstandingMinor > 0 ? "warning" : "default"}
          href="/fees/invoices?status=UNPAID"
        />
        <StatCard
          label="Overdue"
          value={money(overview.overdueMinor)}
          hint={`${overview.overdueCount} invoice(s)`}
          tone={overview.overdueCount > 0 ? "danger" : "default"}
          href="/fees/invoices?overdue=on"
        />
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Fee structures</CardTitle>
          {sessions.length > 0 ? (
            <FormDialog
              action={createFeeStructureAction}
              title="New fee"
              triggerLabel={
                <>
                  <PlusIcon aria-hidden /> New fee
                </>
              }
              triggerSize="sm"
              submitLabel="Create"
            >
              <FeeFields
                sessions={sessionOptions}
                classes={classOptions}
                currency={settings.currencyCode}
                defaults={{ academicSessionId: sessionId }}
              />
            </FormDialog>
          ) : null}
        </CardHeader>
        <CardContent>
          <FilterBar basePath="/fees">
            <FilterSelect
              name="sessionId"
              label="Session"
              allLabel="Current"
              defaultValue={param(sp.sessionId)}
              options={sessionOptions}
            />
          </FilterBar>
          {structures.length === 0 ? (
            <EmptyState title="No fees configured for this session" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fee</TableHead>
                  <TableHead>Applies to</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {structures.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">
                      {f.name}
                      <div className="text-muted-foreground text-xs font-normal">
                        {f._count.invoiceItems} invoice line(s)
                      </div>
                    </TableCell>
                    <TableCell>{f.class?.name ?? "All classes"}</TableCell>
                    <TableCell>{humanize(f.frequency)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(f.amountMinor)}</TableCell>
                    <TableCell>
                      <StatusBadge status={f.isActive ? "ACTIVE" : "INACTIVE"} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <FormDialog
                          action={updateFeeStructureAction.bind(null, f.id)}
                          title={`Edit ${f.name}`}
                          triggerLabel="Edit"
                          triggerVariant="outline"
                          triggerSize="sm"
                        >
                          <FeeFields
                            sessions={sessionOptions}
                            classes={classOptions}
                            currency={settings.currencyCode}
                            defaults={{
                              name: f.name,
                              academicSessionId: f.academicSessionId,
                              classId: f.classId ?? "",
                              amount: minorToMajorString(f.amountMinor, settings.currencyCode),
                              frequency: f.frequency,
                              description: f.description ?? "",
                              isActive: f.isActive,
                            }}
                          />
                        </FormDialog>
                        <ConfirmAction
                          action={deleteFeeStructureAction.bind(null, f.id)}
                          title={`Delete ${f.name}?`}
                          description="Fees that already appear on invoices cannot be deleted; mark them inactive instead."
                          confirmLabel="Delete"
                        >
                          Delete
                        </ConfirmAction>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

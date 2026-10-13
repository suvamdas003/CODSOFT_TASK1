"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFieldArray, useForm, useWatch, type Path } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, minorToMajorString, parseMoneyToMinor } from "@/lib/utils/money";
import { createInvoiceSchema } from "@/lib/validation/fees";
import { createInvoiceAction } from "./actions";

type InvoiceFormValues = z.input<typeof createInvoiceSchema>;
type FeeOption = { id: string; name: string; amountMinor: number };

/**
 * Invoice editor with dynamic line items (React Hook Form + the same Zod schema the
 * server uses). Values are sent raw; the server action validates them again.
 */
export function InvoiceForm({
  studentId,
  fees,
  currency,
  locale,
  defaultIssueDate,
  defaultDueDate,
}: {
  studentId: string;
  fees: FeeOption[];
  currency: string;
  locale: string;
  defaultIssueDate: string;
  defaultDueDate: string;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(createInvoiceSchema, undefined, { raw: true }),
    defaultValues: {
      studentId,
      issueDate: defaultIssueDate,
      dueDate: defaultDueDate,
      notes: "",
      items: [{ feeStructureId: "", description: "", periodLabel: "", amount: "" }],
    },
  });
  const { register, control, handleSubmit, setValue, setError, formState } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const items = useWatch({ control, name: "items" }) ?? [];
  const totalMinor = items.reduce((sum, item) => sum + (parseMoneyToMinor(item.amount ?? "", currency) ?? 0), 0);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const result = await createInvoiceAction(values);
    if (!result.ok) {
      setServerError(result.error);
      for (const [key, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (messages?.[0] && key !== "_form") setError(key as Path<InvoiceFormValues>, { message: messages[0] });
      }
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? "Invoice issued.");
    if (result.redirectTo) router.push(result.redirectTo);
    else router.refresh();
  });

  const err = (path: string) => {
    const parts = path.split(".");
    let node: unknown = formState.errors;
    for (const part of parts) node = (node as Record<string, unknown> | undefined)?.[part];
    return (node as { message?: string } | undefined)?.message;
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {serverError ? <Alert variant="destructive">{serverError}</Alert> : null}
      <input type="hidden" {...register("studentId")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="issueDate">Issue date</Label>
          <Input id="issueDate" type="date" aria-invalid={Boolean(err("issueDate"))} {...register("issueDate")} />
          {err("issueDate") ? <p className="text-destructive text-xs">{err("issueDate")}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dueDate">Due date</Label>
          <Input id="dueDate" type="date" aria-invalid={Boolean(err("dueDate"))} {...register("dueDate")} />
          {err("dueDate") ? <p className="text-destructive text-xs">{err("dueDate")}</p> : null}
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Line items</legend>
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1.2fr_1.5fr_1fr_1fr_auto] sm:items-end"
          >
            <div className="space-y-1.5">
              <Label htmlFor={`fee-${index}`}>Fee</Label>
              <NativeSelect
                id={`fee-${index}`}
                {...register(`items.${index}.feeStructureId`, {
                  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => {
                    const fee = fees.find((f) => f.id === event.target.value);
                    if (fee) {
                      setValue(`items.${index}.description`, fee.name, { shouldValidate: true });
                      setValue(`items.${index}.amount`, minorToMajorString(fee.amountMinor, currency), {
                        shouldValidate: true,
                      });
                    }
                  },
                })}
              >
                <option value="">Custom charge</option>
                {fees.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`desc-${index}`}>Description</Label>
              <Input
                id={`desc-${index}`}
                maxLength={120}
                aria-invalid={Boolean(err(`items.${index}.description`))}
                {...register(`items.${index}.description`)}
              />
              {err(`items.${index}.description`) ? (
                <p className="text-destructive text-xs">{err(`items.${index}.description`)}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`period-${index}`}>Billing period</Label>
              <Input
                id={`period-${index}`}
                maxLength={40}
                placeholder="e.g. Term 1"
                {...register(`items.${index}.periodLabel`)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`amount-${index}`}>Amount ({currency})</Label>
              <Input
                id={`amount-${index}`}
                inputMode="decimal"
                placeholder="0.00"
                aria-invalid={Boolean(err(`items.${index}.amount`))}
                {...register(`items.${index}.amount`)}
              />
              {err(`items.${index}.amount`) ? (
                <p className="text-destructive text-xs">{err(`items.${index}.amount`)}</p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => remove(index)}
              disabled={fields.length === 1}
              aria-label={`Remove line ${index + 1}`}
            >
              <Trash2Icon />
            </Button>
          </div>
        ))}
        {err("items") ? <p className="text-destructive text-xs">{err("items")}</p> : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({ feeStructureId: "", description: "", periodLabel: "", amount: "" })}
          disabled={fields.length >= 20}
        >
          <PlusIcon aria-hidden /> Add line
        </Button>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" rows={2} maxLength={300} {...register("notes")} />
      </div>

      <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-lg font-semibold tabular-nums">Total: {formatMoney(totalMinor, currency, locale)}</p>
        <Button type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
          Issue invoice
        </Button>
      </div>
    </form>
  );
}

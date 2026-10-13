"use client";

import { useState } from "react";
import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/shared/action-form";
import { Alert } from "@/components/ui/alert";
import { paymentMethodOptions } from "@/lib/options";
import { recordPaymentAction } from "./actions";

/** RFC 4122 v4 UUID; crypto.randomUUID is unavailable on plain-HTTP LAN origins. */
function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Records a payment that was received outside the system (cash, bank transfer, ...).
 * A per-form idempotency key makes double-clicks and resubmissions harmless.
 */
export function PaymentForm({
  invoiceId,
  defaultAmount,
  currency,
  today,
}: {
  invoiceId: string;
  defaultAmount: string;
  currency: string;
  today: string;
}) {
  const [idempotencyKey] = useState(newIdempotencyKey);
  return (
    <ActionForm action={recordPaymentAction}>
      <Alert variant="info">
        Manual record only: EduManage does not process card or online payments. Record money that has already been
        received.
      </Alert>
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="amount"
          label={`Amount (${currency})`}
          required
          inputMode="decimal"
          defaultValue={defaultAmount}
        />
        <TextField name="paidAt" label="Date received" type="date" required max={today} defaultValue={today} />
        <SelectField name="method" label="Method" required options={paymentMethodOptions} defaultValue="CASH" />
        <TextField name="reference" label="Reference" maxLength={80} placeholder="Cheque / transfer no." />
      </div>
      <TextField name="notes" label="Notes" maxLength={300} />
      <div className="flex justify-end">
        <SubmitButton>Record payment</SubmitButton>
      </div>
    </ActionForm>
  );
}

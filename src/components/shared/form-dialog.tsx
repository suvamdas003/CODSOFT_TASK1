"use client";

import { useState, type ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ActionResult, FormValues } from "@/lib/action-result";
import { ActionForm, SubmitButton } from "./action-form";

type FormDialogProps = {
  action: (values: FormValues) => Promise<ActionResult<unknown>>;
  title: string;
  description?: string;
  triggerLabel: ReactNode;
  triggerVariant?: ButtonProps["variant"];
  triggerSize?: ButtonProps["size"];
  submitLabel?: string;
  successMessage?: string;
  children: ReactNode;
  className?: string;
};

/** A button that opens a dialog containing a server-action form; closes on success. */
export function FormDialog({
  action,
  title,
  description,
  triggerLabel,
  triggerVariant = "default",
  triggerSize = "default",
  submitLabel = "Save",
  successMessage,
  children,
  className,
}: FormDialogProps) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className={className}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <ActionForm action={action} successMessage={successMessage} onSuccess={() => setOpen(false)}>
          {children}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton>{submitLabel}</SubmitButton>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

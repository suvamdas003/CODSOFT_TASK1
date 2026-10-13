"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, use, useId, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Checkbox, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult, FormValues } from "@/lib/action-result";
import type { FieldErrors } from "@/lib/errors";
import { cn } from "@/lib/utils/cn";

type FormState = { errors: FieldErrors; pending: boolean };
const FormStateContext = createContext<FormState>({ errors: {}, pending: false });

export const useFormState = () => use(FormStateContext);

/** Convert FormData to a plain object; repeated names become arrays. Files are ignored. */
export function formDataToValues(formData: FormData): FormValues {
  const values: FormValues = {};
  for (const [key, raw] of formData.entries()) {
    if (typeof raw !== "string") continue;
    const current = values[key];
    if (current === undefined) values[key] = raw;
    else values[key] = Array.isArray(current) ? [...current, raw] : [current, raw];
  }
  return values;
}

type ActionFormProps = {
  action: (values: FormValues) => Promise<ActionResult<unknown>>;
  children: ReactNode;
  className?: string;
  /** Toast shown on success when the action returns no message. */
  successMessage?: string;
  /** Navigate here after success (the action's redirectTo takes precedence). */
  redirectTo?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (result: ActionResult<unknown>) => void;
};

/**
 * Progressive form wrapper for server actions: submits field values, shows a pending
 * state, renders field-level validation errors returned by the server, and toasts the
 * outcome. All authorization and validation happen in the server action.
 */
export function ActionForm({
  action,
  children,
  className,
  successMessage,
  redirectTo,
  resetOnSuccess,
  onSuccess,
}: ActionFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = formDataToValues(new FormData(form));
    startTransition(async () => {
      let result: ActionResult<unknown>;
      try {
        result = await action(values);
      } catch {
        result = { ok: false, error: "Could not reach the server. Check your connection and try again." };
      }
      if (result.ok) {
        setErrors({});
        setFormError(null);
        toast.success(result.message ?? successMessage ?? "Saved.");
        if (resetOnSuccess) form.reset();
        onSuccess?.(result);
        const target = result.redirectTo ?? redirectTo;
        // Navigating already loads fresh data (the action revalidated it); refreshing as
        // well would re-render the destination and could wipe input typed there.
        if (target) router.push(target);
        else router.refresh();
      } else {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
        toast.error(result.error);
      }
    });
  }

  return (
    <FormStateContext value={{ errors, pending }}>
      <form onSubmit={handleSubmit} className={cn("space-y-4", className)} aria-busy={pending || undefined}>
        {formError ? <Alert variant="destructive">{formError}</Alert> : null}
        {children}
      </form>
    </FormStateContext>
  );
}

export function SubmitButton({ children, className, ...props }: ButtonProps) {
  const { pending } = useFormState();
  return (
    <Button type="submit" disabled={pending || props.disabled} className={className} {...props}>
      {pending ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
      {children}
    </Button>
  );
}

type FieldShellProps = {
  name: string;
  label: string;
  description?: string;
  required?: boolean;
  className?: string;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode;
};

function FieldShell({ name, label, description, required, className, children }: FieldShellProps) {
  const { errors } = useFormState();
  const id = useId();
  const error = errors[name]?.[0];
  const describedBy = error ? `${id}-error` : description ? `${id}-description` : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden>
            {" "}
            *
          </span>
        ) : null}
      </Label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {error ? (
        <p id={`${id}-error`} className="text-destructive text-xs">
          {error}
        </p>
      ) : description ? (
        <p id={`${id}-description`} className="text-muted-foreground text-xs">
          {description}
        </p>
      ) : null}
    </div>
  );
}

type BaseFieldProps = { name: string; label: string; description?: string; className?: string };

export function TextField({
  name,
  label,
  description,
  className,
  ...props
}: BaseFieldProps & Omit<React.ComponentProps<"input">, "name">) {
  return (
    <FieldShell name={name} label={label} description={description} required={props.required} className={className}>
      {(a11y) => <Input name={name} {...a11y} {...props} />}
    </FieldShell>
  );
}

export function TextareaField({
  name,
  label,
  description,
  className,
  ...props
}: BaseFieldProps & Omit<React.ComponentProps<"textarea">, "name">) {
  return (
    <FieldShell name={name} label={label} description={description} required={props.required} className={className}>
      {(a11y) => <Textarea name={name} {...a11y} {...props} />}
    </FieldShell>
  );
}

export type Option = { value: string; label: string };

export function SelectField({
  name,
  label,
  description,
  className,
  options,
  placeholder,
  ...props
}: BaseFieldProps & Omit<React.ComponentProps<"select">, "name"> & { options: Option[]; placeholder?: string }) {
  return (
    <FieldShell name={name} label={label} description={description} required={props.required} className={className}>
      {(a11y) => (
        <NativeSelect name={name} {...a11y} {...props}>
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      )}
    </FieldShell>
  );
}

export function CheckboxField({
  name,
  label,
  description,
  className,
  ...props
}: BaseFieldProps & Omit<React.ComponentProps<"input">, "name" | "type">) {
  const { errors } = useFormState();
  const id = useId();
  const error = errors[name]?.[0];
  return (
    <div className={cn("flex items-start gap-2", className)}>
      <Checkbox id={id} name={name} aria-invalid={Boolean(error)} className="mt-0.5" {...props} />
      <div className="space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
        {description ? <p className="text-muted-foreground text-xs">{description}</p> : null}
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </div>
    </div>
  );
}

/** Inline error for a field rendered without FieldShell (e.g. inside table rows). */
export function FieldError({ name, className }: { name: string; className?: string }) {
  const { errors } = useFormState();
  const error = errors[name]?.[0];
  return error ? <p className={cn("text-destructive text-xs", className)}>{error}</p> : null;
}

/** Whether the server reported an error for a field (for aria-invalid on custom inputs). */
export function useFieldInvalid(name: string): boolean {
  const { errors } = useFormState();
  return Boolean(errors[name]?.length);
}

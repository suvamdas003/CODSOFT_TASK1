"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { changePasswordSchema } from "@/lib/validation/users";

type Values = z.input<typeof changePasswordSchema>;

const FIELDS: { name: keyof Values; label: string; autoComplete: string }[] = [
  { name: "currentPassword", label: "Current password", autoComplete: "current-password" },
  { name: "newPassword", label: "New password", autoComplete: "new-password" },
  { name: "confirmPassword", label: "Confirm new password", autoComplete: "new-password" },
];

/** Uses the rate-limited Better Auth endpoint; other sessions are signed out. */
export function ChangePasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState } = useForm<Values>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const { error: apiError } = await authClient.changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      revokeOtherSessions: true,
    });
    if (apiError) {
      setError(
        apiError.status === 429
          ? "Too many attempts. Wait a minute and try again."
          : "The current password is incorrect.",
      );
      return;
    }
    reset();
    toast.success("Password changed. Other devices have been signed out.");
  });

  return (
    <form onSubmit={onSubmit} className="max-w-sm space-y-4" noValidate>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      {FIELDS.map((field) => (
        <div key={field.name} className="space-y-1.5">
          <Label htmlFor={field.name}>{field.label}</Label>
          <Input
            id={field.name}
            type="password"
            autoComplete={field.autoComplete}
            aria-invalid={Boolean(formState.errors[field.name])}
            {...register(field.name)}
          />
          {formState.errors[field.name] ? (
            <p className="text-destructive text-xs">{formState.errors[field.name]?.message}</p>
          ) : null}
        </div>
      ))}
      <Button type="submit" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
        Change password
      </Button>
    </form>
  );
}

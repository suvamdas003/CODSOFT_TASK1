"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Button, buttonVariants, type ButtonProps } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/action-result";

type ConfirmActionProps = {
  /** A server action with its arguments already bound, e.g. deleteX.bind(null, id). */
  action: () => Promise<ActionResult<unknown>>;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  children: ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  destructive?: boolean;
  redirectTo?: string;
};

/** Button that asks for confirmation before running a destructive or irreversible action. */
export function ConfirmAction({
  action,
  title,
  description,
  confirmLabel = "Confirm",
  children,
  variant = "outline",
  size = "sm",
  destructive = true,
  redirectTo,
}: ConfirmActionProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm(event: React.MouseEvent) {
    event.preventDefault();
    startTransition(async () => {
      let result: ActionResult<unknown>;
      try {
        result = await action();
      } catch {
        result = { ok: false, error: "Could not reach the server. Try again." };
      }
      if (result.ok) {
        toast.success(result.message ?? "Done.");
        setOpen(false);
        const target = result.redirectTo ?? redirectTo;
        if (target) router.push(target);
        else router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant={variant} size={size}>
          {children}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirm}
            disabled={pending}
            className={buttonVariants({ variant: destructive ? "destructive" : "default" })}
          >
            {pending ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
            {confirmLabel}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

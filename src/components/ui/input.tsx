import type * as React from "react";
import { cn } from "@/lib/utils/cn";

const fieldBase =
  "w-full min-w-0 rounded-md border border-input bg-card px-3 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20";

export function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return <input type={type} className={cn(fieldBase, "h-9 py-1", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "min-h-20 py-2", className)} {...props} />;
}

/** Native <select>: accessible, works without JavaScript and on every mobile browser. */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(fieldBase, "h-9 py-1 pr-8", className)} {...props} />;
}

export function Checkbox({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      type="checkbox"
      className={cn("border-input size-4 rounded accent-[var(--primary)] disabled:opacity-50", className)}
      {...props}
    />
  );
}

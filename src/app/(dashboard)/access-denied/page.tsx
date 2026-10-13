import { ShieldAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Access denied" };

export default function AccessDeniedPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
      <ShieldAlertIcon className="text-destructive size-10" aria-hidden />
      <h1 className="text-xl font-semibold">Access denied</h1>
      <p className="text-muted-foreground text-sm">
        Your account does not have permission to open this page. If you think this is a mistake, contact an
        administrator.
      </p>
      <Button asChild>
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}

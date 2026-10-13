"use client";

import { Button } from "@/components/ui/button";

/** Error boundary for dashboard pages. Shows no internals; details stay in server logs. */
export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground text-sm">
        The page could not be loaded. Try again, and contact an administrator if the problem continues.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}

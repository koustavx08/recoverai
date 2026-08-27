"use client";

import { useEffect } from "react";
import { AlertOctagon } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    console.error("[web:error]", error);
  }, [error]);

  return (
    <div className="flex h-dvh w-full flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <AlertOctagon className="h-8 w-8 text-danger" strokeWidth={1.5} />
      <p className="text-sm font-medium text-foreground">Something went wrong loading this page</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        This is a rendering error in the dashboard itself, not a payment or recovery failure — no
        recovery action was affected.
      </p>
      {error.digest ? (
        <code className="rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
          {error.digest}
        </code>
      ) : null}
      <Button onClick={reset} variant="outline" size="sm" className="mt-2">
        Try again
      </Button>
    </div>
  );
}

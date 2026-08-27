import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex h-dvh w-full flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <Compass className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
      <p className="text-sm font-medium text-foreground">Page not found</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        There&apos;s nothing at this address — it might be a transaction id that isn&apos;t in the
        ingested dataset, or a route that doesn&apos;t exist yet.
      </p>
      <Link href="/dashboard" className={buttonVariants({ variant: "outline", size: "sm", className: "mt-2" })}>
        Back to dashboard
      </Link>
    </div>
  );
}

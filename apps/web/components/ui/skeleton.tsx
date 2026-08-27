import { cn } from "@/lib/utils";

/** Pure CSS pulse placeholder — no client JS, safe inside a route's `loading.tsx`. */
export function Skeleton({ className }: { readonly className?: string }) {
  return <div className={cn("animate-pulse rounded bg-muted", className)} />;
}

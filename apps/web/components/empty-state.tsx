import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
  readonly hint?: string;
  readonly className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  hint,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded border border-dashed border-border px-6 py-16 text-center",
        className,
      )}
    >
      <Icon className="mb-2 h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {hint ? (
        <code className="mt-3 rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
          {hint}
        </code>
      ) : null}
    </div>
  );
}

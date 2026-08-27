import { Check, Circle, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "done" = this stage ran and the pipeline continued past it.
 * "success" | "warning" | "danger" | "neutral" = this stage ran and is
 * where the pipeline concluded — colored by the final `PipelineStatus`.
 * "not-reached" = the pipeline stopped before this stage ever ran.
 */
export type StageStatus = "done" | "success" | "warning" | "danger" | "neutral" | "not-reached";

export interface StageTrackerItem {
  readonly key: string;
  readonly label: string;
  readonly status: StageStatus;
}

const STATUS_STYLES: Readonly<Record<StageStatus, string>> = {
  done: "border-accent/40 bg-accent/10 text-accent",
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  danger: "border-danger/40 bg-danger/10 text-danger",
  neutral: "border-border bg-muted text-muted-foreground",
  "not-reached": "border-dashed border-border text-muted-foreground/50",
};

/** Compact, honest visual of how far a transaction actually got through the pipeline — never decorative filler. */
export function StageTracker({
  items,
  className,
}: {
  readonly items: readonly StageTrackerItem[];
  readonly className?: string;
}) {
  return (
    <ol className={cn("flex flex-wrap items-center gap-y-2", className)}>
      {items.map((item, index) => (
        <li key={item.key} className="flex items-center">
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap",
              STATUS_STYLES[item.status],
            )}
          >
            {item.status === "not-reached" ? (
              <Circle className="h-3 w-3" />
            ) : item.status === "danger" ? (
              <X className="h-3 w-3" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            {item.label}
          </span>
          {index < items.length - 1 ? (
            <span className="mx-1 h-px w-3 shrink-0 bg-border sm:w-4" aria-hidden="true" />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

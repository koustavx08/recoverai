import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  readonly label: string;
  readonly value: string;
  readonly helper: string;
  readonly icon: LucideIcon;
}

export function StatCard({ label, value, helper, icon: Icon }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <span className="text-2xl font-semibold tabular-nums text-foreground">
            {value}
          </span>
          <span className="text-xs text-muted-foreground">{helper}</span>
        </div>
        <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
      </CardContent>
    </Card>
  );
}

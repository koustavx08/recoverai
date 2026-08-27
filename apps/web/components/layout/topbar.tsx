import { Badge } from "@/components/ui/badge";
import { MobileNavToggle } from "./mobile-nav-toggle";

interface TopbarProps {
  readonly title: string;
  readonly description?: string;
}

export function Topbar({ title, description }: TopbarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <MobileNavToggle />
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-foreground">{title}</h1>
          {description ? (
            <p className="hidden truncate text-xs text-muted-foreground sm:block">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      <Badge variant="accent" className="shrink-0">
        Simulator mode
      </Badge>
    </header>
  );
}

import { Badge } from "@/components/ui/badge";

interface TopbarProps {
  readonly title: string;
  readonly description?: string;
}

export function Topbar({ title, description }: TopbarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-6">
      <div>
        <h1 className="text-sm font-semibold text-foreground">{title}</h1>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <Badge variant="accent">Simulator mode</Badge>
    </header>
  );
}
